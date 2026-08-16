# Vendors Feature — Agent Notes

> Global dev rules live in the repo root [AGENTS.md](../../../../../../../AGENTS.md). This file
> only captures Vendors-specific context that isn't obvious from the code.

## Maintain this file

**Whenever you change Vendors code (this folder, or the vendor-related helpers in
`src/lib/{db,vendor-image-mirror,image-mirror}.ts` and the `autofillVendorFromUrl` action in
`src/server/ai-actions.ts`), update this file in the same change.** If a fact here is now wrong,
correct it; if you add/remove a field, action, helper, or convention, reflect it. A stale
AGENTS.md is worse than none — treat updating it as part of "done," not optional.

## What this feature is

A vendor directory (trade vendors / procurement reps). Two routes, both **client components**:

- [page.tsx](./page.tsx) — the directory: searchable, category-filtered grid of `VendorCard`s,
  plus the "Add Vendor" dialog.
- [[vendorId]/page.tsx]([vendorId]/page.tsx) — a single vendor profile: hero, linked library
  items, account/contact/notes cards, and edit/delete.

## Files in this folder

- `_components/vendor-constants.ts` — the **single source of truth** for the form: `vendorSchema`
  (Zod), `VendorFormData` (inferred type), `VENDOR_CATEGORIES`, `EMPTY_VENDOR_FORM`, `vendorToForm`
  (Vendor → form), and the international-address helpers: `COUNTRIES`
  (built from the `country-list` dep, US + Canada pinned), `countryName`, `regionLabelFor`
  (US→State, CA→Province, else→Region), and `formatVendorAddress`. The `Vendor` Firestore type
  itself lives in `@/lib/types`.
- `_components/vendor-form-dialog.tsx` — the add/edit dialog (RHF + `zodResolver`), image uploads,
  the "Enrich with AI" flow, and the `ImagePickerDialog` for choosing among scraped candidates.
  Re-exports the constants module so callers import everything from here.
- `_components/vendor-links.ts` — pure URL helpers: `getVendorSocialHrefs` (normalizes the 6
  social/website fields into `https://…` hrefs or `null`), `formatSocialHref`, `getDisplayUrl`
  (strips scheme/`www`/trailing slash for tooltips).
- `_components/vendor-gradient.ts` — deterministic fallback gradient from the vendor name's first
  char, used when there's no hero/logo image.
- `_components/vendor-hero.tsx`, `vendor-header.tsx`, `vendor-items.tsx` — detail-page pieces
  (banner card, title + actions menu, linked-library-items list).

## `vendor-constants.ts` is consumed outside this folder

Company Settings reuses the international-address helpers from `vendor-constants.ts`:
`../../company/_components/company-info-section.tsx` and `company-constants.ts` import
`COUNTRIES`, `countryName`, `regionLabelFor`, and `formatVendorAddress`. **Changing those
signatures ripples into `company/`** — update that feature (and its AGENTS.md) in the same change,
don't treat these helpers as vendor-private.

## Where the data comes from

All persistence is in `src/lib/db.ts` (Firestore client SDK, top-level `vendors` collection keyed
by `vendorId`):

- `getVendors(organizationId)` — directory query, filtered by `organizationId`, sorted by
  `createdAt` desc.
- `getVendor(vendorId)` — single doc; **does not filter by org** (see tenant isolation below).
- `addVendor` / `updateVendor` / `deleteVendor`.
- `getVendorLibraryItems(orgId, vendorId)` — the linked catalog items shown on the detail page and
  used to **block deletion** when non-empty.
- `uploadVendorImage(organizationId, file, type, vendorId?)` (browser File) /
  `uploadVendorImageBlob(organizationId, blob, type, vendorId, ext?)` (server-mirrored blob) —
  Firebase Storage uploads returning `{ url, path }`. Both take `organizationId` first and write to
  the org-partitioned path `vendors/{organizationId}/{vendorId}/{type}.{ext}` (Tier 2 Storage rules;
  see `storage.rules`). Legacy flat `vendors/{vendorId}/...` files still display/delete until migrated.

