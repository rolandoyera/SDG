# Library Feature — Agent Notes

> Global dev rules live in the repo root [AGENTS.md](../../../../../../../AGENTS.md). This file
> only captures Library-specific context that isn't obvious from the code.

## Maintain this file

**Whenever you change Library code (this folder, or the library-related helpers in
`src/lib/{db,library-image-mirror}.ts` and the `autofillProductFromUrl` action in
`src/server/ai-actions.ts`), update this file in the same change.** If a fact here is now wrong,
correct it; if you add/remove a field, action, helper, or convention, reflect it. A stale AGENTS.md is
worse than none — treat updating it as part of "done," not optional.

## What this feature is

The Global Product Library — an org-wide catalog of items (`LibraryItem` in `@/lib/types`) reused
across projects and proposals. Two routes, both **client components**:

- [page.tsx](./page.tsx) — the catalog: searchable, category/subcategory-filtered grid of
  `LibraryItemCard`s, plus the "Add Item" dialog. Honors `?add=true` (Quick Create deep link) on
  mount and clears it via `window.history.replaceState` (root AGENTS.md rule #3).
- [[itemId]/page.tsx]([itemId]/page.tsx) — a single item: gallery, pricing, spec matrix, notes, and
  edit/delete.

## Files in this folder

- `_components/library-constants.ts` — the **single source of truth** for the form: `libraryItemSchema`
  (Zod), `LibraryItemFormData` (inferred), `EMPTY_LIBRARY_ITEM_FORM`, `libraryItemToForm`
  (LibraryItem → form), the taxonomy (`CATEGORIES`, `SUBCATEGORIES` keyed by category), the enums
  (`COST_TYPES`, `UNIT_TYPES`), `MAX_IMAGES` (6), and `withProtocol`. The `LibraryItem` type lives in
  `@/lib/types`.
- `_components/use-library-item-form.ts` — **the form engine** (`useLibraryItemForm`, exported type
  `LibraryItemFormApi`). Wraps RHF and owns everything stateful: pricing math, image upload/reorder/
  cover/remove, the AI autofill flow, and `tempItemId`. The page hosts this hook and passes the API
  down to the dialog (the dialog is stateless). See "Form ownership" below.
- `_components/library-item-form-dialog.tsx` — the shared add/edit dialog (RHF `Controller`s, the
  drag-sortable image grid, "Autofill with AI", per-image copy/download/cover/delete). Props of note:
  `lockVendor` (read-only vendor — used when adding from a vendor page) and `uploaderId` (must be
  unique if two instances ever mount together).
- `_components/quick-vendor-dialog.tsx` — inline "create a vendor without leaving the form"; on create
  it's prepended to the local vendor list and selected in the form.
- `_components/library-item-card.tsx` — catalog grid card.
- `_components/item-detail-header.tsx`, `item-gallery-card.tsx`, `item-pricing-card.tsx`,
  `item-spec-matrix.tsx`, `item-notes-cards.tsx` — detail-page pieces.
- `_components/delete-item-dialog.tsx` — confirm-delete for a single item.

## Where the data comes from

All persistence is in `src/lib/db.ts` (Firestore client SDK, top-level **`library`** collection keyed
by `itemId`):

- `getLibraryItems(organizationId)` — catalog query, filtered by `organizationId`.
- `getLibraryItem(itemId)` — single doc; **does not filter by org** (see tenant isolation below).
- `addLibraryItem(item, customItemId?)` / `updateLibraryItem` / `deleteLibraryItem(itemOrId)` —
  `deleteLibraryItem` also GCs the item's Storage images. `itemId` is `item-<random>`; the form
  pre-generates it as `tempItemId` so uploads land under the right item before the doc exists.
- `getVendorLibraryItems(orgId, vendorId)` — items linked to a vendor (used by the Vendors feature's
  delete guard).
- `uploadLibraryImage(organizationId, file, itemId?, imageId?)` — Firebase Storage upload returning
  `{ url, path }`, written to the org-partitioned path `library/{organizationId}/{itemId}/images/
{imageId}.{ext}` (Tier 2 Storage rules; see `storage.rules`). 5MB client cap.
- **All library images (manual `uploadLibraryImage` and AI-mirrored `uploadLibraryImageBlob`) live
  under the same `images/{imageId}.{ext}` path with a random `imageId` — there is no separate
  `cover.{ext}` file.** The cover is simply whichever image `coverImageUrl`/`coverImagePath` points at
  (normally the first). Every upload gets a unique path, and uploads set
  `Cache-Control: public, max-age=31536000, immutable` (`IMMUTABLE_MEDIA_CACHE` in `db.ts`). Because a
  changed image always yields a new download URL (new path, or a fresh token on overwrite), the
  bytes can be cached forever without going stale — this, not `next.config` `minimumCacheTTL`, is what
  keeps covers fresh. (`minimumCacheTTL` only floors sources that lack a long header, e.g. Instagram.)

Items are created directly via `addLibraryItem` (no reference code / server action — unlike
clients/projects/contracts). Keep it that way unless library items gain a reference code.

## Form ownership — the page hosts the hook, the dialog is stateless

Both routes call `useLibraryItemForm()` and pass the returned `form` API into `LibraryItemFormDialog`.
**The page owns submission**, not the dialog. On submit, the page:

1. calls `mirrorExternalImagesToFirebase(organizationId, { imageUrls, coverImageUrl, coverImagePath,
images }, itemId)` (`src/lib/library-image-mirror.ts`) to pull any **external** (AI-sourced) image
   URLs into our Storage so the item self-hosts them, then
2. on **add** → `addLibraryItem(..., form.tempItemId)`; on **edit** → `deleteReplacedStorageFiles(prevPaths,
nextPaths)` to GC swapped-out blobs (**abort the update if that cleanup throws**), then
   `updateLibraryItem`.

This same hook + dialog are **reused outside this folder** — the Vendors detail page hosts them to
create an item pre-linked to a vendor (`lockVendor`), and `projects/.../add-items-dialog.tsx` imports
the taxonomy/enums from `library-constants`. Don't fork these; changes here ripple to those callers.

## Tenant isolation — read this before touching the detail route

`getLibraryItem(itemId)` returns **any** org's item (docs are addressed by a guessable id). The detail
page guards it: [[itemId]/page.tsx]([itemId]/page.tsx) compares `itemData.organizationId !== organizationId`
and redirects to the catalog if it doesn't match. **Keep that guard.** If you add another caller of
`getLibraryItem`, re-apply the same org check.

## AI autofill ("Autofill with [assistant]")

The sourcing-link field's button calls `autofillProductFromUrl(url)` (`src/server/ai-actions.ts`, a
`"use server"` action; Gemini + scrape, keys server-only), wrapped in `runAiActionWithRetry` with a
progress toast. It fills scalar specs (name, sku, category, finish, materials, dimensions, msrp, …)
plus image URLs and writes `aiMetadata` (source url, model, confidence). It only mutates **form
state** — nothing is saved until the user submits, and the mirror step (above) runs at save time.

