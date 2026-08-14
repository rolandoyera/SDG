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
the `ACTIVE_ORG_COOKIE` via `getActiveOrgConfig()` → `config.googleAdsCustomerId`
(set on the Tenants page; dashes allowed, digits are extracted). With an active
org there is **no env fallback**; `GOOGLE_ADS_CUSTOMER_ID` applies only when no
org cookie exists. Never accept a customer ID from the client.

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
- **The default range is `last-4-weeks`, not `today`** (page + toolbar agree
  on this). Ads reporting lags: `search_term_view` badly undercounts recent
  days, and metrics settle upward for ~2 days — a same-day default would look
  broken.
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
  spoofed campaign id can't cross tenants. On success the row's badge flips
  to Excluded **optimistically** (table `meta` state) — deliberately no
  `router.refresh()`: `search_term_view` lags the mutate by hours, so a
  refetch shows nothing new AND resets TanStack pagination (losing the user's
  place on page N). The server data catches up on its own. Payload shape was
  verified with `validateOnly: true` before shipping; do the same for any new
  mutate.

## Not built yet (deliberately)

- Ads/assets tab, per-campaign drill-down, auction insights (auction insights
  is not exposed by the API at all).
- PDF export.