## Adding library items from the detail page (reuses the Library form)

The detail page can create a library item pre-linked to the vendor. It **reuses the Library
feature's form directly** — no fork: it hosts `useLibraryItemForm()` and `LibraryItemFormDialog`
from `../../library/_components/`, exactly as `library/page.tsx` does (the dialog is stateless and
the host owns submission). Specifics:

- The "Add Items" button lives in `VendorItems` (`onAddItem` prop). Opening calls
  `itemForm.reset({ vendorId: vendor.vendorId })` to seed the vendor.
- `LibraryItemFormDialog` is passed `lockVendor` so the vendor combobox + "Quick Add" become a
  read-only field — the item can't be reassigned away from this vendor. Pass `vendors={[vendor]}`
  and a no-op `onQuickAddVendor`.
- Submit mirrors `library/page.tsx`'s handler: `mirrorExternalImagesToFirebase` → `addLibraryItem`
  (with `vendor.organizationId`) → prepend to local `items` (which also keeps the delete-guard count
  current). Give the dialog a distinct `uploaderId` so its hidden file input can't collide.
- **Editing an item is NOT done here** — `VendorItems` links each row out to
  `/dashboard/library/{itemId}`. Keep it that way; don't add an edit path on this page.

## Tenant isolation — read this before touching the detail route

`getVendor(vendorId)` returns **any** org's vendor — there is no server-side org filter (vendor docs
are addressed by a guessable id). The detail page is responsible for the check:
[[vendorId]/page.tsx]([vendorId]/page.tsx) compares `vendorData.organizationId !== organizationId`
and redirects to the directory if it doesn't match. **Keep that guard.** If you add another caller
of `getVendor`, re-apply the same org check yourself.

## Images: external URLs are mirrored into our Storage

AI enrichment and manual entry can produce **external** image URLs (vendor's own CDN). On every
save, both routes call `mirrorVendorImagesToFirebase(organizationId, input, vendorId)`
(`src/lib/vendor-image-mirror.ts`) before writing the doc: any non-Firebase-hosted
`logoUrl`/`heroImageUrl` is downloaded and re-uploaded to our Storage (org-partitioned path), and the
doc stores the mirrored URL + `…Path`. Pass the org id first. Don't persist a raw external image
URL — go through the mirror so links don't rot and `DashboardImage` can serve them.

- On **edit**, the detail page also calls `deleteReplacedStorageFiles(prevPaths, nextPaths)` to GC
  the old logo/hero blobs, and **aborts the update if that cleanup throws** (object-not-found is
  ignored internally). Keep that ordering: clean up, then `updateVendor`.
- Uploads are capped at 5MB client-side in the form dialog.

## AI enrichment ("Enrich with [assistant]")

The website field's button calls `autofillVendorFromUrl(url)` (`src/server/ai-actions.ts`, a
`"use server"` action; Gemini + Jina scrape, keys server-only). It returns scalar fields (name,
category, the international address fields incl. `country` as an ISO alpha-2 code and a
`formattedAddress` fallback, rep, socials) plus an `imageCandidates` array (hero/cover candidates
only). The prompt is explicitly told **not to assume the US** and to always return a
`formattedAddress` even when it can't split the address into discrete fields. **The model can't
see images, so it never blind-picks the cover:** whenever more than one hero candidate exists the
action returns `heroImageUrl: ""` + `showImagePicker: true`, and `ImagePickerDialog` (cover image
only) auto-opens on top of the form as soon as enrichment finishes — the user makes the final
choice. The logo is always the model's own pick (identifiable from URL/context); there is no logo
picker. A "Choose Cover Image" button under the hero field reopens the picker after skipping.
Enrichment only fills form state — nothing is saved until the user submits.

