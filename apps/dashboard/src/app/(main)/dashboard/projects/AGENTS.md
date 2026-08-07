# Projects Feature — Agent Notes

> Global dev rules live in the repo root [AGENTS.md](../../../../../../../AGENTS.md). This file
> only captures Projects-specific context that isn't obvious from the code.

## Maintain this file

**Whenever you change Projects code (this folder, or the project-related helpers in `src/lib/db.ts`
and `createProject` in `src/server/project-actions.ts`), update this file in the same change.** If a
fact here is now wrong, correct it; if you add/remove a field, action, helper, column, or convention,
reflect it. A stale AGENTS.md is worse than none — treat updating it as part of "done," not optional.

## What this feature is

A project workspace. Two routes, both **client components**:

- [page.tsx](./page.tsx) — the directory: searchable grid of project cards, plus the "Add Project"
  dialog. Requires at least one client to exist first (the button routes to `/dashboard/clients`
  otherwise).
- [[projectId]/page.tsx]([projectId]/page.tsx) — a single project, **tabbed**: Overview, Items,
  Files, Invoices (placeholder), Settings (Timelines placeholder + Dropbox connect — see below). The
  active tab is mirrored into the URL as `?tab=` via `window.history.replaceState` so refresh/copied
  links land on the same tab.

## Files in this folder

- `_components/project-constants.ts` — **single source of truth** for the project form: `projectSchema`
  (Zod), `ProjectFormData`, `EMPTY_PROJECT_FORM`, `projectToForm` (Project → form), the status
  registries (`PROJECT_STATUSES`, `PROJECT_STATUS_LABELS`, `PROJECT_STATUS_VARIANT` — keeps status
  pills on shared Badge variants so they can't drift), and the tab registry (`PROJECT_TABS`,
  `ProjectTab`, `isProjectTab`). The `Project` Firestore type lives in `@/lib/types`.
- `_components/project-form-dialog.tsx` — the add/edit dialog (RHF + `zodResolver`), incl. the
  "same as main client address" toggle. **Reused outside this folder:** the Clients detail page
  (`../clients/[clientId]/page.tsx`) hosts this dialog directly (with `lockedClientId`) to add a
  project pre-linked to a client, and `clients/_components/client-projects-card.tsx` imports the
  status registries from `project-constants`. Changes here ripple into `clients/` — don't fork.
- `_components/project-header.tsx` — detail title + status, tab bar, edit/delete actions.
- `_components/project-information-card.tsx`, `project-notes-card.tsx`, `project-proposals-card.tsx`,
  `project-files-card.tsx` — Overview-tab cards (proposals card spawns a Draft proposal and routes to
  it; files card lists project documents + contracts). `project-brief-card.tsx` also exists (renders
  the single free-form `Project.brief` field, edited via the form dialog) but is **not currently
  mounted** in the Overview layout — keep or wire it back per design.
- `_components/project-notes-card.tsx` — the Overview **Notes** card: an editable log backed by the
  `projects/{projectId}/notes` subcollection (see "Project notes" below). Reuses the client-notes card
  shape but, unlike client notes, notes here are **editable** (author-only, stamps `updatedAt`/
  `updatedBy`, shows an "edited" marker) and **hard-deleted** (author-only, a real `deleteDoc`, not a
  soft-delete). One composer dialog serves both add and edit. The page does optimistic state updates
  on add/edit/delete (one-time fetch, like proposals — not realtime).
  The **files card is realtime**: two
  `onSnapshot` listeners (`projectDocuments` and `contracts`, both queried by org and filtered to this
  project in memory) replace the old one-time fetch, and its Status column renders the **shared
  `ContractStatusChain`** (`contracts/_components/contract-status-chain.tsx`) so the live
  delivery/view/sign status — including **Delivery Failed** — matches the contracts list exactly. Org
  user names are still a one-time fetch (they rarely change in a session). The row **Actions** column
  is a `TooltipDropdownMenu` (for a stored file: **View signed PDF** — opens it inline via
  `${fileUrl}?inline=1` in a new tab — plus **Download**; for a draft contract: open it in the builder;
  and **resend signing link** — the recovery path for a delivery failure). Eligibility is the shared `canResendContract`
  (`@/lib/contract-resend`); the resend itself uses the shared `useResendSigningLink` hook
  (`contracts/_components/use-resend-signing-link.ts`) for the call + toast + per-row spinner, and the
  realtime listener reflects the fresh `sent` cycle. Both are shared with the contracts list so the
  rule + UX can't drift (see contracts AGENTS "Signing link: expiry + resend").
