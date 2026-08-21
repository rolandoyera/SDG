# Library Feature — Agent Notes

> Global dev rules live in the repo root [AGENTS.md](../../../../../../../AGENTS.md). This file
> only captures Library-specific context that isn't obvious from the code.

## Product images are measured, not guessed

`autofillProductFromUrl` runs candidates through `measureImageCandidates`
(`src/server/image-probe.ts`) before the model ever sees them: each URL is rewritten toward its true
original, probed with a ranged GET for real pixel dimensions, deduped by measured
`(width, height, bytes)`, and ranked largest-first. `PRODUCT_CANDIDATE_LIMIT` (10) caps how many are
offered; the model still picks up to `MAX_IMAGES` (6) for the gallery. The prompt lists each
candidate with its measured `[WxH]`.

- **BigCommerce sizing also lives in a path SEGMENT** (`/images/stencil/50x50/products/…` vs
  `/1400x1400/…`), invisible to filename/query rules. `originalVariants` rewrites the segment to
  `original` (the untransformed master — measured larger than `2560w` on cdn11.bigcommerce.com),
  with `2560w` as the second guess. Without this, a page whose gallery markdown only carries `50x50`
  thumbs (finearthl.com variant swatches) shipped 50px images as gallery entries.

- **Cloudinary sizing lives in a path SEGMENT** (`/image/private/t_base,c_lpad,f_auto,dpr_2,w_450,h_450/…`),
  which no filename or query rule can see. Two traps, both measured on fergusonhome.com:
  **removing the segment 404s** (`/image/private/` requires a transform), and **raising `w_` alone
  UPSCALES** — `c_lpad,w_2000` returns a 2000×2000 canvas built from a 600×600 master, which would
  have badged a padded thumbnail as full resolution. `originalVariants` rewrites to
  `c_limit,w_3000`, keeping `t_*` and `f_auto`: `c_limit` never enlarges, so what comes back is the
  genuine master.
- **`dpr_2` doubles the nominal width** — a `w_450,h_450,dpr_2` URL really is 900×900. Don't read
  size off the transform; that's what the probe is for.
- **Model-returned URLs are mapped back onto measured candidates** by `imageDedupKey`. The prompt
  deliberately lets it supplement the list from the page markdown, so it can hand back a smaller
  rendition of an asset we already measured a bigger version of. Fixing that by prompt wording was
  tried in the vendor flow and lost; substitution is the reliable form.

## Blocked sites (Akamai, Cloudflare, …) — escalation chain

`autofillProductFromUrl` runs: **Jina markdown → Firecrawl → url_context → error.**

- **`looksBlocked` gates it on a LENGTH FLOOR plus markers, not one phrase.** The old check matched
  only Jina's `Warning: Target URL returned error` wrapper. fergusonhome.com product pages return an
  Akamai interstitial ("Powered and protected by …akamai…") that parses as perfectly valid markdown
  and carries no warning line — so it sailed through and the model extracted **"Unnamed Product"**
  from the block page. Real product pages measured thousands of markdown chars; the interstitial is
  ~300. `MIN_USABLE_MARKDOWN` is 600, and `BLOCK_MARKERS` is shared with the vendor flow.
- **Firecrawl (`FIRECRAWL_API_KEY`) runs before url_context** — it returns the real page, images
  included, where url_context only gets Google's text digest. Verified on the Ferguson product page:
  300-char block → 9254 md chars → name, SKU `63075LF-PGLHP`, manufacturer Brizo, MSRP 674.64,
  finish, and 4 images. Request `rawHtml`, never `html` (Firecrawl's `html` drops `<head>`, taking
  og:image and JSON-LD with it).
- **A challenge page is HTTP 200 with a body**, so non-empty HTML is not proof of success —
  `looksBlockedHtml` discards the direct fetch's result when it looks like a sensor stub, and
  Firecrawl's HTML takes precedence when it fired.
- Firecrawl is slow (~15s cold) and metered: keep it as the escalation tier, not the default —
  with one carve-out: `DOMAIN_SCRAPE_HINTS` in `src/config/scraper-config.ts` routes domains whose
  WAF blocks Jina **every time** (fergusonhome.com/Akamai) to Firecrawl first, skipping the
  guaranteed-to-fail Jina round-trip. Jina stays as that path's fallback, and the escalation block
  won't retry Firecrawl after a hint already ran it. Entries are earned by observed failures in the
  diagnostic runs, never curated speculatively; scraping mechanics stay in generic platform rules.

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
  `LibraryItemCard`s, plus the "Add Item" dialog. Honors `?add=true` (Quick Create deep link) via
  the shared `QuickCreateTrigger` (`../_components/quick-create-trigger.tsx`), which reacts to
  same-page navigations and clears the param via `window.history.replaceState` (root AGENTS.md
  rule #3), preserving any other params. The category/subcategory filters are **URL-driven** (`?category=`/`?subcategory=`,
  read via `useSearchParams`, absent = "All"): filter changes sync back with
  `window.history.replaceState` (no navigation/refetch), and the category/subcategory badges on
  `LibraryItemCard` and `ItemDetailHeader` link to the filtered catalog. `useSearchParams` is why
  the default export wraps `LibraryContent` in `Suspense` — required on a static route.
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

