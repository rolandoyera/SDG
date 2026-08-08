# PRD — Lenis Studio Website (`apps/website`)

**Date:** 2026-08-07 · **Status:** Draft, pending review

## Why now

1. **Meta app submission (hard deadline: next few days).** Submitting the app
   to Facebook requires public, crawlable URLs for a **Privacy Policy** and
   **Terms of Service** — and, for any app that accesses user data (Marketing
   API, Pixel, Login), a **Data Deletion instructions URL**. These pages must
   live on a real domain, not localhost.
2. **Presence.** Lenis Studio needs a page that proves it exists — clients,
   Meta reviewers, and partners will look it up. "Mostly to show that there is
   one" is the bar; polish comes later.

## Decision: start from scratch

The current `apps/website` is a stale copy of the Oshrat site (Sanity-coupled:
`next-sanity`, GROQ, studio route, her projects/press/about content). That
site's real home is now `oshrat/web`, and the copy survives in git history.
Nothing carries over — the dependencies, content, and structure are all wrong
for a one-page studio site. **Delete the contents of `apps/website` and
scaffold fresh.**

## Scope (v1)

| Route | Purpose |
| --- | --- |
| `/` | Landing page: logo/wordmark, one-line positioning, short "what we do" blurb, contact email, footer with legal links |
| `/privacy` | Privacy Policy (covers site + the Studio dashboard app, since the Meta app is registered to the business) |
| `/terms` | Terms of Service |
| `/data-deletion` | Plain-language instructions for requesting data deletion (email-based; no callback endpoint in v1) |

That's it. Four routes, all static.

### Non-goals (v1)

- No CMS (no Sanity, no Firestore content) — copy lives in the code.
- No blog, portfolio, case studies, services pages, or contact form
  (a `mailto:` link is enough).
- No animations/scroll effects, no auth, no analytics beyond (optionally)
  Vercel Analytics.
- No shared packages with `apps/dashboard` — the apps stay independent,
  matching the current monorepo shape (no root workspace).

## Tech

- **Next.js (App Router) + Tailwind CSS 4**, TypeScript — same stack family as
  the dashboard, minimal dependency list (no UI kit needed for four static
  pages; add shadcn primitives only if a real need appears).
- Fully static output; every page `export const metadata` with proper
  title/description; `robots.txt` + `sitemap.xml`.
- Dark, minimal aesthetic consistent with the Studio dashboard.
- **Deploy: Vercel** (dashboard already deploys there), attached to the
  studio's domain.

## Content plan

- **Positioning line (draft, needs Rolando's sign-off):** "Lenis Studio —
  web design, engineering, and growth for small businesses." Adjust to taste;
  the page structure doesn't depend on the wording.
- **Legal pages:** written for a small US business that operates a client
  dashboard (Firebase auth + Firestore), runs Meta/Google ads tooling, and
  collects only business-contact data. Reviewed copy, not lorem ipsum —
  Meta reviewers do open these URLs.
- **Data deletion:** "email rolysemail@gmail.com (or the studio address) with
  the account email; deletion within 30 days" — the standard email-based
  instruction Meta accepts for business-tool apps.

## Open questions (blockers for shipping, not for building)

1. **Domain** — is there one (e.g. lenisstudio.com)? The Meta submission needs
   the legal URLs on a real domain. If none exists yet, buying one is step 0;
   a `*.vercel.app` URL is a fallback Meta sometimes accepts but a real domain
   is safer for review.
2. **Positioning line** — approve or rewrite the draft above.
3. **Studio contact email** — use rolysemail@gmail.com or a domain address
   (hello@…) once the domain exists?

## Plan of work

1. Wipe `apps/website` (keep the folder), scaffold fresh Next.js + Tailwind app.
2. Build `/`, `/privacy`, `/terms`, `/data-deletion` with real copy.
3. Verify: `tsc --noEmit`, build passes, Lighthouse-sane metadata.
4. Deploy to Vercel, wire domain, paste the three URLs into the Meta app
   settings.