- `_components/delete-project-dialog.tsx` — confirm-delete for the whole project.
- `tabs/project-settings.tsx` — the **Settings tab**. Two sections: **Timelines** (placeholder only)
  and **Project Imagery**, which hosts the **Dropbox** integration. The Dropbox account connects
  **org-wide** (connect once per organization, mirroring the Meta/Instagram integration), then each
  project links **one folder** via the folder picker (stored in the generic `imagerySets` map under a
  single fixed key, `"imagery"`). Its images render as a thumbnail gallery + lightbox. See "Dropbox
  integration" below.
- `tabs/_tab_components/dropbox-folder-picker.tsx` — the folder-picker dialog. Browses the connected
  Dropbox folder-by-folder (files dropped server-side) via the `browseDropboxFolders` action: click a
  row to select, click its chevron to drill in, breadcrumb to jump back. `onLink(folder)` hands the
  choice back to `project-settings.tsx`, which persists it; the dialog owns no persistence but stays
  open (button spinner) until the awaited write commits — the gallery's first fetch resolves the
  linked folder from the project doc **server-side**, so rendering it before the write lands races
  that read and errors with "No folder linked".
- `tabs/project-items.tsx` — the **Items tab** (the heavy one — see its own section below).
- `tabs/_tab_components/items-table.tsx` — the list-view items grid renderer.
- `tabs/_tab_components/add-items-dialog.tsx` — add items to a section: "Library Items" (multi-select
  from the catalog with per-item qty) or "Create New Item" (custom form, optionally also saved to the
  Global Library). Catalog add spreads the library item minus `itemId`/`updatedAt` and stamps
  `libraryItemId`. Category/subcategory/unit/cost constants are imported from
  `../../../library/_components/library-constants` — don't fork them.
- `tabs/_tab_components/edit-item-dialog.tsx` — edit a single `ProjectRoomItem` in place. Also
  imports the category/subcategory/unit/cost constants from
  `../../../library/_components/library-constants` — don't fork them.

## Where the data comes from

Three **top-level** Firestore collections, all addressed by their own id and queried by `projectId`
(items also carry `organizationId`). All persistence is in `src/lib/db.ts`:

- `projects` — `getProject(projectId)` (single doc; **does not filter by org**), `getProjects(orgId)`,
  `updateProject`, `deleteProject`, `formatProjectAddress`.
- `projectRooms` ("sections") — `addProjectRoom`, `updateProjectRoom`, `deleteProjectRoom`,
  `getProjectRooms`. Ids are `room-<random>`, generated in `db.ts`.
- `projectRoomItems` — `addProjectRoomItem`, `updateProjectRoomItem`, `deleteProjectRoomItem`,
  `reorderProjectRoomItems`, `getProjectRoomItems`. Ids are `roomitem-<random>`.

**Project creation is a server action**, not a `db.ts` write: `createProject` in
`src/server/project-actions.ts` mints the `projectCode`/`projectNumber` reference code in a
transaction and copies the selected client's `clientCode` (root AGENTS.md rule #5). The list page
calls it; only updates/deletes go through `db.ts`. There is no `addProject` helper anymore.

## Project notes (`projects/{projectId}/notes` subcollection)

Editable working notes — a **parent subcollection**, not a flat collection (mirrors `ClientNote`'s
storage choice; the per-project read needs no `where`/index). `db.ts` helpers (client-SDK writes,
governed by the rule below — these are not server actions): `getProjectNotes(projectId)` (newest
first), `addProjectNote(...)`, `updateProjectNote(...)`, `deleteProjectNote(projectId, noteId)`. Ids
are `note-<random>`. Note the **deliberate divergence from client notes**: project notes are mutable
and **hard-deleted** — there is no `deletedAt`/soft-delete here. Only **add** writes an activity
(`note_added` into the flat `activities` collection, batched with the note, `source.type: "project"`);
edits and deletes are silent. `ProjectNote` is typed in `@/lib/types`; `ActivityEntityType` now
includes `"project"` so the activity's `source` can point at a project.

