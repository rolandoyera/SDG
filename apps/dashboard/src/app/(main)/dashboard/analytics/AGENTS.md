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
- `org-config.ts` — `getActiveOrgConfig()`, the single cookie-scoped read of
  `organizations/{orgId}.config` shared by both the GA4 and GSC property/site resolvers.

## Tenant isolation — non-negotiable

Property/site are resolved **server-side only**, from the `ACTIVE_ORG_COOKIE`, never from caller
input. `getConfiguredPropertyId` (GA4) and `getConfiguredSiteUrl` (GSC) read
`getActiveOrgConfig()`: with an active org, only that org's `config.gaPropertyId` /
`config.gscSiteUrl` counts — **no env fallback**, so one tenant can never see another's data.
Env vars (`GA_PROPERTY_ID`, `GSC_SITE_URL`) apply **only** when there is no org cookie.
Never add a propertyId/siteUrl prop or action argument — that would let a client spoof another
tenant. The Admin SDK in `org-config.ts` bypasses security rules; keep it server-only.

## Rules that are easy to break

- **All tab sections render server-side every request, even inactive tabs.** Sections passed as
  `children` into the client `<Tabs>`/`<TabsContent>` (see [page.tsx](./page.tsx)) are still
  executed on the server to build the RSC payload. So one page load fans out **every** section's
  actions, not just the visible tab's — ~19 GA4 reports total.
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
- **Range comes from `?range=` search param**, default `today`, threaded as a `range` prop
  into sections. The single-day ranges (`today`, `yesterday`) switch GA4 trend dimensions to
  hourly (`dateHour`); there is no rolling "last 24 hours" — GA4 date ranges are whole calendar
  days. Search Console ignores single-day ranges (its data lags ~3 days) and falls back to its
  28-day default.

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
