# SEO Section

SEO tooling for the marketing site (sarviandg.com). In the main sidebar this
is the **Website → SEO** item ("Website" is just the group heading, not a
route); `/dashboard/seo` redirects to the first tool. The section's pages
live in the Docs-style secondary sidebar (`layout.tsx` +
`_components/seo-sidebar-nav.tsx`, cloned from `../docs`). To add a page:
create the route folder and add one item to the hardcoded list in
`seo-sidebar-nav.tsx`.

## Keyword Analyzer page (`keyword-analyzer/`)

Three tabs backed by `src/server/seo-actions.ts`:

- **Page** — the default tab: single-page report. Same component as Compare
  (`CompareTab single`) with the right side hidden, full-width summary and
  report, the 1/2/3-word phrase tables sharing one row, and its own
  localStorage keys (`seo-page-left`/`-right`) so it persists independently.
- **Compare** — two symmetric sides, each with a source dropdown: Live site /
  Unpublished / any saved competitor / Custom URL / (right only) None. Sitemap
  sources get a searchable page picker (the shared `SearchSelect` from
  `src/components/`, loaded lazily per source, manual-path fallback);
  left defaults to Live, right to None. The before/after workflow is
  Unpublished left vs Live right of the same path. Form is RHF + Zod. Each side
  has a ⋮ actions dropdown: Visit Page (new tab; homepage when no page is
  picked yet) and Clear Results (clears that side's results + saved state, no
  confirm). Each side persists independently in localStorage
  (`seo-compare-left` / `seo-compare-right`, validated against known source
  keys on restore) and auto-reruns on mount — instant while the server page
  cache is warm. The restore is applied to the form only after the competitor
  list loads: resetting a `comp:<i>` value before its SelectItem exists leaves
  the Radix select stuck on its placeholder. A side whose saved competitor was
  deleted resets to its default and skips its rerun alone. All tabs are `forceMount`ed (hidden via
  `data-[state=inactive]:hidden`) so switching tabs doesn't wipe results. At
  `lg` the two Keyword Report columns are CSS subgrids of the same rows
  (`ALIGNED_SECTIONS` in `compare-tab.tsx`, `aligned` on `ScopePhraseTables`),
  so each section starts at the same y on both sides however many phrases the
  tables list — two pages aren't comparable by eye if one side's "3-Word
  Phrases" sits opposite the other's word list. The row count must match the
  sections rendered: adding one to `ScopePhraseTables` means adding an
  `ALIGNED_SECTIONS` entry.
- **Site Crawl** — manual "Run Crawl" over every sitemap page (~30s,
  concurrency 8) for the target picked in the dropdown: Live site,
  Unpublished, or any saved competitor (`comp:<i>`, the same source keys the
  Compare tab uses). TanTable of per-page metrics (row click opens the full
  report dialog) whose **Inbound** column is how many other crawled pages link
  to that one — 0 is an orphan, in the sitemap but linked from nowhere on the
  site, which is how a retired blog or careers section usually shows up. The
  crawl summary line carries the count and the zero cell names it on hover; a
  bare red zero doesn't explain itself. It is
  counted from each page's *full* link inventory, not the main-content links
  the anchor check uses: a page reached only from the footer is properly
  linked, and matched on a trailing-slash-normalized path while keyed by the
  page's own `path` — a site whose sitemap lists `/work/` links it as `/work`,
  and matching raw paths marks every page an orphan but the homepage. The
  count always shows; the orphan *flag* (red + hover label +
  summary count) is gated on `discovery === "sitemap" && skipped === 0`,
  because a partial crawl produces zero inbound links for almost everything —
  the linking page is simply one the cap dropped. Remaining caveat: nothing
  here executes JavaScript, so a blog index that hydrates its post list
  client-side makes every post look orphaned. Then the site-wide checks:
  duplicated content between pages
  and internal-link anchor text reused across source pages. Duplication is
  found with overlapping 8-word windows merged into passages and a shared-word
  count server-side (the raw window count massively overstates a single copied
  paragraph), but the UI reports only percentages: the Duplicated Content card
  shows each pair as the share of each page's main-content words that are
  copied, and the table's sortable **Duplicate** column is the page's worst
  single-pair share (destructive-colored at ≥ 20%), replacing the old Unique
  word count. Overlap at ≤ 15% (`SIGNIFICANT_DUPLICATE_PERCENT`) is treated as
  the normal cost of writing about one topic: those pairs are hidden from the
  card, and pages that never exceed it show a dash in the table. A passage carried by 30%+ of crawled pages (min 3) is
  treated as site furniture — testimonials, CTA blocks — and dropped, rather
  than flagging every page pair. On sites we control,
  `data-dup-ignore` on an element drops it by hand. Both exclusions are scoped
  to `mainContentView`, so they never touch the keyword/density tables: those
  must keep counting testimonials and CTAs, since Google indexes that text.
  `aside` is *not* treated as chrome — it is a layout column as often as a
  sidebar (oshrat project pages hold their whole write-up in one), and repeated
  sidebars are already caught by the frequency filter.

