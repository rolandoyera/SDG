# Instagram Feature — Agent Notes

> Global dev rules live in the repo root [AGENTS.md](../../../../../../../AGENTS.md). This file
> only captures Instagram-specific context that isn't obvious from the code.

## Maintain this file

**Whenever you change Instagram code (this folder or the `src/server/meta-*.ts` modules), update
this file in the same change.** If a fact here is now wrong, correct it; if you add/remove a
data source, action, cron, or convention, reflect it; when the TEMP section ships or is removed,
delete it. A stale AGENTS.md is worse than none — treat updating it as part of "done," not optional.

## Where the data comes from

Server logic lives in `src/server/`, not this folder:

- `meta-graph.ts` — raw Graph API calls (`GRAPH = .../v22.0`). Reads creds via `getStoredMetaCreds`.
- `meta-actions.ts` — `"use server"` actions the UI calls.
- `meta-snapshots.ts` — daily history + the `getLatestSnapshot` fallback helper. **Not** `"use server"` (internal, not a public action).

## The connect flow lives here (moved from /dashboard/company)

`_components/instagram-connect.tsx` ("use client") owns connecting:

- **Disconnected** → a centered "Connect your Instagram" empty-state card (the page body renders
  nothing else when `getMetaConnection()` is null). Connect button → `/api/integrations/meta/login`.
- **Multi-Page grant** → the callback redirects to `?meta=select`; `page.tsx` fetches
  `getMetaPendingPages()` (only on that param) and the component opens a picker. On pick it calls
  `selectMetaPage` then does a full `window.location.assign("/dashboard/instagram?meta=connected")`
  so the server re-renders with the data tabs + success dialog in one shot.
- **Single Page** → callback connects directly and lands on `?meta=connected` (success dialog).
- URL hygiene: `replaceState` to `/dashboard/instagram` strips `?meta=…` so reloads don't re-fire.

All `?meta=…` redirects point at `/dashboard/instagram` (callback `route.ts`, login `route.ts`'s
`no_org`, and `revalidatePath` in `meta-actions.ts`). The OAuth `redirect_uri` registered with Meta
is unchanged — it's still `/api/integrations/meta/callback` (`META_REDIRECT_URI`); only the
post-callback landing page moved.

**No Disconnect in the UI by design.** `disconnectMeta` stays in `meta-actions.ts` for later
SuperAdmin exposure, but nothing surfaces it. To switch accounts, reconnect (the callback upserts).

## Two data modes — keep them straight

1. **Live (on-demand):** most UI pulls from the Graph API at request time (`cache: "no-store"`).
   Always current; costs one Graph call per load. This is the default for reach, views, posts,
   demographics, headline, followers.
2. **Stored snapshots (history):** the daily cron writes one doc per day to
   `organizations/{orgId}/instagramSnapshots/{YYYY-MM-DD}`. This is the **only** source of
   long-range history — Meta only exposes rolling windows and never backfills. The
   **Followers chart** (`instagram-follower-trend.tsx` → `fetchInstagramFollowerTrend`) reads
   exclusively from here — no Graph call, so it renders even with a dead token, follows the
   range picker past Meta's 30-day cap, and simply has no points before the cron's first run
   (2026-06) or on days the cron missed.

## Rules that are easy to break

- **Nothing in `Page` awaits Firestore or the Graph API.** The App Router holds the previous route
  on screen until everything outside a Suspense boundary resolves. `page.tsx` therefore has two
  boundaries: `InstagramHeader` (header row: shared `ConnectionDot` + avatar, fallback is the same
  row with a pending dot) and `InstagramContent` (tabs + `InstagramConnect`, fallback is the shared
  `LoadingState` spinner, resolved content wrapped in `FadeIn`). Both read the connection through
  `cache(getMetaConnection)` so it's still one org-doc read per request. Same one-spinner pattern as
  Ads and Analytics — don't split the body into per-section boundaries, and don't hoist a fetch
  back into `Page`.
- **The `config.metaIntegration` profile fields are a display cache, NOT source of truth.**
  Snapshots are their only writer: the daily cron re-fetches the profile (`fetchProfileDisplay`)
  and refreshes `followersCount`, `mediaCount`, username/name, and `instagramProfilePictureUrl` —
  the picture URL is a signed, expiring CDN URL, so without this daily rewrite the avatar decays
  into the initials fallback. Display logic is `live ?? cached ?? "—"`. Do not write any of it on
  page load.
- **Snapshot fields mix levels and flows.** `followersCount` is a point-in-time level; `reach`,
  `views`, `profileViews`, `accountsEngaged`, `likes`, `comments`, `websiteClicks` are 24h flows.
  Don't chart them on the same axis.
- **Reach is unique-per-day.** Summing daily reach across days over-counts repeat viewers.
- **Fallback pattern:** `fetchInstagramKpis` tries live, and on Graph failure serves the latest
  snapshot with `source: "fallback"` + `asOf`. The strip shows an "As of {date}" label then.
  Only the strip has this — other live reads have no snapshot equivalent.
- **KPI zero baselines use the shared `New` convention.** A positive current value compared with
  zero returns `change: "New"`; zero → zero stays `"0.0%"`. `meta-actions.test.ts` protects both.
- **Range comes from `?range=`**, default `last-30-days`. The toolbar is the shared
  `DateRangePicker` (`@/components/date-range-picker`); it always encodes selections as
  `YYYY-MM-DD_YYYY-MM-DD`, while the legacy `last-N-days` names stay accepted (old links, the
  default). `rangeToWindows` in `meta-actions.ts` resolves both — custom ranges are UTC-midnight
  bounded, end-date inclusive, clamped to now, compared against the equal-length window
  immediately before — and feeds the KPI strip **and** the reach trend. The 30-day Graph API
  window cap is handled below it by `splitWindow` in `meta-graph.ts`, which chunks and sums.
  The strip's KPIs (reach, views, likes, comments, profile visits, accounts engaged, website
  taps) all follow the range; follower gains can't (Meta only exposes ~30 days of history).

- **Server render safety:** Instagram live read actions must catch credential, Firestore, and Graph
  failures and return `{ success: false }` instead of throwing. A bad Meta token or production
  secret issue should show panel-level fallback UI, not 500 the `/dashboard/instagram` RSC payload.

## The cron

- Route: `src/app/api/cron/instagram-snapshots/route.ts`. Auth via `Authorization: Bearer $CRON_SECRET`.
- Schedule: `vercel.json` → daily `0 6 * * *` (06:00 UTC). Vercel root dir is `apps/dashboard`.
- Loops every org where `config.metaIntegration.connected == true`; per-org errors are isolated.
- No manual/UI trigger by design — the daily cron is the only writer. If you ever need an on-demand
  capture, `snapshotInstagramForOrg(orgId)` in `meta-snapshots.ts` is the entry point.
