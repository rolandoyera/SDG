# SEO Section

SEO tooling for the marketing site (sarviandg.com). In the main sidebar this
is the **Website → SEO** item ("Website" is just the group heading, not a
route); `/dashboard/seo` redirects to the first tool. The section's pages
live in the Docs-style secondary sidebar (`layout.tsx` +
`_components/seo-sidebar-nav.tsx`, cloned from `../docs`). To add a page:
create the route folder and add one item to the hardcoded list in
`seo-sidebar-nav.tsx`.

## Keyword Analyzer page (`keyword-analyzer/`)

Two tabs backed by `src/server/seo-actions.ts`:

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
  deleted resets to its default and skips its rerun alone. Both tabs are `forceMount`ed (hidden via
  `data-[state=inactive]:hidden`) so switching tabs doesn't wipe results.
- **Site Crawl** — manual "Run Crawl" over every sitemap page (~30s,
  concurrency 8), TanTable of per-page metrics (row click opens the full
  report dialog), plus the site-wide checks: duplicated 8-word content runs
  between pages and internal-link anchor text reused across source pages.

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
  anchors), headlines, links, images (alt text).
- `seo-stop-words.ts` is SEOBook's own list, verbatim — do not curate it.
- Text extraction inserts element boundaries so adjacent anchors never run
  together (SEOBook's "design groupdesign" artifact); phrases never span
  block-level boundaries.
- Site-wide checks run on a main-content view (header/footer/nav/aside
  stripped) so shared page chrome doesn't flag every page pair.
- Targets: `live` resolves from the active org's **Company → Website** field
  (`companyProfile.website`, via `getActiveOrgWebsite` in `org-config.ts`) —
  never hardcode a domain; `local` = localhost:3000, only reachable when the
  dashboard itself runs locally. The UI labels `local` as **"Unpublished"**:
  it shows unpublished code changes, but Sanity content drafts only appear if
  the local site runs in draft/preview mode.
- No sitemap is not fatal: the crawl falls back to breadth-first
  link-following from the homepage (same-origin, `MAX_SPIDER_PAGES` cap) and
  the crawl stamps `discovery: "links"`; the Compare tab swaps its page
  picker for a manual path input.
- Caching is **in-memory per server instance** (page analyses 10 min TTL; last
  crawl per target kept until re-run). A restart loses it by design — no
  Firestore. If persistence ever earns its keep, a single JSON blob per crawl
  is the intended upgrade. The cache exists ONLY to serve leave-and-return
  restores: the Site tab pulls the cached crawl on mount (`fetchCachedCrawl`),
  the Compare tab re-runs its localStorage-saved sides against the cache.
  Every explicit run is fresh — Analyze passes `fresh=true` (bypasses the page
  cache, then updates it) and Run Crawl always refetches.