## Position Tracking page (`position-tracking/`)

SEMrush-replacement rank tracker backed by DataForSEO (core in
`src/server/position-tracking.ts`, `"use server"` wrappers in
`position-tracking-actions.ts`; `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD`,
server-side only).

- Tracked keywords live on the org doc at `seo.trackedKeywords` (max 50:
  keyword + DataForSEO `location_name` + cached volume/CPC/difficulty/intent
  metadata, batch-refreshed when older than 30 days). The Add dialog takes a
  bare city; `composeLocation` title-cases it and appends the company
  profile's state/country ("aventura" → "Aventura,Florida,United States").
  Blank = country-wide; a comma in the input passes through as a full
  `location_name`; non-US companies fall back to country-wide. Daily results are one
  doc per America/New_York day at
  `organizations/{org}/positionSnapshots/{YYYY-MM-DD}` — the SEO section's
  deliberate exception to "no Firestore": trend history can't be recomputed.
  Both paths are admin-SDK-only; no rules changes.
- Positions are the `rank_absolute` of the first organic item matching the
  org's website domain. Not found within the checked depth →
  `position: null`, rendered as a dash — excluded from the chart's daily
  averages (a keyword dropping past depth 80 vanishes from the line rather
  than dragging it), counted as 100 only in the table's Diff column. A
  keyword whose check errors is omitted from that day's snapshot — no data
  is not the same as not ranked. A saved location DataForSEO rejects is
  retried against "United States" and the downgrade persisted (both the
  live and queued flows).
- Checks run on the DataForSEO Standard task queue (~30% of live cost) at
  `adaptiveDepth`: last known position (newest 14 snapshots) rounded up to
  the next 10, +10, capped at `DEEP_SERP_DEPTH` 80; unplaced keywords scan
  the full 80. A shallow check that misses is never recorded — it re-posts
  at 80 so a big drop shows its real position instead of an unplaced dash.
  Only "Add & Check" still uses the **live** endpoint (flat depth 50,
  ~6s/call — why the page exports `maxDuration = 60`), so new keywords show
  data instantly.
- Collection is server-side and browser-independent. Queued task ids live
  on the org doc at `seo.pendingChecks`, updated transactionally with the
  snapshot via `applyCheckOutcome` (postbacks arrive concurrently — a plain
  read-modify-write would drop results). In production every task carries a
  postback URL and DataForSEO POSTs each result to
  `/api/dataforseo/postback` (gzipped task_get shape; auth is a per-org
  HMAC of CRON_SECRET) the moment it completes. The page's `pollChecks`
  loop just watches the pending list drain (spinners in the
  latest-position cell), sweeping via task_get any task whose postback
  looks missed (>10 min old). Locally postbacks can't reach you, so
  `pollChecks` collects everything via task_get itself. The mount effect
  rejoins whatever is pending — nothing is client-held, so any device sees
  in-flight checks.
