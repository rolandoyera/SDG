# TODO — Website / SEO Section

## Lenis Studio website (`apps/website`)

**2026-08-07** — wiped the stale Oshrat copy (real home: `oshrat/web`) and
scaffolded the studio's own site from scratch: landing page + `/privacy`,
`/terms`, `/data-deletion` for the Meta app submission. PRD at
`/WEBSITE-PRD.md`.

- [ ] Domain confirmed 2026-08-08: lenisstudio.com + www are owned and
      currently attached to the dashboard's Vercel project (`sdg-cgg4`,
      which keeps app.lenisstudio.com / studio.sarviandg.com). Set
      `NEXT_PUBLIC_SITE_URL=https://lenisstudio.com`.
- [ ] Deploy `apps/website` as a new Vercel project, move lenisstudio.com
      + www onto it, paste legal URLs into Meta app settings.
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

## Page Watch (SEO section feature — planned 2026-08-08)

Answers "is this new page visible at all, or did I make a mistake" — not
classic rank tracking. Rolando publishes location pages constantly and wants
to know within days (not a month) when one fails. Staged checks, cheapest
first; a page only graduates to the next stage when the previous one passes:

1. **Indexed?** — GSC URL Inspection API (free), daily sweep of recently
   published pages. Catches noindex / canonical-elsewhere / missing-from-
   sitemap within a day or two.
2. **Any impressions?** — GSC Search Analytics (free, ~2-day lag). Flag
   pages still at zero impressions N days after publish — the clearest
   something's-wrong alarm.
3. **Where exactly?** — DataForSEO live SERP (`$0.002` per 10 results) on
   the page's target keyword, depth ~60. Daily for a page's first two
   weeks, weekly once stable. Verified 2026-08-08: live SERP matches
   real placement (Aventura page = organic #15, page 2) while the Labs
   database has no data for our low-volume neighborhood terms — so live
   checks only; `ranked_keywords` is for competitor digging.

Notes: crawl already knows the sitemap, so "new page detected" is nearly
free (diff against last crawl). DataForSEO spend stays ~$1–7/mo even as
pages accumulate. **Decided (2026-08-08): target keyword derives from the
page's H1** — zero-config, fits the shipping pace (allow a manual override
per page for the rare mismatch). Still open: persisting watch state
(Firestore doc per watched page) and the surfacing spot (SEO sidebar page
or dashboard card).

## Position Tracking (SEO section — shipped 2026-08-08)

Replaces the canceled SEMrush subscription ($250/mo) with DataForSEO
(~$6/mo at 20 keywords daily, live SERP depth 50). Lives at
`/dashboard/seo/position-tracking`; architecture + analyzer-style rules in
the SEO section's AGENTS.md. Highlights: avg-position chart (sharp linear
line, reversed Y, shared DateRangePicker with SEMrush-style presets),
rankings table (Intent/KD/Pos start/Pos latest/Diff/Visibility/Vol/CPC/URL,
row-select + Remove Selected, Add & Check dialog), Vercel cron at 7:00 UTC,
snapshots in Firestore (the section's deliberate persistence exception).
DataForSEO env vars are set locally and in Vercel production.

- [ ] Deploy, then add the first keywords (Add & Check gives instant rows).
- [ ] After the first cron night, confirm the snapshot landed (Vercel cron
      logs + a second day on the chart).
- [ ] Reuse `src/components/date-range-picker.tsx` on the Analytics page's
      range selectors.
- Later: swap live SERP for the standard queue (~$1.85/mo, plumbing-only);
  Page Watch (above) feeding H1-derived keywords into the tracker.

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
