# Leads Feature — Agent Notes

> Global dev rules live in the repo root [AGENTS.md](../../../../../../../AGENTS.md). This file
> only captures Leads-specific context that isn't obvious from the code.

## Maintain this file

**Whenever you change Leads code (this folder, or the lead-related helpers in `src/lib/db.ts` and
`convertLeadToClient` in `src/server/lead-actions.ts`), update this file in the same change.** If a
fact here is now wrong, correct it; if you add/remove a field, action, helper, or convention, reflect
it. A stale AGENTS.md is worse than none — treat updating it as part of "done," not optional.

## What this feature is

The sales pipeline: capture/qualify a `Lead` (`@/lib/types`), then convert it into a client. A lead
can be an individual or a company (`isCompany`). Two routes, both **client components**:

- [page.tsx](./page.tsx) — the pipeline: a `LeadsTable` (TanStack table) plus the "Add Lead" dialog.
  Honors `?add=true` (Quick Create deep link) on mount and clears it via `window.history.replaceState`
  (root AGENTS.md rule #3).
- [[leadId]/page.tsx]([leadId]/page.tsx) — a single lead: contact / project-fit / source cards,
  edit, and **Convert to Client**.

The lead id is `Lead.uid` (legacy field name — not an auth uid), generated as `lead-<random>`.

## Files in this folder

- `_components/lead-constants.ts` — the **single source of truth** for the form and all pipeline
  enums: `leadSchema` (Zod), `LeadFormData`, `EMPTY_LEAD_FORM`, the registries + label/variant maps
  for stage/source/property-type/budget-range/timeline, the `NONE` sentinel, and the three mapping
  helpers (`leadFormToFields`, `leadToForm`, `getLeadName`). The `Lead` type lives in `@/lib/types`.
- `_components/lead-form-dialog.tsx` — the shared add/edit dialog (RHF + `zodResolver`), reseeded from
  `defaultValues` each open.
- `_components/leads-table.tsx` + `leads-columns.tsx` — the pipeline table. Both declare
  **`"use no memo"`** (React Compiler is on — TanStack table components render dead without it; see the
  project memory note). Don't remove it.

## Where the data comes from

All persistence is in `src/lib/db.ts` (Firestore client SDK, top-level **`leads`** collection keyed
by `uid`):

- `getLeads(organizationId)` — pipeline query, filtered by `organizationId`.
- `getLead(uid)` — single doc; **does not filter by org** (see tenant isolation below).
- `addLead(...)` / `updateLead(uid, partial)` — `updateLead` bumps `updatedAt`/`lastActivityAt` and
  returns the written partial (the page merges it into local state).
- `markLeadViewed(uid)` — stamps `firstViewedAt` the first time **anyone in the org** opens the
  detail page (org-wide "seen", not per-user). Deliberately a bare write, **not `updateLead`**, so
  viewing a lead doesn't bump `updatedAt`/`lastActivityAt` and reorder the pipeline. The detail page
  fires it best-effort after the org guard passes. The home page "New Leads" metric
  (`home/_components/metric-cards.tsx`) counts leads with no `firstViewedAt`. Like
  `customerComments`, `firstViewedAt` is not a form field — exempt from the three-touch mapper rule.

Unlike clients/projects/contracts, **lead creation is a plain `db.ts` write (`addLead`), not a server
action** — leads carry no reference code. The **conversion** is the server action (next section).

## Conversion — `convertLeadToClient` (server action, non-destructive)

`convertLeadToClient(lead, convertedBy, actor)` in `src/server/lead-actions.ts` (`"use server"`) runs
one transaction that: allocates the **client's** reference code, creates a `Client` carrying
`sourceLeadId = lead.uid`, and stamps the lead `stage: "won"` + `convertedClientId`/`convertedAt`/
`convertedBy`. Org comes from the verified caller (`src/server/auth.ts`). **The lead is never deleted** — it's kept for
records, and the detail page disables the Convert button once `convertedClientId` is set. Keep the
two writes in the same transaction so a half-converted state can't exist.

## Actor & user fields — two different patterns (don't mix them up)

- **`createdBy` / `updatedBy` are frozen `ActivityActor` snapshots.** The name travels with the record
  so a non-user origin (e.g. a website intake) shows its own identity with no lookup. Render via
  `resolveActor` (returns `actor.name`, or `"You"` for the current user). See the project memory notes
  on lead-audit actor snapshots and activity actor naming.
- **`assignedTo` / `convertedBy` are user uids.** Resolve them through the `userMap`
  (`getOrganizationUsers`) via `resolveUser` (returns the name, `"You"` for self, or "Unknown user").

Stamp the current user as an actor whose `name` is `profile.fullName` (never the vanity
`displayName`). On edit, `assignedAt` is re-stamped when the assignee changes (real user → now;
cleared → 0).

## Tenant isolation — read this before touching the detail route

`getLead(uid)` returns **any** org's lead (docs are addressed by a guessable id). The detail page
guards it: [[leadId]/page.tsx]([leadId]/page.tsx) compares `leadData.organizationId !== organizationId`
and redirects to the pipeline if it doesn't match. **Keep that guard.** If you add another caller of
`getLead`, re-apply the same org check.

## Conventions easy to break

- **Form changes are three-touch — plus the mappers.** A new lead field means updating `leadSchema`,
  `EMPTY_LEAD_FORM`, **and both** `leadFormToFields` (form → Lead) and `leadToForm` (Lead → form) in
  `lead-constants.ts`, plus a `Controller` in `lead-form-dialog.tsx`. The mappers translate the `NONE`
  sentinel and empties — miss one and the field silently drops.
- **Optional selects use the `NONE` sentinel, not `""`.** Radix Select can't hold an empty value.
  `leadFormToFields` converts `NONE` → `undefined` for most fields, **except `assignedTo`**, which
  persists `""` (so picking "Unassigned" actually clears an existing assignment — `cleanUndefined`
  strips `undefined` but keeps `""`). Preserve that distinction.
- **Phone/zip go through shared helpers** (`formatPhone`/`normalizePhone`/`isValidUsPhone`,
  `formatZip`/`isValidUsZip`); both are optional on a lead (`"" || valid`). `phoneCountry` exists for
  future international support but the schema validates US-only. Never write a local formatter.
- **`isCompany` drives required fields + display.** Schema requires `company` when `isCompany`, else
  `firstName`; `getLeadName` shows company when applicable, else the contact name. Use `getLeadName`
  rather than reassembling the name inline.
- **`organizationId` is the effect dependency, not `profile`.** Both routes depend on the stable
  `organizationId` string from `useAuth` (the `profile` object identity churns each heartbeat).
- **`source` is required** (a `.refine` rejects `NONE`/empty), unlike the other optional enums.
- **`customerComments` is read-only and not in the form.** It holds the customer's verbatim message
  (e.g. the website project/contact form maps `message` → `customerComments`, capped at 200 chars in
  the originating site). It's distinct from `notes` (the team's internal notes, which _is_ the
  form field). The detail page renders it as a separate "Customer Comments" card. Since it isn't a
  form field, it's exempt from the three-touch mapper rule above — don't add it to `leadSchema`/the
  mappers/`lead-form-dialog`.
- **Website intake also writes a bell notification.** The originating site's `createWebsiteLead`
  (oshrat repo, `web/src/lib/server/create-website-lead.ts`) writes an org-wide `lead_created` doc to
  the top-level `notifications` collection alongside the lead (best-effort). Its shape mirrors
  `AppNotification` in `@/lib/types` and is **synced manually across repos** — if you change that
  type, update the oshrat writer in the same change.