- **Blocked-site fallback (url_context).** Jina's "Access Denied" scrape output is detected and
  treated as no content; when neither Jina markdown nor the direct HTML fetch got through (WAF'd
  sites like fergusonhome.com), the action falls back to one Gemini call with the `urlContext`
  tool (`SCRAPER_CONFIG.urlContextModel` — must stay Gemini 3.x, and the REST field must be
  camelCase `urlContext`; see the library AGENTS.md for the discovery history). The call also
  attaches the `googleSearch` tool: homepage digests rarely carry contact info, so search
  backfills HQ address/phone/socials from Google's index (prompt-guarded to this exact company,
  empty-when-uncertain — search-sourced socials are the least verifiable fields, so eyeball them
  in the form). Other text fields fill from the page digest; images can't (the digest strips
  markup), so `logoUrl` falls back to
  Google's favicon cache (`t3.gstatic.com/faviconV2`, confidence 0.4 — user-replaceable, and the
  mirror step self-hosts it on save) and `heroImageUrl` stays empty with no picker.

## Conventions easy to break

- **Form changes are three-touch.** A new vendor field means updating `vendorSchema`,
  `EMPTY_VENDOR_FORM`, **and** `vendorToForm` in `vendor-constants.ts`, plus rendering a `Controller`
  in `vendor-form-dialog.tsx`. Miss one and RHF/Zod will silently drop or mistype the field.
- **Phone/postal go through shared helpers.** Phones are international too: a separate
  `repPhoneCountry` (ISO alpha-2) drives formatting/validation, defaulting to the address `country`
  but independently overridable (in add mode it follows the address country until the user picks a
  phone country). The selector is always shown next to the phone field. Format with
  `formatVendorPhone(value, repPhoneCountry)` on change/display, build
  `tel:` links with `vendorPhoneTel`, validate via `isValidVendorPhone` (US/CA require a full
  10-digit number; a leading `+` or any other country is free-form: +, digits, spaces, `()`, `.`,
  `-`). The address is international:
  `country` (ISO alpha-2) is the only required address field. The `postalCode` field formats with
  `formatUsZip` and validates via `isValidUsZip` (accepts 5-digit **and** ZIP+4) **only when
  `country === "US"`** (enforced in a schema `.superRefine`); other countries accept free-form
  postal text. Never write a local formatter (root AGENTS.md rule).
- **`formattedAddress` is always written.** A schema-level `.transform` keeps any AI/manual
  `formattedAddress`, else composes one from the parts via `formatVendorAddress` (which omits the
  country name for US). The detail page prefers the stored `formattedAddress` for display.
- **Legacy address back-compat.** Older docs only have `street`/`state`/`zip` (now `@deprecated`
  on the `Vendor` type). `vendorToForm` and the detail page read the new fields with a fallback to
  those; new saves write the new fields only (legacy keys are left untouched in old docs, not
  migrated).
- **Social/website URLs are stored verbatim (only whitespace-trimmed) and rendered via
  `vendor-links.ts`.** We deliberately do **not** strip trailing slashes — a trailing `/` can be
  significant (e.g. a locale path like `/en/` that 404s without it, which the AI-enrich scrape
  fetches directly). Always derive hrefs with `getVendorSocialHrefs` rather than using the raw
  stored value — empty fields must resolve to `null` so the icon renders disabled; `getDisplayUrl`
  still strips scheme/`www`/trailing slash for display only.
- **Deletion is gated by linked items.** If `getVendorLibraryItems` is non-empty the delete dialog
  refuses and lists the items; only an empty result allows `deleteVendor`. Don't bypass this.
- **`organizationId` is the effect dependency, not `profile`.** Both routes depend on the stable
  `organizationId` string from `useAuth` (the `profile` object identity churns each heartbeat). See
  the project memory note on effect deps — keep it that way.
- **Deep-link triggers.** The directory honors `?search=` and `?add=true` query params on mount and
  immediately clears `?add=true` via `window.history.replaceState` (root AGENTS.md rule #3). Preserve
  the cleanup so reloads don't re-open the dialog.
- **`vendorId` is generated client-side** (`vendor-<random>`) and reused as the Storage upload
  prefix so images land under the right vendor even before the doc is created.
