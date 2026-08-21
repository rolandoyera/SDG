# Analytics Feature — Agent Notes

> Global dev rules live in the repo root [AGENTS.md](../../../../../../../AGENTS.md). This file
> only captures Analytics-specific context that isn't obvious from the code.

## Maintain this file

**Whenever you change Analytics code (this folder or the `src/server/{ga4,gsc,analytics-actions,
search-console-actions,org-config}.ts` modules), update this file in the same change.** If a fact
here is now wrong, correct it; if you add/remove a data source, action, tab, or convention, reflect
it. A stale AGENTS.md is worse than none — treat updating it as part of "done," not optional.

## Where the data comes from

Server logic lives in `src/server/`, not this folder. Two external APIs, two separate quotas:

- `ga4.ts` — the GA4 Data API client singleton (`getGA4Client`). Creds via service account
  (`GA_SERVICE_ACCOUNT_KEY`) or legacy OAuth. **All report calls are funneled through one
  process-wide concurrency limiter** wrapped onto `runReport`/`runRealtimeReport` (see below).
- `analytics-actions.ts` — `"use server"` actions for every GA4-backed section
  (`fetchKpiData`, `fetchTrafficTrend`, `fetchRealtimeData`, `fetchTopPagesData`,
  `fetchTrafficSources`, `fetchAudienceData`, `fetchAcquisitionData`, `fetchLandingPages`,
  `fetchConversionsData`, `testGA4Connection`), plus `fetchWebsiteVisits` — the home page's
  "Website Visits" metric card (fixed last-30-days vs previous-30-days `sessions` comparison,
  independent of the `?range=` presets; hidden when GA4 isn't configured for the org).
- `gsc.ts` / `search-console-actions.ts` — Google Search Console (the "Google" tab only). A
  **different** API and quota from GA4; `fetchSearchTotals`/`fetchTopSearchQueries`/`fetchTopSearchPages`.
- `org-config.ts` — `getActiveOrgConfig()`, the single verified-caller-scoped read of
  `organizations/{orgId}.config` shared by both the GA4 and GSC property/site resolvers.

## Tenant isolation — non-negotiable

Property/site are resolved **server-side only**, from the VERIFIED caller's active org
(`getActiveOrgId()` in `src/server/auth.ts`), never from caller input.
`getConfiguredPropertyId` (GA4) and `getConfiguredSiteUrl` (GSC) read
`getActiveOrgConfig()`: only the caller's org `config.gaPropertyId` / `config.gscSiteUrl`
counts — **no env fallback at all** (`GA_PROPERTY_ID`/`GSC_SITE_URL` env vars no longer
resolve anything). A request with no valid session resolves null and gets the
config-missing result; Server Actions are publicly reachable endpoints, so this is the
auth gate — don't reintroduce an env fallback. Never add a propertyId/siteUrl prop or
action argument — that would let a client spoof another tenant. The Admin SDK in
`org-config.ts` bypasses security rules; keep it server-only.

## Rules that are easy to break

- **All tab sections render server-side every request, even inactive tabs.** Sections passed as
  `children` into the client `<Tabs>`/`<TabsContent>` (see [page.tsx](./page.tsx)) are still
  executed on the server to build the RSC payload. So one page load fans out **every** section's
  actions, not just the visible tab's — ~21 GA4 reports total. This is a deliberate tradeoff for
  instant tab switching — don't "fix" it by making the active tab URL-backed. Top Pages renders on
  both Overview and Engagement, but `fetchTopPagesData` is `React.cache`-wrapped so the same-args
  duplicate collapses to one report per request.
- **GA4 has a concurrent-request cap.** That ~19-report fan-out (plus dev Fast Refresh re-firing
  it on every save) blows the quota → `RESOURCE_EXHAUSTED`. The limiter in `ga4.ts`
  (`MAX_CONCURRENT_GA4_REQUESTS = 5`) is the guard: it queues excess calls instead of failing.
  Don't bypass it by calling the GA4 SDK directly — always go through `getGA4Client()`.
- **The org-config read is deduped with `React.cache()`.** `getActiveOrgConfig` collapses what
  used to be one `organizations/{orgId}` read per section into one read per request. Don't
  reintroduce per-section org reads.
- **`window.__dbStats()` does not see Analytics reads.** It only counts `trace()`-wrapped ops
  (`trace()` and `__dbStats` are defined in `src/lib/db-trace.ts`, and called only from
  `src/lib/db.ts`). The Admin-SDK org read and the GA4/GSC API calls go through neither, so they're
  invisible to it — expect the panel to under-report on this route.
- **Connection status is checked during SSR.** `page.tsx` awaits `testGA4Connection()` and renders the
  result as a ping indicator next to the page title (green = connected, red = not). No separate
  client-side check, so a page visit produces a single `getActiveOrgConfig` read from this path.
- **The Conversions form funnels depend on a GA4 custom dimension.** `fetchConversionsData`
  splits `form_start` **and** `contact_form_error` by the `form_type` event param in one guarded
  query (`customEvent:form_type`). GA4 400s on unregistered custom dimensions, so that query runs
  in its own try/catch and falls back to zeros; the card then shows the aggregate `form_start`
  count with a register-the-dimension hint. The dimension must be registered in GA4 Admin (event
  scope, param `form_type`) and only collects from registration onward. Registration tooling:
  `Web/Tools/ga4-tools/ga4.py`. The error split feeds each funnel's **"Failed"** bar —
  `contact_form_error` is fired by the marketing site on any failed submit (reasons:
  turnstile_pending / server / network; `reason`/`status` params are visible in GA4's UI but not
  queried here — `reason` isn't a registered dimension). Failed isn't a funnel stage, so its
  tooltip rate reads vs Started, not the previous step; zero is the healthy state.
- **The Realtime card's badge is honest.** `fetchRealtimeData` runs **two** realtime reports
  (per-minute + country). The client card polls every 30s with an in-flight guard; a failed poll
  flips "Live" to a red "Stale" dot until the next success (refocus refetches immediately). Never
  let a failed poll keep rendering old numbers under the green "Live" badge.
  `realtime-card.test.tsx` protects the Live → Stale → Live transition and the in-flight guard.
- **KPI `change` strings carry a "New" sentinel.** When the comparison baseline is 0 and the
  current value isn't, `getKpiMetrics` (and its siblings in `google-ads-actions`/`meta-actions`/
  `fetchWebsiteVisits`) return `change: "New"` instead of a fake "0.0%" — `parseFloat("New")` is
  NaN, so the strips' `parseFloat(change) === 0` "No change" branch doesn't swallow it and the
  trend badge renders "New". Keep that invariant if you touch the comparison math.
  Server-action tests cover both 0 → positive and 0 → 0, invalid range fallback, and the
  request-scoped Top Pages cache contract.
- **Analytics tables are TanTable + raw numbers.** All tab tables (Top Pages, Landing Pages,
  Leads by Channel, Acquisition, Google Search, and the shared `GeoTable`) render through
  `@/components/ui/tan-table` (`TanTable` + `SortableHeader`) with client-side sorting and a
  10-per-page pagination footer. Their server actions return **raw numbers** (counts, fractions)
  and cells format for display — never reintroduce pre-formatted strings ("1.0k", "3.1%") into
  row data, they sort alphabetically. GA4 table queries run uncapped (API default limit);
  GSC uses `rowLimit: 1000`. The PDF report (`AnalyticsReport`) shows top-10 slices of the same
  uncapped data and does its own formatting.
- **Range comes from `?range=` search param**, default `today`, threaded as a `range` prop
  into sections. The toolbar is the shared `DateRangePicker` (`@/components/date-range-picker`,
  default presets); it encodes single days as
  the named tokens `today`/`yesterday` (GA4 resolves those in the property's timezone) and
  everything else as `YYYY-MM-DD_YYYY-MM-DD`. The legacy named values (`last-7-days`,
  `last-4-weeks`, `last-3-months`, `year-to-date`) are still accepted server-side so old links
  keep working. `parseCustomRange` validates beyond shape — real calendar days and
  start ≤ end — because a hand-typed `2026-99-99` used to throw from `toISOString()` inside
  `fetchKpiData`'s date math (which runs before its try/catch) and, with no `error.tsx`
  boundary anywhere, crashed the whole route. Malformed custom ranges now fall back to the
  default range; don't add date math on `?range=` outside that validated path. Single-day ranges (named or custom) switch GA4 trend dimensions to hourly
  (`dateHour`); there is no rolling "last 24 hours" — GA4 date ranges are whole calendar days.
  KPI comparisons for custom ranges use the equal-length window immediately before. Search
  Console clamps a custom range's end to its ~3-day data lag and falls back to its 28-day
  default when the selection lies entirely inside the lag window (so `today`/`yesterday` too).
- **Campaign filter comes from `?campaign=`** (no param = all campaigns). The toolbar dropdown's
  options come from `fetchCampaignOptions(range)` (one extra GA4 report per page load, fetched in
  `page.tsx`); "(not set)"/"(direct)" are kept deliberately — they're real GA4 buckets. Every
  GA4-backed section action takes `campaign` as its second arg and applies a session-scoped
  `sessionCampaignName` EXACT filter via `campaignFilter`/`mergeFilters` (the merge matters for
  the Conversions queries that already have their own `dimensionFilter`). The Realtime card
  (realtime API) and the Google tab (Search Console — no campaign concept) are NOT filtered.
  `fetchWebsiteVisits` (home card) is also unfiltered by design. The export report link and the
  report's back-link both carry the param.

## Form-error alert cron (`src/server/form-error-alert.ts`)

A daily Vercel cron (`vercel.json`, 12:00 UTC, `/api/cron/form-error-alert`, CRON_SECRET bearer —
same pattern as the other crons) queries yesterday's `contact_form_error` + `turnstile_error`
counts for every org with a `config.gaPropertyId` and emails an alert (via `brevo.ts`;
sender/recipient constants at the top of the module — the sender must stay on Brevo's verified
list) only when nonzero. It exists because GA4 custom insights cannot target a specific event
name (no Event name segment dimension; metrics are property-wide aggregates), and marking the
error events as Key Events would inflate the `keyEvents` metric this tab reports. Daily, not
hourly, because GA4 standard reporting data lags up to a day. No email = no errors.

## Document / PDF export — separate from the dashboard UI

Dashboard analytics is the interactive screen app. The exportable report is a **separate document
UI**, intentionally designed as a client-facing document rather than a printable dashboard. Do not
reuse this folder's section components in the report or try to mirror the dashboard layout.

- Entry point: the toolbar's "Export report" item opens `/reports/analytics?range=<currentRange>`
  in a new tab.
- Route: `src/app/(main)/reports/analytics` — **outside** the dashboard shell (no sidebar/header),
  still behind the `(main)` AuthGuard. The page fetches the same GA4 actions (`fetchKpiData`,
  `fetchTrafficTrend`, `fetchTopPagesData`, `fetchTrafficSources`, `fetchAudienceData`) and passes
  the **data** into a presentational document component. Same `ga4.ts` limiter, tenant-isolation,
  and concurrency rules as above.
- Document system: `src/components/reports/` — `ReportShell`/`ReportSection` (generic foundation,
  reused by future `ProposalReport`/`InvoiceReport`) and `analytics/AnalyticsReport.tsx` (the
  analytics document; its own layout/typography/tables, reusing only chart _primitives_).
- Presentation lives in the components; `src/styles/report.css` is minimal — pins a light palette
  so the dark theme can't bleed in, plus `@page`/page-break primitives. PDF is the browser print
  dialog for now (Playwright-rendered PDFs of this route likely later). Company identity is from
  `APP_CONFIG` until a DB company record exists.