Firestore rule (`firestore.rules`, `projects/{projectId}/notes/{noteId}`): org is the **parent
project's** (so unfiltered list queries are allowed); create must self-attribute (`createdBy.id ==
auth.uid`) and match org; update is **author-only** and constrained to `['body','updatedAt',
'updatedBy']`; delete is **author-only** (a real delete). Covered by a case in
[`firestore/rules.test.ts`](../../../../../firestore/rules.test.ts).

## Dropbox integration (Settings tab)

Org-wide Dropbox OAuth, following the **Meta integration** pattern exactly (`server/meta-graph.ts`,
`server/meta-actions.ts`, `app/api/integrations/meta/*`). Split by sensitivity:

- **Secret tokens** → `organizations/{orgId}/secrets/dropbox` (`DropboxSecrets` in `src/types/dropbox.ts`):
  `accessToken` (~4h), `refreshToken` (long-lived, from `token_access_type=offline`), `expiresAt`,
  `accountId`. Server-only — `firestore.rules` denies all client reads of `secrets/*`. Written by the
  firebase-admin SDK in `src/server/dropbox.ts` (`storeDropboxConnection`); read by
  `getStoredDropboxSecrets`.
- **Display flag** → org doc `config.dropboxIntegration` (`DropboxIntegrationConfig`): `connected`,
  `accountName`, `accountEmail`, `accountId`, timestamps. Read by client components via the
  `getDropboxConnection()` server action (`src/server/dropbox-actions.ts`); `disconnectDropbox()`
  clears both the config (`FieldValue.delete()`) and the secret doc.

OAuth flow (`src/app/api/integrations/dropbox/`):

- `login/route.ts` — org from `ACTIVE_ORG_COOKIE`; a `?returnTo=` query (guarded to `/dashboard/...`)
  rides in `state` (base64url `{organizationId, nonce, returnTo}`) so the user lands back on the same
  project's Settings tab. Sets an httpOnly `dropbox_oauth_state` nonce cookie (CSRF), redirects to
  `https://www.dropbox.com/oauth2/authorize` with `token_access_type=offline`.
- `callback/route.ts` — verifies nonce vs cookie, exchanges the code at
  `https://api.dropboxapi.com/oauth2/token`, fetches the account, stores the connection, and redirects
  to `returnTo` with a `?dropbox=<status>` result param. `project-settings.tsx` toasts that status and
  scrubs the param via `replaceState`.

Folder linking (one folder per project):

- **Data model** → `Project.imagerySets?: Record<string, ProjectImagerySet>` (`@/lib/types`). The map is
  **generic** but the UI links only **one** folder, under the fixed key `"imagery"` (`IMAGERY_SET_ID` in
  `project-settings.tsx`); linking replaces the whole map, unlinking writes `{}`. Each value is
  `{ path (Dropbox path_lower), name, linkedAt, linkedBy }`. Written client-side via
  **`updateProjectImagerySets`** (`src/lib/db.ts`) — mirrors `updateProjectItemsLayout`: a settings
  write that **does not bump `lastActivityAt`**. (Project update is `updatesInOwnOrg()` with no field
  allowlist, so this needs no server action.)
- **Browsing** → the `browseDropboxFolders(path)` server action (`dropbox-actions.ts`; root path is
  `""`, not `/`) calls `getValidDropboxAccessToken` + `listDropboxFolders` (`src/server/dropbox.ts`).
  `getValidDropboxAccessToken` **refreshes on expiry** using the stored `refreshToken` and persists the
  new access token back to `secrets/dropbox`. `listDropboxFolders` returns folders only (files dropped),
  following Dropbox pagination.
- **UI** → `tabs/_tab_components/dropbox-folder-picker.tsx` (browse/select).

Gallery (designer-facing view of the linked folder's images):

- **Listing** → `listProjectSetImages(projectId, setId)` action (org from cookie, tenant-guards the
  project, resolves `imagerySets[setId].path`) → `listDropboxImages` (top-level image files only,
  keyed by Dropbox file `id` — stable across rename/move, for future portal curation).
- **Thumbnails** → the proxy route `api/projects/[projectId]/imagery/[setId]/thumb/route.ts` (same trust
  model as `api/project-documents/.../download`): org from cookie, org-scoped, and the `?path=` is
  **scope-guarded to the linked folder** (never serves bytes outside it). Streams Dropbox
  `get_thumbnail_v2` bytes (`fetchDropboxThumbnail`) with `cache-control: private, max-age=3600`.
  `?size=full` (2048px) backs the lightbox; default (640px) backs the grid. Photos are served as Dropbox
  JPEG thumbnails; alpha-capable sources (png/gif/webp) can't use Dropbox's thumbnailer — it flattens
  transparency onto white even with `format=png` (verified against the API) — so the route downloads the
  original and resizes with sharp to WebP (alpha preserved, ~40KB from a 38MB render). The gallery
  renders these with a plain `<img loading="lazy">` (not `DashboardImage`/next/image): the proxy already
  returns a sized, cache-controlled image, and Next 16 rejects same-origin `next/image` srcs that carry a query
  string unless `images.localPatterns` is configured — the plain tag consumes the proxy's cache headers
  directly and needs no config.
- **Component** → `tabs/_tab_components/dropbox-image-gallery.tsx` (grid + lightweight lightbox: the
  image fills the viewport via `object-contain` without overflowing; backdrop/X/Esc to close, ←/→ to
  navigate; grid-thumb placeholder + spinner and neighbor preload keep it feeling instant). Rendered by
  `ImagerySetCard` when a set is linked.

Env: `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`. The OAuth redirect URI is derived from the requesting
domain (`/api/integrations/dropbox/callback` on the current origin) so tenant domains round-trip to
themselves — every dashboard domain (and `http://localhost:3000` for dev) must be registered as a
redirect URI in the Dropbox App Console. `DROPBOX_REDIRECT_URI` is no longer read. **TODO (Phase 4):** portal curation — the designer selects a
subset of these images + a layout for the client portal; curated images will likely be **snapshotted to
Storage** (so the portal deliverable doesn't depend on Dropbox), meaning the portal needs no Dropbox
proxy of its own.

## Tenant isolation — read this before touching the detail route

`getProject(projectId)` returns **any** org's project (docs are addressed by a guessable id). The
detail page is responsible for the check: [[projectId]/page.tsx]([projectId]/page.tsx) compares
`projectData.organizationId !== organizationId` and redirects to the directory if it doesn't match.
**Keep that guard.** If you add another caller of `getProject`, re-apply the same org check.

## The Items tab (`tabs/project-items.tsx`) — the subtle part

Two views of the same rooms+items data, toggled by a grid/list switch and cross-faded with `FadeIn`:

- **Grid view** — one card per section, simple item rows. Not draggable.
- **List view** — one `ItemsTable` per section, rows draggable **within and across** sections.

### Realtime + shared column layout

The tab is **fully realtime** via three `onSnapshot` listeners set up in one effect (keyed on
`project.projectId`, `organizationId`, `authLoading`): the **project doc**, `projectRooms`, and
`projectRoomItems`. It seeds from the `initialProject` prop but then drives off live state
(`const [project, setProject] = useState(initialProject)`).

The list-view **column layout (visibility + widths) is shared across all viewers**, persisted on the
project doc as `itemColumnLayout` (`ItemColumnLayout` in `@/lib/types`) so the presentation is the
same for everyone printing/presenting it. This is deliberately subtle:

- Local edits flow through optimistic `columnVisibility`/`columnSizing` state and are written by a
  **debounced** effect (`LAYOUT_SAVE_DEBOUNCE_MS`, coalesces resize-drags) via
  **`updateProjectItemsLayout`** — a dedicated helper that writes only the layout and **does not bump
  `lastActivityAt`** (it's a presentation tweak, not project activity). Don't route layout writes
  through `updateProject`.
- `persistedLayoutRef` (a JSON string of the layout we believe is saved) breaks the
  snapshot→setState→save **feedback loop**: the project listener only re-applies an incoming layout
  when it differs from the ref; the save effect skips when the current layout equals the ref. Keep
  both guards if you touch this — without them, every viewer's echo triggers another write.
- `skipFirstPersistRef` skips the very first save run so merely opening the page never writes defaults
  back.

### The items grid (`items-table.tsx`)

A TanStack-Table **state layer rendered as a CSS grid, not a `<table>`** — widths are one declarative
`grid-template-columns` string (a `--items-cols` CSS var), which makes columns trivially resizable
without the table layout fighting back.

- **`ITEM_FIELDS` is the single source of truth**, and it lives in **`items-fields.tsx`** (a
  TanStack/dnd-free module) — `items-table.tsx` imports it and re-exports `ITEM_COLUMN_OPTIONS` /
  `DEFAULT_ITEM_COLUMN_VISIBILITY` for back-compat. The registry is split out so read-only consumers
  can mirror the same columns **without** pulling in the interactive table: the proposal preview
  (`portal/preview/proposal/[projectId]`) renders a static `ProposalItemsTable` from `ITEM_FIELDS` +
  the project's saved `itemColumnLayout` (same `cellClass`/track logic, no grip/actions/resize). Each
  entry becomes a TanStack column, a column-picker option (`ITEM_COLUMN_OPTIONS`), and a
  default-visibility flag (`DEFAULT_ITEM_COLUMN_VISIBILITY`). **To add/remove/relabel a column, edit
  `ITEM_FIELDS` only** — the picker, defaults, and the proposal table all derive from it.
  `thumbnail`/`actions` are structural (fixed px, never hidden/resized).
- **Default widths are proportional (`fr`)** so the grid fills the container on load at any screen
  size — no per-screen pixel guessing. A column the user resizes switches to a fixed `px` width
  (stored in `columnSizing`); the remaining `fr` columns absorb the slack.
- Both files declare **`"use no memo"`** — React Compiler is on, and TanStack table components render
  dead without it (see the project memory note). Don't remove it.
- **Cross-section drag:** the `DndContext` is lifted to the parent (`project-items.tsx`) so it spans
  every section; each section is a `useDroppable` (`room:<roomId>`, droppable even when empty), each
  row a `useSortable`. `onDragOver` re-homes the dragged item into the target section in local state
  for a live preview; `onDragEnd` settles order and persists via `reorderProjectRoomItems` (one batch
  write, passing `roomId` only for an item that changed sections). Order is held in
  `ProjectRoomItem.sortOrder` (new items append via `Date.now()`).

## Conventions easy to break

- **Form changes are three-touch.** A new project field means updating `projectSchema`,
  `EMPTY_PROJECT_FORM`, **and** `projectToForm` in `project-constants.ts`, plus a `Controller` in
  `project-form-dialog.tsx`. Miss one and RHF/Zod silently drop or mistype the field.
- **ZIP goes through shared helpers.** `formatZip` on display/change and `isValidUsZip` in the schema
  (root AGENTS.md). Never write a local formatter.
- **`organizationId` is the effect dependency, not `profile`.** Every route/effect here depends on the
  stable `organizationId` string from `useAuth` (the `profile` object identity churns each heartbeat).
  Keep it that way.
- **Sections must be empty before deletion.** The delete-section flow blocks (shows a "move/delete the
  items first" notice) when the section still has items; `deleteProjectRoom` only removes the room doc.
  Don't bypass the count guard (`deletingRoomItemCount`).
- **Tab state is URL-synced.** Changing tabs calls `replaceState` with `?tab=`; the initial tab reads
  it back via `isProjectTab`. Preserve that so refresh/links stay on the right tab.
- **Layout writes are special.** Use `updateProjectItemsLayout` (not `updateProject`) for column
  layout, and keep the `persistedLayoutRef` feedback-loop guards (see the Items-tab section).
