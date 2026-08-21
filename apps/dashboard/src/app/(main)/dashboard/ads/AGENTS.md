# Google Ads Feature — Agent Notes

> Global dev rules live in the repo root [AGENTS.md](../../../../../../../AGENTS.md). This file
> only captures Google Ads-specific context that isn't obvious from the code.

## Maintain this file

**Whenever you change Google Ads code (this folder or `src/server/{google-ads,google-ads-actions}.ts`),
update this file in the same change.** A stale AGENTS.md is worse than none.

## Where the data comes from

- `src/server/google-ads.ts` — a thin REST client for the Google Ads API
  (`googleAds:search`, GAQL). No SDK dependency: the official Node clients are
  gRPC-heavy, and plain `fetch` + `google-auth-library` covers read-only
  reporting. The API version is **pinned** (`API_VERSION`); Google sunsets
  versions roughly yearly, so bumping it is a deliberate change.
- `src/server/google-ads-actions.ts` — `"use server"` actions per section
  (`fetchAdsKpis`, `fetchAdsTrend`, `fetchAdsDevices`, `fetchAdsCampaigns`,
  `fetchAdsSearchTerms`, `fetchAdsKeywords`, `fetchAdsLocations`,
  `testGoogleAdsConnection`), plus the one write: `excludeSearchTerm`.
