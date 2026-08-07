# TODO — Site Crawler / SEO Report Tool

Build a crawler that produces per-page keyword reports for the Sarvian site
(sarviandg.com), like the single-page analyzer but for every page at once.

## Plan

- [ ] Decide crawl target: **live site** (default) or localhost dev build
- [ ] Node script (~150 lines) in `Web/Tools/` alongside the ads tooling
  - Fetch `sitemap.xml` → fetch each page → parse with `cheerio` (only dependency)
  - Per page: word count, unique words, 1/2/3-word phrase densities
    (stop-word filtered), link inventory + anchor-text density, headline
    structure (H1/H2s), images + missing alts, title/meta description
- [ ] Output: CSV per page + one site-wide HTML report

## Site-wide checks the single-page tool can't do

- [ ] Anchor-text distribution across location pages — each city page should
      link to its county hub + Fort Lauderdale with a **unique** keyword anchor
- [ ] Duplicated phrases between city pages (copy rules: never reuse a
      paragraph across cities)

## Follow-up from the sample report

- [ ] Investigate `design groupdesign` / `groupdesign architecture` phrases in
      the Fort Lauderdale page's link extraction — adjacent link texts running
      together with no space. Confirm it's the analyzer's parsing, not actual
      markup on the page.
