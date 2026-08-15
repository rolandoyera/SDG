# Instagram / Meta Integration — Where We Stand

Goal: connect each tenant's Instagram Business account (via the Facebook Graph API)
and surface its analytics in the dashboard, the same multi-tenant way GA4 works.

Status as of 2026-08-14: **connect flow + full analytics dashboard + daily snapshot
cron are live at `/dashboard/instagram`.** Day-to-day conventions live in
[`src/app/(main)/dashboard/instagram/AGENTS.md`](<src/app/(main)/dashboard/instagram/AGENTS.md>)
— that file is the source of truth for how the feature works; this one only tracks
what's left to build.

## What's built (done)

- [x] **OAuth connect end-to-end** — login route (CSRF nonce, org from cookie),
      callback (code → long-lived token → Page token), split storage (display config on
      the org doc, token in the locked-down `secrets/meta` subcollection), multi-Page
      picker, success dialog + URL hygiene. Connect UI lives on the Instagram page
      (moved from Company).
- [x] **`instagram_manage_insights` scope** — enabled in the Meta App Dashboard
      (the 2026-06 blocker is resolved; insights endpoints all return data).
- [x] **Analytics dashboard** (`/dashboard/instagram`, replaced the old
      `/dashboard/marketing` first cut): KPI strip (reach, views, likes, comments,
      profile visits, accounts engaged, website taps) with snapshot fallback, daily
      reach trend, follower/new-followers headline cards, audience demographics
      (city/country/age/gender), posts grid with thumbnails, shared `DateRangePicker`
      range handling.
- [x] **Daily snapshot cron** (`/api/cron/instagram-snapshots`, 06:00 UTC) — one doc
      per day per org at `instagramSnapshots/{YYYY-MM-DD}`; the only source of
      long-range history (Meta never backfills).
- [x] **Profile display refresh (2026-08-14):** the cron re-fetches the profile
      (`fetchProfileDisplay`) and rewrites the `config.metaIntegration` display cache —
      `instagramProfilePictureUrl` is a signed, expiring CDN URL, and the copy stored at
      connect time eventually 403'd (avatar decayed to initials). Heals on the next
      cron run after deploy.
- [x] **Old ecommerce mock components deleted (2026-08-14)** — `kpi-strip`,
      `store-traffic`, `top-products`, `traffic-sources`, `inventory`,
      `customer-reviews` removed from `instagram/_components/`.

## Token lifecycle (reference)

| Token                          | Lifespan                 | What we do with it                   |
| ------------------------------ | ------------------------ | ------------------------------------ |
| User token from OAuth `code`   | ~1 hour                  | Exchanged immediately, never stored  |
| Long-lived user token          | ~60 days                 | Used once to fetch the Page token    |
| **Page access token** (stored) | Effectively non-expiring | All future Instagram Graph API calls |

The stored Page token is the durable one. "Non-expiring" still breaks if the user changes
their Facebook password, revokes the app, or Meta forces a refresh — see the recovery task.

## Remaining tasks

- [ ] **Token-invalidation recovery:** when a Graph call returns error code `190`
      (token expired/invalid), mark the integration disconnected and surface a
      "Reconnect Instagram" prompt. The cron now hits the token daily, so a dead token
      currently just fails silently every morning — this is actionable now.
- [x] **Follower growth chart (2026-08-14):** Followers card beside the Reach chart,
      drawn from the stored snapshots (`fetchInstagramFollowerTrend`) — follows the
      range picker past Meta's 30-day cap, needs no Graph call, badge shows the net
      change over the range. Points exist from the cron's first run (2026-06) onward.
- [ ] **Per-post insights columns:** per-media insights are confirmed working
      (`reach, views, saved, likes, comments, shares, total_interactions`; one Graph
      call per post). Would upgrade the posts UI from likes/comments to
      Reach / Views / Saves / Interactions. Handle subcode `2108006` gracefully
      (posts from before business conversion return an error — show "—").
- [ ] **Reached audience demographics** (`reached_audience_demographics`): city /
      country / age / gender of accounts _reached_ (needs a `timeframe` param).
      **Probe first** — depends on recent activity; may be empty for quiet accounts.
- [ ] **Engaged audience demographics** (`engaged_audience_demographics`): same cuts
      for accounts that _engaged_. Same `timeframe` + probe-first caveat.
- [ ] **Combined breakdowns:** request `breakdown=age,gender` in one call for
      cross-cuts like "women 25-34" (current calls are single-dimension).
- [ ] **Show full demographic lists:** cards cap at top 6 (`slice(0, 6)` in
      `instagram-demographics.tsx`); drop or expand if full lists are wanted.
- [ ] **Pending-token cleanup (minor):** if a user reaches the Page picker but never
      selects, the `secrets/metaPending` user token lingers until a reconnect
      overwrites it. Harmless and server-only; sweep on a TTL if we want it tidy.

## Not available (so we don't chase it)

- Language / locale breakdown — the old `audience_locale` metric is deprecated; no replacement.
- Gender is only M / F / U; age uses fixed buckets (13-17 … 65+).

## Notes

- All token handling and Firestore writes go through `firebase-admin` (`getAdminDb()`),
  bypassing security rules — same trust model as the GA4 integration.
- Env vars: `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`.