- **Blocked-site fallback (url_context).** The scraper is Jina Reader; when the target site's WAF
  rejects it (e.g. Akamai/Cloudflare 403 — common on big vendors like fergusonhome.com), the action
  falls back to one Gemini call with the `urlContext` tool (`SCRAPER_CONFIG.urlContextModel`), which
  fetches the page through Google's infrastructure that most WAFs allow. Specs still fill; **image
  results are usually thin on these sites** (no HTML/markdown to harvest URLs from — the model only
  sees what url_context returns). When the fallback extracts a SKU but no images, it tries a
  **SERP image rescue**: a DataForSEO Google Images query (~$0.002/call, reusing the
  position-tracking `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD`; silently skipped when unset) that
  only accepts results provably of this product — indexed from the same product page, SKU baked
  into the image URL, or manufacturer domain + SKU match. Titles lie (a "PNLHP" title can front
  a chrome-finish image), so the SKU check trusts only the image URL; lookalikes/wrong finishes
  are dropped, not guessed, and accepted img-b.com (Ferguson) URLs get their Cloudinary
  transform upsized. (Google's Custom Search JSON API was the original plan — closed to new
  customers, discontinued Jan 2027; don't resurrect it.) If images are still empty,
  `use-library-item-form.ts` shows a warning toast ("filled the specs but couldn't retrieve
  images") instead of the success toast — that's deliberate; never attach unverified images.
  Two hard constraints: the REST field must be camelCase `urlContext` (snake_case silently
  no-ops), and the model must stay Gemini 3.x (2.5-era models 400 on tools + JSON response mode).

- **AI re-scrape preserves manual uploads.** `manualImageUrls` tracks user-uploaded images (always
  Firebase-hosted). A re-scrape **replaces only the AI portion** of `imageUrls` and keeps the manual
  anchors — it does **not** append. Appending piled up duplicates, because a saved item's AI images
  are Firebase-mirrored copies of the same photos the scraper returns again as raw vendor URLs (same
  picture, different string). Don't switch this back to append.

## Conventions easy to break

- **Form changes are three-touch.** A new item field means updating `libraryItemSchema`,
  `EMPTY_LIBRARY_ITEM_FORM`, **and** `libraryItemToForm` in `library-constants.ts`, plus rendering a
  `Controller` in `library-item-form-dialog.tsx`. Miss one and RHF/Zod silently drop or mistype it.
- **Pricing is derived, not free-typed.** `unitCost`/`markup` drive `sellingPrice` (`updatePricing`);
  editing `sellingPrice` back-computes `markup` (`setSellingPrice`). Keep both directions in sync.
- **Images cap at `MAX_IMAGES` (6).** Upload, AI fill, and reorder all respect it; the first image is
  the cover (`coverImageUrl`/`coverImagePath`). Use the hook's `setAsCover`/`reorderImages`/
  `removeImageUrl` — they keep `imageUrls`, `images`, `manualImageUrls`, and the cover consistent.
- **`organizationId` is the effect dependency, not `profile`.** Both routes depend on the stable
  `organizationId` string from `useAuth` (the `profile` object identity churns each heartbeat);
  refetching on `profile` would reload the whole catalog every heartbeat. The catalog effect also
  depends on `form.reset` (stable `useCallback`) — keep it stable.
- **Storage cleanup gates edit saves.** On edit, `deleteReplacedStorageFiles` runs before
  `updateLibraryItem` and the save **aborts if cleanup throws** (object-not-found is ignored
  internally). Keep that ordering.
