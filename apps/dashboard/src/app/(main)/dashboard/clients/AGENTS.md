# Clients Feature — Agent Notes

> Global dev rules live in the repo root [AGENTS.md](../../../../../../../AGENTS.md). This file
> only captures Clients-specific context that isn't obvious from the code.

## Maintain this file

**Whenever you change Clients code (this folder, or the client-related helpers in `src/lib/db.ts` and
`createClient` in `src/server/client-actions.ts`), update this file in the same change.** If a fact
here is now wrong, correct it; if you add/remove a field, action, helper, or convention, reflect it. A
stale AGENTS.md is worse than none — treat updating it as part of "done," not optional.

## What this feature is

The client directory (people/companies that projects attach to). A `Client` (`@/lib/types`) can be an
individual or a company (`isCompany`). Two routes, both **client components**:

- [page.tsx](./page.tsx) — the directory: searchable grid of client cards, plus the "Add Client"
  dialog. Honors `?add=true` (Quick Create deep link) via the shared `QuickCreateTrigger`
  (`../_components/quick-create-trigger.tsx`), which reacts to same-page navigations and clears the
  param via `window.history.replaceState` (root AGENTS.md rule #3).
- [[clientId]/page.tsx]([clientId]/page.tsx) — a single client profile: contact card, the client's
  projects (with inline "Add Project"), and a notes log; edit/delete.

The client id is `Client.uid` (legacy field name — it is **not** an auth uid), generated as
`client-<random>` in the create action.

## Files in this folder

- `_components/client-constants.ts` — the **single source of truth** for the form: `clientSchema`
  (Zod), `ClientFormData` (inferred), `EMPTY_CLIENT_FORM`. The schema cross-validates: when
  `isCompany` is true, `company` is required (`.refine`). The `Client` type lives in `@/lib/types`.
- `_components/client-form-dialog.tsx` — the shared add/edit dialog (RHF + `zodResolver`), reseeded
  from `defaultValues` each open. Infers `isCompany` from `company`/`taxId` for legacy records and
  formats phone/taxId/zip through the shared helpers on seed.
- `_components/client-name.ts` — `getClientName(client)` → trimmed `{ firstName, lastName }`. Use it
  rather than reading the raw fields so name handling stays consistent.
- `_components/client-detail-header.tsx`, `client-contact-card.tsx`, `client-projects-card.tsx`,
  `client-notes-log-card.tsx` — detail-page pieces.
- `_components/delete-client-dialog.tsx` — confirm-delete for a client.
- `page.test.tsx` — effect-churn guardrail for the directory page (and the repo's template for
  component tests): asserts the data effect fetches once per `organizationId`, does **not** refetch
  when the `profile` object identity churns, and refetches on a real org change. Mocks `useAuth` via a
  mutable module-level `authState`, plus `@/lib/db`, `@/server/client-actions` (firebase-admin can't
  load in jsdom), and `next/navigation`; wraps the page in the real `PageTitleProvider`.

## Where the data comes from

All persistence is in `src/lib/db.ts` (Firestore client SDK, top-level **`clients`** collection keyed
by `uid`):

- `getClients(organizationId)` — directory query, filtered by `organizationId`.
- `getClient(uid)` — single doc; **does not filter by org** (see tenant isolation below).
- `updateClient(uid, partial)` / `deleteClient(uid)`.
- Notes live in the **`clients/{clientId}/notes` subcollection** (`ClientNote`): `getClientNotes`
  (hides soft-deleted unless `includeDeleted`), `addClientNote`, `softDeleteClientNote`.

**Client creation is a server action**, not a `db.ts` write: `createClient` in
`src/server/client-actions.ts` mints the `clientCode`/`clientNumber` reference code in a transaction
and resolves the org from the verified caller (`src/server/auth.ts` — never trusted from the client). There is no
`addClient` helper anymore (root AGENTS.md rule #5). Only updates/deletes go through `db.ts`.

`clientCode` is what links a client to its projects' display: `createProject` copies the selected
client's `clientCode` onto the project at creation.

## Notes are append-only + activity-logged (don't bypass this)

Client notes are an audit surface, not editable text:

- `addClientNote` writes the note **and** a `note_added` `Activity` in one atomic `writeBatch`; notes
  are immutable once created (no update path).
- `softDeleteClientNote` stamps `deletedAt`/`deletedBy` and writes a `note_deleted` activity in the
  same batch — the doc is **never physically removed**. Creator-only enforcement is the caller's (and
  Firestore rules') responsibility.
- Both denormalize the client display name as `sourceLabel` onto the activity's `source`, and stamp
  the current user as an `ActivityActor` whose `name` is `profile.fullName` (see the project memory
  note on activity actor naming). Keep the note write and the activity write together.

## Tenant isolation — read this before touching the detail route

`getClient(uid)` returns **any** org's client (docs are addressed by a guessable id). The detail page
guards it: [[clientId]/page.tsx]([clientId]/page.tsx) compares `clientData.organizationId !== organizationId`
and redirects to the directory if it doesn't match. **Keep that guard.** If you add another caller of
`getClient`, re-apply the same org check.

## Cross-feature reuse

The detail page hosts the **Projects** feature's `ProjectFormDialog` directly to add a project
pre-linked to this client (`lockedClientId` + `clientName`, `clients={[client]}`), submitting through
`createProject`. Don't fork the project form here — changes to it ripple in from the projects folder.

## Conventions easy to break

- **Form changes are three-touch.** A new client field means updating `clientSchema`,
  `EMPTY_CLIENT_FORM`, **and** the `defaultValues` mapping where the dialog is opened (the edit page
  builds it inline from the `Client`). Plus a `Controller` in `client-form-dialog.tsx`. Miss one and
  RHF/Zod silently drop or mistype the field.
- **Phone/taxId/zip go through shared helpers.** `formatPhone`/`normalizePhone` + `isValidUsPhone`
  (USA 10-digit), `formatTaxId`/`normalizeTaxId`, `formatZip`/`isValidUsZip` from `@/lib/utils`. Never
  write a local formatter (root AGENTS.md). Note `Client.phoneCountry` exists on the type for future
  international support, but the current schema validates US-only.
- **`isCompany` drives required fields + display.** Cards/headers show `company` when set, else
  `firstName lastName`; the schema requires `company` only when `isCompany`. Keep the legacy fallback
  (`isCompany` inferred from `company`/`taxId`) for records that predate the flag.
- **`organizationId` is the effect dependency, not `profile`.** Both routes depend on the stable
  `organizationId` string from `useAuth` (the `profile` object identity churns each heartbeat). Keep
  it that way — `page.test.tsx` enforces this for the directory page and fails if the effect refires
  on profile churn.
- **Use `getClientName`** instead of reading `firstName`/`lastName` directly, so trimming/fallbacks
  stay consistent across the directory and profile.