- Auth: prod wants `GOOGLE_ADS_CLIENT_ID`/`GOOGLE_ADS_CLIENT_SECRET`/
  `GOOGLE_ADS_REFRESH_TOKEN` (OAuth user with MCC access); without them the
  client falls back to Application Default Credentials — which is how local
  dev works (the machine's gcloud ADC carries the adwords scope, see
  `Web/Tools/NOTES.md`). `GOOGLE_ADS_DEVELOPER_TOKEN` and
  `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (the manager account) are always required.

## Tenant isolation — non-negotiable

Same model as Analytics: the customer ID is resolved **server-side only** from
the VERIFIED caller's active org (`getActiveOrgId()` in `src/server/auth.ts`)
via `getActiveOrgConfig()` → `config.googleAdsCustomerId` (set on the Tenants
page; dashes allowed, digits are extracted). There is **no env fallback at
all** (`GOOGLE_ADS_CUSTOMER_ID` no longer resolves anything) — a request with
no valid session resolves null and gets the config-missing result, which is
the auth gate for these publicly reachable Server Action endpoints. Never
accept a customer ID from the client.

## Rules that are easy to break

- **All tab sections render server-side every request** (same `<Tabs>` pattern
  as Analytics) — one page load fires all 8 actions (~9 API queries; Locations
  runs two). That's fine for the Ads API quota (15k ops/day at basic access),
  which is also why there's no concurrency limiter here, unlike `ga4.ts`.
- **REST returns int64 metrics as strings** (`clicks: "73"`, `costMicros`),
  doubles as numbers (`ctr`, `conversions`, impression shares). `toInt`/
  `microsToDollars` in the actions handle this; keep new fields consistent.
- **Money is micros** — divide by 1e6. Actions return dollars (raw numbers);
  cells format for display. Impression shares are fractions 0–1 and can be
  **absent** when Google withholds them (low volume) — keep them nullable.
- **Named ranges resolve to explicit dates in the account's timezone**
  (`ACCOUNT_TIME_ZONE`, currently a constant: America/New_York). GAQL has no
  GA4-style "today" token with an implicit property timezone, so the server
  computes the dates. Single-day ranges switch the trend to `segments.hour`.
- **The default range is `this-month`** (page + toolbar + `rangeToDates` all
  agree on this — keep them in sync). It resolves server-side as first of the
  current month → today in the account's timezone. `last-4-weeks` is still a
  recognized token for old URLs but is no longer offered or defaulted.
- **`keyword_view` includes ad-group-level negative keywords** — the Keywords
  query must keep `ad_group_criterion.negative = FALSE` or exclusions show up
  as if they were bid-on keywords (found live: two EXACT negatives leaked in).
- **The trend fills empty buckets** — the API omits zero days/hours entirely,
  so the action reconstructs the full axis.
- **The KPI comparison is one query, split in JS** — current + previous
  windows can be disjoint (year-to-date compares to last year), so rows are
  bucketed per `segments.date`, not assumed contiguous.
- **`?range=` is shared vocabulary with Analytics** (named tokens +
  `YYYY-MM-DD_YYYY-MM-DD`), but there is no `?campaign=` here — Ads campaigns
  are entities, not GA4 session dimensions.
- **Locations is a two-query report**: `user_location_view` (where users
  physically were) returns cities as `geoTargetConstants/<id>` resource names,
  so a second `geo_target_constant` query resolves display names. Rows are
  aggregated per (city, `targeting_location`); `targeting_location: false`
  renders the "Outside target" badge — that flag is the tell for geo-leak
  spend (the account's week-1 problem), don't drop it.
- Setup/error states reuse `AnalyticsSetupRequired` from
  `../analytics/_components` — it keys off "not configured" in the message, so
  keep that phrasing in `CONFIG_MISSING_ERROR`.
- **`excludeSearchTerm` is the only mutate — keep its rules.** It adds the
  term as an **EXACT-match** negative (one-click excludes must not have broad
  collateral). Destination: the negative-keyword **shared list** linked to the
  term's campaign first (the Sarvian account keeps all negatives in one shared
  list — don't reintroduce campaign-level negatives there), falling back to a
  campaign-level negative only when no list is linked. The campaign id comes
  from the row, but the customer is still cookie-resolved server-side, so a
  spoofed campaign id can't cross tenants. On success the row flips to
  Excluded **optimistically** — deliberately no `router.refresh()`:
  `search_term_view` lags the mutate by hours, so a refetch shows nothing new
  AND resets TanStack pagination (losing the user's place on page N). The
  server data catches up on its own. Payload shape was verified with
  `validateOnly: true` before shipping; do the same for any new mutate.
- **Search Terms triage: state is derived onto the row, not read from `meta`.**
  Google's five-value `search_term_view.status` collapses to three
  (`SearchTermState`): `ADDED` → Added, `EXCLUDED`/`ADDED_EXCLUDED` → Excluded,
  `NONE`/`UNKNOWN` → **Review** (the ones you haven't acted on — the actionable
  bucket, and most of the table). The optimistic-exclusion `Set` feeds a
  `useMemo` that stamps `state` on each row _before_ the table sees it, because
  a sortable Status column has to be able to **move** an excluded row, not just
  recolor it — a `meta` lookup can't reach TanStack's sorting or filtering.
  Sorting uses `STATE_RANK` (Review first), not the labels' alphabetical order;
  TanStack's stable sort keeps the server's cost-descending order inside each
  group, so the expensive Review terms surface first.
- **Search Terms owns its own card; the other three sections don't.** Its
  header toolbar needs the table instance, so `AdsSearchTermsTable` renders
  `TableCard` itself (`table-card.tsx` is a separate file so the server
  sections and this client component can both import it). The section only
  wraps the error state.
- **The Search Terms toolbar drives `columnFilters` one-way.** `query`/`scope`/
  `status` are plain `useState` in `AdsSearchTermsTable`; a `useMemo` builds the
  `ColumnFiltersState` the table reads. There is **no `onColumnFiltersChange`**
  and there shouldn't be one unless something inside the table starts setting
  filters — and if that happens, the toolbar state has to become the derived
  side, not both. Because the table never calls `setColumnFilters`, TanStack's
  `autoResetPageIndex` can't fire, so every toolbar handler calls
  `table.setPageIndex(0)` itself; drop that and a filter applied on page 12
  lands you on an empty page.
  - Scoped search is a **column filter on `term`** that reads two fields — its
    value carries `{ query, scope }`. A global filter would re-run per
    filterable column and still need per-column opt-outs to keep the numeric
    columns out of the match.
  - The status filter is **multi-select checkboxes**, not a radio — the point
    is excluding a status (usually hiding Excluded), which single-select can't
    express. State is a `Set<SearchTermState>`; the filter value is that set
    spread to an array and matched with a custom `statusFilter` fn. It is
    pushed **only when something is unchecked**, so the all-checked default
    costs no filter pass. Unchecking everything empties the table on purpose —
    that's the literal reading, and the toolbar is right there to undo it.
  - `DropdownMenuCheckboxItem` needs `onSelect={(e) => e.preventDefault()}` or
    Radix closes the menu on every toggle (same as `project-items.tsx`).

## Not built yet (deliberately)

- Ads/assets tab, per-campaign drill-down, auction insights (auction insights
  is not exposed by the API at all).
- PDF export.