- The daily run is a Vercel cron (`vercel.json`, 7:00 UTC) hitting
  `/api/cron/position-tracking` (CRON_SECRET bearer, same pattern as
  instagram-snapshots) for every org with tracked keywords. With postbacks
  configured it queues tasks and exits (`queuePositionCheckForOrg`) —
  results merge themselves as they complete; without them it falls back to
  the live full run. `DATAFORSEO_POSTBACK_URL` overrides the postback base
  URL, else Vercel's production domain is used.
- Chart is a straight-segment line (`type="linear"` — deliberately not the
  app's usual monotone smoothing) with a reversed Y axis. The date range
  uses the shared `src/components/date-range-picker.tsx` (two-month
  calendar + presets + Apply/Reset; built for reuse — the Analytics page is
  the next intended consumer). Visibility % is a client-side CTR-curve
  share of the tracker total, SEMrush-style. KD renders as ten ticks (one
  per 10 points, rounded, non-zero scores keep at least one) beside the
  number, colored green / yellow / red on the 0–33 / 34–66 / 67–100 thirds.

## Page Analyzer page (`page-analyzer/`)

Lighthouse via the **PageSpeed Insights API** (`src/server/pagespeed-actions.ts`)
— Google runs the audit on its own infrastructure, so no headless Chrome, and
the response carries both the lab result and the CrUX real-user field data
Google actually ranks with. Intended to grow into the home for other per-page
tracking later.

- Targets are the Keyword Analyzer's source keys minus `local`/`none`: Google
  fetches the page itself, so only public URLs work — "Unpublished" can never
  be audited. Live/competitor URLs resolve server-side (same posture as the
  crawler); Custom URL passes through like `analyzeExternalUrl`.
- One URL per run, ~15–30s (the page exports `maxDuration = 60`). Cached
  in-memory per instance for 30 min keyed by `strategy|url`, section
  convention: mount restores via `fetchCachedPagespeed` (never triggers a run
  the user didn't ask for; the form persists in localStorage `seo-pagespeed`),
  explicit Analyze always reruns.
- `PAGESPEED_API_KEY` (optional, server-side only) raises the anonymous quota
  to ~25k runs/day. Works keyless at low volume.
- Report: the four category scores (Lighthouse bands: 90+ green / 50+ yellow /
  red), lab Core Web Vitals, CrUX field data when it exists (small sites often
  have none — the card says so; `origin_fallback` means site-wide, not
  page-level, data), and the top opportunity audits by estimated savings.
  Mobile is the default strategy because Google ranks on the mobile render.

## Competitor Analysis page (`competitor-analysis/`)

Manages up to 5 competitors (name + URL). Stored on the org document at
`seo.competitors` via `saveCompetitors` (server action, org from cookie, URLs
normalized to origin) — durable config, not cache. The Keyword Analyzer's
source dropdowns read the same list. This page is where full site-vs-site
competitor analysis will grow later.

## Analyzer rules (seo-actions.ts)

- The keyword/phrase model deliberately mirrors **SEOBook's keyword-density
  tool** (see `/single-page-analyzer.png` at the repo root) so reports stay
  comparable to that reference: density = count × phrase-length ÷ scope word
  total (stop words excluded from the total), phrases contain no stop words,
  words under 2 chars are dropped, tables list phrases occurring ≥ 2 times.
  Scopes: all text (incl. title + meta description), body (minus headlines +
  anchors), headlines, links, images (alt text). The Headlines scope also
  lists the page's actual headings (tag + text, document order,
  `PageAnalysis.headings`) below the phrase tables — in the Compare tab and
  the crawl's page-detail dialog. The Links scope likewise lists the page's
  body links (anchor text + destination, `PageAnalysis.bodyLinks` — mobile-
  visible links outside header/footer/nav/aside chrome). Link counts and the
  Links phrase tables cover mobile-visible links; the full inventory
  (`PageAnalysis.links`) stays unfiltered because spider discovery follows it.
- `seo-stop-words.ts` is SEOBook's own list, verbatim — do not curate it.
- Text extraction inserts element boundaries so adjacent anchors never run
  together (SEOBook's "design groupdesign" artifact); phrases never span
  block-level boundaries. Hidden-from-everyone text is excluded: `hidden`/`aria-hidden`
  attributes, inline `display:none`/`visibility:hidden`, and `HIDDEN_CLASSES`
  (e.g. WP themes print raw microformat timestamps in `rich-snippet-hidden`
  spans). Screen-reader text (`sr-only` etc.) deliberately counts — it's read
  aloud to AT users and Google weights it as content. The analyzer models
  **Google's mobile-first render** for Tailwind sites: a bare
  `hidden`/`invisible` utility (or a `max-*:` variant) counts as hidden, while
  `sm:`…`2xl:`-prefixed ones are mobile-visible — so responsive
  desktop/mobile twins (e.g. the marketing site's `LocationServices`, which
  ships both layouts in the HTML) count once, not twice. Applies to all
  scopes, word totals, the headings/links listings, and image counts.
  External stylesheets are out of reach, so other class-based hiding beyond
  `HIDDEN_CLASSES` and Tailwind utilities still slips through.
- Site-wide checks run on a main-content view (header/footer/nav/aside
  stripped) so shared page chrome doesn't flag every page pair.
- Targets: `live` resolves from the active org's **Company → Website** field
  (`companyProfile.website`, via `getActiveOrgWebsite` in `org-config.ts`) —
  never hardcode a domain; `local` = localhost:3000, only reachable when the
  dashboard itself runs locally. The UI labels `local` as **"Unpublished"**:
  it shows unpublished code changes, but Sanity content drafts only appear if
  the local site runs in draft/preview mode. `comp:<i>` indexes the org's
  saved competitor list and is resolved in `resolveBaseUrl` from
  `getActiveOrgSeoCompetitors()` — the client sends the index, never a URL, so
  the crawler can only be aimed at sites the org configured.
- No sitemap is not fatal: the crawl falls back to breadth-first
  link-following from the homepage (same-origin, `MAX_SPIDER_PAGES` cap) and
  the crawl stamps `discovery: "links"`; the Compare tab swaps its page
  picker for a manual path input. `fetchHtml` returns the URL it landed on, so
  a crawled page is filed under the path the site actually serves rather than
  the one the sitemap claimed: without that, two stale entries redirecting to
  one live page become two identical rows and the duplicate check reports that
  page as a verbatim copy of itself, and an inbound link to the old path never
  reaches the new one. Redirects are reported (`SiteCrawl.redirects`), and a
  redirect that leaves the origin drops the page rather than filing a foreign
  site's content under a local path. Sitemap crawls stop at `MAX_CRAWL_PAGES`
  (competitor sitemaps run to hundreds of pages and would blow the action's
  timeout); the remainder is reported as `SiteCrawl.skipped`, never silently
  dropped. Paths are ordered shallowest-first before the cap applies, so a
  truncated crawl keeps the shape of the site — the sitemap's own alphabetical
  order would spend the whole budget inside `/blog` and never fetch `/`. The
  cap is 250 with `maxDuration = 60` on the page; going much past that wants a
  different shape, not a bigger number, since the action returns nothing at all
  if it overruns and the whole `PageAnalysis` of every page is serialized back
  to the browser.
- Caching is **in-memory per server instance** (page analyses 10 min TTL; last
  crawl per resolved base URL kept until re-run — keyed by URL, not by target,
  since "live" and "comp:0" name different sites for different orgs sharing an
  instance). A restart loses it by design — no
  Firestore. If persistence ever earns its keep, a single JSON blob per crawl
  is the intended upgrade. The cache exists ONLY to serve leave-and-return
  restores: the Site tab pulls the cached crawl on mount (`fetchCachedCrawl`),
  the Compare tab re-runs its localStorage-saved sides against the cache.
  Every explicit run is fresh — Analyze passes `fresh=true` (bypasses the page
  cache, then updates it) and Run Crawl always refetches.
