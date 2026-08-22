# CRM AI Development Rules

## Project Status: Pre-Release

This app has **no outside users yet**, and **no data worth protecting in any org**. Records are
seeded ad hoc to check a feature and usually deleted shortly after.

Two organizations exist in Firestore:

- **`org-demo`** ("Demo Studio Sales Sandbox") — the sales sandbox, for demoing the product to
  prospective clients. Both a demo audience and a disposable workspace, so it should stay
  presentable and is exempt from tenant usage caps (`UNCAPPED_ORG_IDS` in `src/config/app-config.ts`)
  — hitting a limit mid-demo is the worst possible time.
- **`org-sarvian`** ("Sarvian Design Group") — a real account used as the test tenant. Also the org
  behind the white-label host `studio.sarviandg.com` (see `hostOrgs`).

**There is no "Lenis" organization**, and the platform owner does not need one: an org is the TENANT
boundary (clients, projects, contracts, library all scope to `organizationId`), and Lenis does not
run a design business inside the product. Cross-org operation is the **`SuperAdmin` role**, which
works from whatever org an operator is homed in — today `org-demo`. Don't invent an owner org to
satisfy a permission question; check the role.

So when a change calls for a structural fix, make the structural fix:

- **Don't preserve backward compatibility with existing documents.** Reshape the collection, rename
  the field, change the doc key. No dual-read/dual-write phases, no deprecation windows.
- **Don't write migrations or backfills.** Re-entering the handful of test records is cheaper than
  the migration. Say plainly that existing data will be dropped, then drop it.
- **Don't hedge on breaking changes to server action signatures, types, or component props.** There
  is no external consumer.
- **Don't propose the compatible-but-worse design.** If the right shape needs a wider change,
  propose the right shape.

**This does not relax anything else.** It removes the data-safety and backward-compatibility
objections, not the engineering ones:

- Verification still applies in full: `npx tsc --noEmit`, Biome, and the relevant Vitest suites
  (including the query-shape and effect-dependency guardrails). A large change needs _more_
  checking, not less.
- Actions with consequences outside this repo still warrant confirmation first: Firestore/Storage
  rules deploys, index deletion, IAM or API-key changes, billing config, deleting GCP resources.
- **Simplicity First still governs scope.** Pre-release is not license to refactor what wasn't
  asked about. Structural freedom applies to the change at hand.

## Feature-Level Notes

Before working inside any folder, check for an `AGENTS.md` in that folder **and its parents**, and
follow it — these capture feature-specific context that isn't obvious from the code. Many
`src/app/(main)/dashboard/*` features have one; don't assume from this not listing them. If your
change makes one of those files wrong, update it in the same change; treat that as part of "done."

## Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## Design System Rules

- Do not create new visual styles unless explicitly asked.
- Use the existing UI components first without adding additional styles unless absolutely necessary, i.e., if the design system does not provide the component needed, layout, or style needed for a feature.
- Use existing form, button, dialog, input, card, table, badge, and toast components.
- Do not write custom CSS unless explicitly requested.
- Use Tailwind utility classes from the existing theme.
- Match the current spacing, border radius, shadows, dark mode colors, and typography.
- Do not modify global CSS, Tailwind config, or theme tokens unless explicitly requested.

## Technical Stack & Architecture Rules

### 1. Verification & Compile Checks

- Always execute `npx tsc --noEmit` inside the dashboard app directory to check for TypeScript errors before completing any code changes.
- Use Prettier for formatting with `npm run format`.
- Ensure all Biome lint checks pass cleanly using `npx biome check --write`; Biome formatting is disabled.
- When you touch logic with tests (`*.test.ts`, `*.test.tsx`), run the relevant suite with `npm run test:run` (Vitest). Firestore or Storage rules changes must pass `npm run test:rules:emulator` (runs both rules suites under the Firestore + Storage emulators); portal/contract/server-action flows have their own specs alongside the code.
- Firestore query shape is test-enforced: `src/lib/db.query-shape.test.ts` asserts every list getter in `db.ts` issues exactly one `getDocs` query and zero per-doc reads (the N+1 guardrail — it asserts calls issued, not docs read). Add new list getters to its table; if a getter legitimately needs a second query, change its table entry deliberately.
- Effect dependencies are test-enforced at the component level: data effects must key on stable primitives from `useAuth` (`organizationId`, `authLoading`), never the `profile` object (its identity churns on every profile heartbeat). `clients/page.test.tsx` is the template — it renders the page with a mocked `useAuth`, rerenders with a new-but-equal `profile`, and asserts no refetch. When writing one for another page, mock that feature's `src/server/*-actions.ts` module too (server actions import firebase-admin, which cannot load in jsdom).

### 2. Next.js Client & Server Boundaries

- Declare `"use client"` strictly at the top of files that utilize browser events, local states, or Firebase Client Auth SDK listeners (e.g. `onAuthStateChanged`).
- Secure all critical third-party API keys (e.g., Gemini, Weather API) entirely inside Server Actions or API routes under `src/server/`. Never expose them to client-side bundles or public runtime scripts.
- To prevent stale Server Action weather/scraping cache states on reload, fetch real-time APIs with the `{ cache: "no-store" }` parameter explicitly configured.

