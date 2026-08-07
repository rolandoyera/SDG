# TODO — Website / SEO Section

**Shipped 2026-08-07** — the Keyword Analyzer lives at
`/dashboard/seo/keyword-analyzer` (Website → SEO in the sidebar). See
`apps/dashboard/src/app/(main)/dashboard/seo/AGENTS.md` for the
architecture and analyzer rules.

- Compare tab: side-by-side single-page keyword reports (own page vs
  competitor URL), SEOBook-comparable densities, five scopes.
- Site Crawl tab: manual sitemap-wide crawl, sortable page table with
  per-page report dialog, duplicated-content and anchor-reuse checks.
- Caching in-memory only (by design); prod + localhost targets.

## Later, if worthy

- Sitewide competitor crawl (same loop pointed at their sitemap) for
  site-vs-site comparison.
- Persist crawl history to Firestore (trend over time).
- Aggregate site-wide keyword view (sum phrase counts across the crawl).

## Resolved follow-ups

- `design groupdesign` in the SEOBook sample report was that tool's parsing
  (no space inserted between nested elements in the logo anchor), not the
  site's markup. Our extractor inserts element boundaries, so reports show
  `sarvian design group` correctly.
