# Lenis Studio Website (`apps/website`)

The studio's own marketing site — NOT a client site. Scaffolded fresh
2026-08-07 (the previous contents were a stale copy of the Oshrat site, whose
real home is `c:\Users\rolys\Web\oshrat`). See `/WEBSITE-PRD.md` at the repo
root for scope and rationale.

- Four static routes: `/`, `/privacy`, `/terms`, `/data-deletion`. The legal
  pages exist to satisfy Meta (Facebook) app review — keep their URLs stable.
- Plain Next.js (App Router) + Tailwind 4, no CMS, no UI kit; copy lives in
  the code. Site constants (name, URL, contact email, legal "last updated"
  date) live in `src/lib/site.ts` — bump `LEGAL_UPDATED` whenever legal copy
  changes.
- `npm run dev` uses port 3001 (3000 is the convention for client sites and
  the SEO tool's "Unpublished" target).
- Independent app: own `package.json`, no shared packages with
  `apps/dashboard`.