### 3. State-Safe Modal Navigation

- When triggering creation dialogs or drawer components from global layouts (like the sidebar), use parameter-driven deep links (e.g., `/dashboard/library?add=true`) rather than cross-page state emitters.
- Always implement query parameter cleanup via `window.history.replaceState` immediately post-render to ensure URL hygiene and prevent repeat triggers on reload.

### 4. Forms & Validation

- Use React Hook Form (`react-hook-form`) with `Controller` for all form inputs.
- Use Zod (`zod`) for all form schema validation via `zodResolver`.
- Never use uncontrolled `useState` form state for new forms — always wire through RHF.
- For phone number fields, always use the shared helpers in `@/lib/utils` — never write a local phone formatter. Format the input `onChange` and all display with `formatPhone` (USA 10-digit `(XXX) XXX-XXXX`), build `tel:` links with `normalizePhone`, and validate in the Zod schema via `.refine(isValidUsPhone, "Enter a valid 10-digit US phone number.")`.

### 5. Data Writes & Server Actions

- Creating core entities (clients, projects, contracts) and any write that mints a reference code, needs a Firestore transaction, or must bypass client security rules goes through a `"use server"` action in `src/server/*-actions.ts` (e.g. `client-actions.ts`, `project-actions.ts`, `contract-actions.ts`) using the firebase-admin SDK — not the client `db.ts` helpers.
- Reference codes (`clientCode`, `projectCode`, contract codes) are minted server-side via `allocateReferenceCode` inside a transaction. Never generate them on the client.
- Server actions and API routes derive identity + org from the VERIFIED caller: `getVerifiedCaller()` / `getActiveOrgId()` in `src/server/auth.ts` verify the Firebase ID token cookie (`AUTH_TOKEN_COOKIE`, mirrored by the auth context) with firebase-admin and read the caller's `users/{uid}` profile. Never read `ACTIVE_ORG_COOKIE` directly on the server — it's only an org SELECTOR honored for SuperAdmins (who may operate on any org); everyone else is pinned to their profile org.
- SuperAdmins are cross-org platform operators: `useAuth().organizationId` is the ACTIVE org (switchable from the sidebar-footer tenant switcher or the Tenants page), `firestore.rules` grants them cross-org access via `inOrg()`, and moving a document between orgs is never allowed. White-label domains are tenant-exclusive via `hostOrgs` in `src/config/app-config.ts` (AuthGuard signs out members of other orgs; SuperAdmins exempt) **and pin the ACTIVE org to the host's tenant**: on those hosts the host org overrides the SuperAdmin's org-selector cookie in both `getVerifiedCaller` (server, reads the Host header — needed because pages fetch during SSR before any client cookie exists) and `auth-context.tsx` (client, exposes `hostPinnedOrgId`; `setActiveOrganization` is a no-op there and the tenant-switching UI disables accordingly). The pin only ever narrows a SuperAdmin to a tenant they could already select — it grants nothing.
- Routine field updates that `firestore.rules` already permits (e.g. realtime layout/state writes) may still use the client `db.ts` helpers directly.

### 6. Third-Party Usage & Tenant Caps

Anything that spends a metered vendor credit (Gemini, Firecrawl, Jina) is a server action that
derives its org from `getVerifiedCaller()` and meters it. Never take an org id from the client for
this, and never let an unauthenticated request reach a paid vendor.

- **Cap first, then work.** `checkAutofillQuota(caller)` in `src/server/ai-quota.ts` runs before any
  scraping or model call. Quota is consumed on ATTEMPT, not on success — a failed run still spends
  real credits, so charging only successes would let a retry loop burn the month's budget for free.
- **Exempt:** `SuperAdmin` (cross-org platform operators) and `UNCAPPED_ORG_IDS`. Both key on the
  caller's HOME org, never the active one — a SuperAdmin working inside a tenant still METERS
  against that tenant, they just are not blocked by it. `aiMonthlyLimit: 0` is the per-tenant off switch; there is deliberately no "unlimited" value.
- **Counters live on `organizations/{orgId}.config.usage["YYYY-MM"]`** (ET months, matching the ET
  days `aiUsage` is keyed by) because `getActiveOrgConfig` already reads that doc once per request —
  so the cap check costs zero extra reads. Add a counter there, not in a new collection.
- **Keep vendor units distinct — do not normalize to "requests."** Firecrawl bills per PAGE
  (~1 credit, 1,000/month), Jina per TOKEN (1M/month, then keyless rate limits), Gemini per TOKEN.
  Collapsing them hides which quota is about to run out. Tenants are still sold one product unit
  (`autofills`); the vendor split is internal COGS.
- **Meter at the single door, not at call sites.** `fetchViaFirecrawl` records its own page; every
  Gemini path records through `recordAiUsage`. The scrape chain returns early from several branches,
  so a write batched at the bottom of an action silently misses them.
- **There is no per-tenant billing truth to fall back on.** Cloud Billing has no org dimension and
  the vendors' dashboards only show account totals, so usage not recorded at call time is
  unrecoverable. Record the dimension even when nothing reads it yet.