The sourcing-link field's button is the shared `AiButton` (`@/components/ui/ai-button` — owns the
indigo styling, LunaMoon icon, and shimmer/"Analyzing…" loading state; pass `loading` separately
from `disabled`). It calls `autofillProductFromUrl(url)` (`src/server/ai-actions.ts`, a
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

- **Spec sheet PDFs — one slot, spec-sheet labels beat reference drawings.** Extraction returns
  `specSheetUrl` (links labeled Spec/Specification Sheet/Specifications/Cut/Tear Sheet; "Reference
  Drawings" only counts when no spec-sheet label exists — some vendors, e.g. Fine Art, use it as
  their spec sheet). The URL is only trusted after `probeIsPdf` (`image-probe.ts`) confirms `%PDF`
  bytes. It lands on the form as `specSheet: { url, path: "" }` (never clobbering an existing
  sheet), and the save-time mirror (`mirrorSpecSheet` inside `library-image-mirror.ts`, via the
  `fetchPdfBytes` server action — no weserv retry, PDFs only) self-hosts it at
  `library/{orgId}/{itemId}/docs/{docId}.pdf` with `contentType: application/pdf` (what makes the
  URL open inline in the browser viewer). **storage.rules carves out the `docs/` segment as the
  only non-image upload path** (PDF-only, 15 MiB) — rules changes there must pass
  `npm run test:rules:emulator`. Manual upload lives in `item-spec-matrix.tsx` ("Upload Spec Sheet"
  → "View Spec Sheet"), which updates the item directly and GCs a replaced sheet; item deletion and
  the edit-save cleanup both include `specSheet.path`.

- **Jina's `X-Remove-Selector` strips related-product carousels, not just chrome.** Related/"you
  may also like" sections put competing SKUs and prices right next to the real ones (on
  finearthl.com they were 63% of the scrape), so the header removes them (`#tab-related` for
  BigCommerce, `product-recommendations` for Shopify, plus common theme classes) along with
  newsletter blocks. If extraction ever returns a _neighboring_ product's SKU/price, check whether
  that vendor's related section uses a class the list misses.

- **Variant disambiguation when the URL doesn't pin one.** Many vendor sites (e.g. BigCommerce —
  finearthl.com) keep the variant selection in client-side state, so a copied product link always
  lands on the default variant. The extraction prompt (shared by the Jina/Firecrawl and url*context
  tiers via `productFieldInstructions` + `PRODUCT_RESPONSE_SCHEMA`) returns `variantOptions`
  (`ProductVariantOption[]`: label, sku, finishColor, imageUrl) **only when the URL doesn't already
  identify a variant** — and that condition is enforced deterministically by `urlPinsVariant()`
  (Shopify `?variant=`, WooCommerce `attribute*\*`, sku params), not just by the prompt: the model
hedges and returns the full list when it can't map an opaque variant id to an option (seen on
arhaus.com). Variant image URLs get the same measured-original upgrade as gallery images.
When more than one comes back, the hook exposes `variantOptions`/`selectedVariantLabel`/
`applyVariant`and the dialog shows a "which one did you select?" chip picker under the sourcing
link. A pick resolves into the existing flat fields (sku, finishColor, image promoted to cover)
and clears the confidence entries it overwrites, same as a manual edit. The options are transient
UI state — never persisted to`LibraryItem`, cleared on `reset` and on every re-scrape.

- **AI re-scrape preserves manual uploads.** `manualImageUrls` tracks user-uploaded images (always
  Firebase-hosted). A re-scrape **replaces only the AI portion** of `imageUrls` and keeps the manual
  anchors — it does **not** append. Appending piled up duplicates, because a saved item's AI images
  are Firebase-mirrored copies of the same photos the scraper returns again as raw vendor URLs (same
  picture, different string). Don't switch this back to append.

## Conventions easy to break

- **Radix Select echoes programmatic value changes — keep the onValueChange guards.** Radix's hidden
  native select re-emits value changes set via RHF back through `onValueChange` (and emits `""` when
  the matching item isn't mounted yet in that commit). The dialog's category handler ignores
  `val === field.value` (otherwise an AI autofill's category echo wipes the subcategory it just set)
  and the subcategory handler ignores empty/no-op values. `library-item-form-dialog.test.tsx` pins
  this — don't simplify the handlers back to bare `field.onChange`-with-side-effects.

- **Form changes are three-touch.** A new item field means updating `libraryItemSchema`,
  `EMPTY_LIBRARY_ITEM_FORM`, **and** `libraryItemToForm` in `library-constants.ts`, plus rendering a
  `Controller` in `library-item-form-dialog.tsx`. Miss one and RHF/Zod silently drop or mistype it.
- **Pricing is derived, not free-typed.** The client pays MSRP and the markup % is the margin
  backed out of it: `sellingPrice = msrp`, `unitCost = msrp × (1 − markup/100)` (MSRP $100 @ 20%
  → cost $80, selling $100 — `deriveFromMsrp`). Each field has its own setter (`setMsrp`,
  `setMarkup`, `setUnitCost`, `setSellingPrice`) and all stay editable: a manual `unitCost`
  back-computes `markup` off MSRP; a manual `sellingPrice` is a pure override (client discount)
  that markup/MSRP edits will re-derive. Items with **no MSRP** run the same margin off cost
  instead (`sellingPrice = unitCost ÷ (1 − markup/100)`), and there `sellingPrice` edits
  back-compute `markup`. The default markup % for new items comes from Company Settings
  (`OrgSettings.defaultMarkupPercent`, fetched via `getOrganization` into a ref so `reset` stays
  stable), falling back to `EMPTY_LIBRARY_ITEM_FORM.markup` (20) when unset.
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
