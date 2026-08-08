# TODO — Website / SEO Section

## Lenis Studio website (`apps/website`)

**2026-08-07** — wiped the stale Oshrat copy (real home: `oshrat/web`) and
scaffolded the studio's own site from scratch: landing page + `/privacy`,
`/terms`, `/data-deletion` for the Meta app submission. PRD at
`/WEBSITE-PRD.md`.

- [ ] Confirm domain (lenisstudio.com?) and set `NEXT_PUBLIC_SITE_URL`.
- [ ] Deploy to Vercel, attach domain, paste legal URLs into Meta app
      settings.
- [ ] Rolando: review legal copy + landing positioning line.

**Shipped 2026-08-07** — the Keyword Analyzer lives at
`/dashboard/seo/keyword-analyzer` (Website → SEO in the sidebar). See
`apps/dashboard/src/app/(main)/dashboard/seo/AGENTS.md` for the
architecture and analyzer rules.

- Compare tab: side-by-side single-page keyword reports (own page vs
  competitor URL), SEOBook-comparable densities, five scopes.
- Site Crawl tab: manual sitemap-wide crawl, sortable page table with
  per-page report dialog, duplicated-content and anchor-reuse checks.
- Caching in-memory only (by design); prod + localhost targets. Compare
  selections persist in localStorage and auto-rerun on return.

## Later, if worthy

- Competitor Analysis page: grow from the saved-competitors list into full
  site-vs-site analysis (sitewide crawl of a competitor's sitemap).
- Persist crawl history to Firestore (trend over time).
- Aggregate site-wide keyword view (sum phrase counts across the crawl).

## Project: move site content off Sanity into Studio

Idea (2026-08-07): retire Sanity and manage the marketing site's content in
Lenis Studio. Payoff: content + SEO tooling in one place — analyze a draft
page straight from Studio ("Unpublished" becomes first-class, no localhost
needed), and the location-page formula becomes a CRM template with a live
keyword report before publishing. Cost: rebuild content models (Firestore),
editing UI, image pipeline (Sanity's CDN transforms are the hard part), and
a publish/revalidate flow for the Next site. First step when picked up:
inventory exactly which content types the oshrat site pulls from Sanity.

## Resolved follow-ups

- `design groupdesign` in the SEOBook sample report was that tool's parsing
  (no space inserted between nested elements in the logo anchor), not the
  site's markup. Our extractor inserts element boundaries, so reports show
  `sarvian design group` correctly.
