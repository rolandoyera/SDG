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

The website field's button is the shared `AiButton` (`@/components/ui/ai-button` — owns the
indigo styling, LunaMoon icon, and shimmer/"Analyzing…" loading state; pass `loading` separately
from `disabled`). It calls `autofillVendorFromUrl(url)` (`src/server/ai-actions.ts`, a
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

- **Hero candidates come from the raw HTML, not the markdown.** `extractVendorImageCandidates`
  takes `(rawHtml, markdown, baseUrl)` and runs the shared `extractProductImagesFromHtml` first
  (og:image → JSON-LD → largest `srcset` variant), then appends markdown-scraped URLs as a
  fallback. This ordering is the whole point: Jina's markdown flattens `<img srcset>` down to
  `src`, which on responsive themes (Shopify et al.) is a pre-shrunk thumbnail — markdown alone can
  only ever yield small images. Every candidate is then run through `cleanImageUrlSize`, which
  strips `_1920x`/`_180x`-style suffixes to reach the CDN master. Don't "simplify" this back to a
  markdown-only extractor.
- **Candidates are measured, not guessed — `src/server/image-probe.ts`.** URL-shape heuristics only
  work for CDNs that put the size in the filename; Magento hides the rendition in a _hash
  directory_ (`/media/image_resizer/cache/<hash>/…`), which no suffix regex can see, so every
  Arteriors candidate used to arrive thumbnail-sized. `measureImageCandidates` rewrites each URL to
  its likely original (`originalVariants` — Magento cache segments, Shopify/WP suffixes), reads the
  real pixel dimensions off the wire with a ranged GET (~64KB, ~300ms, all in parallel), then keeps
  whichever variant actually won. Measuring is what makes rewriting safe: a guess that 404s or
  comes back smaller is discarded instead of becoming a broken hero. Verified on arteriorshome.com:
  390×390 → 2000×2000, 1920×887 → 3840×1774.
  - Extraction over-collects to `RAW_HERO_CANDIDATE_LIMIT` (10) because measurement then drops and
    merges; the survivors are trimmed to `HERO_CANDIDATE_LIMIT` (6) for the picker.
  - **Candidates are zoned by real DOM ancestry, parsed with cheerio** (already a runtime dep) —
    `ImageZone` / `ZONE_ORDER`: `declared` (og:image, JSON-LD) → `main` → `footer` → `nav`.
    **Do not go back to inferring zone from the filename.** That was tried and is provably
    impossible: arhaus.com names its megamenu thumbnails `metafield-<uuid>.jpg`, so a
    `/nav|menu|header|footer/` pattern can't see them — and by demoting only the honestly-named
    `MegaMenu`/`BathNav` files it made things _worse_, leaving the picker showing six anonymous nav
    tiles. The DOM is unambiguous: 56 of arhaus's 69 `<picture>` elements sit inside nav/header and
    only 12 in `<main>`.
  - The zone tier is applied twice, both load-bearing: `extractVendorImageCandidates` orders by zone
    _before_ the raw cap (megamenu markup sits early in the document, so a document-order cap spends
    every slot on nav), and `measureImageCandidates`'s `demote` predicate keeps chrome last _after_
    measurement (nav tiles are often the largest images on the page). `demote` is evaluated against
    the URL the caller passed IN — the winning variant is usually a rewritten URL the caller has
    never seen, so testing that one would silently never match.
  - **Nav imagery is EXCLUDED from the picker**, not just ranked low — megamenu tiles and category
    thumbnails are never a vendor's cover. It stays in the raw list purely as a safety net: if
    nothing outside the nav survives measurement, the action falls back to the nav results rather
    than showing an empty picker, and logs `FELL BACK to nav`. `measureImageCandidates` surfaces the
    `demoted` flag on each candidate so the caller can filter — it can't be recomputed downstream,
    since the winning URL is usually a rewritten one the caller never passed in.
  - **Do NOT strip nav from the TEXT payload with Jina's `x-remove-selector`.** Tried and measured:
    removing `nav, header, …` cuts arhaus.com's markdown from 59K to 2.5K chars and loses the ZIP,
    phone AND social links — the contact data lives in the footer, but Jina's readability picks a
    different content root once nav is gone and the footer never makes the output. Narrowing to
    `nav` alone doesn't help (still 96% gone). artistictile.com also lost its phone under the wider
    selector. Nav is worthless for images, but it cannot be removed from the text this way.
  - **`<source>` is read before `<img>`, and `data-srcset`/`data-src` count.** Inside a `<picture>`
    the sources carry the full-resolution art direction while the `<img>` is the small fallback, and
    4 of artistictile.com's 5 `<picture>` heroes declare their real asset via `data-srcset` (lazy
    loading). This is what makes that homepage carousel reachable at all.
  - **Store candidate URLs AS FOUND — never pre-strip the size suffix at collection.** It's lossy and
    unrecoverable: arhaus's og:image is `SocialSharing-1200x628.png`, whose "cleaned" form
    `SocialSharing.png` doesn't exist, so the candidate 404'd and vanished instead of measuring at
    1200×628. `originalVariants` already probes the stripped form alongside the original and keeps
    whichever wins — the same optimisation, done safely.
  - Verified end to end: artistictile.com went from five 600px thumbnails to **5000×2617 plus the
    five 3250×1448 carousel heroes**; arhaus surfaces its homepage carousel (1100×1100) and og:image
    (1200×628) ahead of the megamenu tiles.
  - **Three different CDN conventions, all handled by `originalVariants`:** filename suffix
    (Shopify `_1920x`, WP `-1024x768`), hash directory (Magento), and **query param** (newer Shopify
    `?v=…&width=600`, imgix `?w=&h=`). The query-param case is easy to miss because the URL looks
    clean — arhaus.com serves everything as `?width=600`, which no filename or path regex can see.
    `SIZE_PARAMS` are stripped; the `v` version param must be kept or the CDN 404s.
  - **Some storefronts throttle the direct HTML fetch (HTTP 430) regardless of User-Agent.**
    Measured on arhaus.com with alternating browser/bot UAs and cooldowns: success tracks request
    rate, not the UA — so don't "fix" this by spoofing a browser string, it was tried and the
    evidence didn't support it. The failure is silent and degrading, not loud: `rawHtml` comes back
    empty, `extractOgMeta` finds nothing (the `Logo Sources: none found` tell in the prompt log),
    and every hero candidate falls back to a Jina-markdown thumbnail.
  - **`fetchJinaHtml` is the recovery for that.** When the direct fetch returns nothing, the action
    re-asks Jina for HTML (`x-respond-with: html`) instead of markdown — Jina fetches from its own
    infrastructure, so it gets through where we don't. Measured on arhaus.com: Jina _markdown_ is
    59KB with 0 srcsets and no og:image; Jina _HTML_ is 794KB with 276 srcsets, 2 JSON-LD blocks and
    an og:image, and the resulting candidates lead with 1410×784 and 1200×628 instead of five
    identical 600px thumbnails. It only fires when the direct fetch failed (it costs a second Jina
    call), and a failure there is non-fatal — the flow continues with an empty `rawHtml`.
  - **Dedup is by measured `(width, height, bytes)`,** not filename — the same photo reached via two
    rendition paths collapses to one entry. Candidates that don't parse as an image are dropped,
    which also kills the empty `<img src="https://site.com/">` placeholders scraped pages are full
    of (they resolve to an HTML page).
  - `imageCandidates` is `ImageCandidate[]` (`{ url, width, height, bytes? }`), **not** `string[]`,
    ranked largest-first. `ImagePickerDialog` renders the real dimensions on each thumbnail and
    badges anything under `MIN_HERO_WIDTH` (1000px) as "Low res" — the point is knowing before
    applying, since a soft hero used to only become obvious after it rendered.
  - Pure logic is covered by `src/server/image-probe.test.ts` (URL rewriting + the JPEG/PNG/GIF/WebP
    header parsers). Run it when touching either.
- **The model returns `heroImageId` — an enum-constrained LETTER, never a URL or a number.** Two
  failures got us here, and both are easy to reintroduce:
  1. Given a free-text field, the model copied whatever image URL sat nearest in the markdown prose
     — invariably a thumbnail — instead of using the candidate list.
  2. Given a _numbered_ list, it answered `64` for a six-item list. Jina labels every image in the
     scraped page as `![Image 64: …]`, so numeric ids compete with dozens of "Image N" strings
     already in the content. **Never label the candidates numerically.**

  So the ids are letters (`HERO_ID_LABELS` = A–F, plus `"NONE"`), and they're declared as a schema
  `enum` so an invalid answer is impossible at decode time rather than something we detect and
  silently discard afterwards. `vendorResponseSchema(heroIds)` is therefore built **per request** —
  the enum lists exactly the candidates that exist; the url_context fallback passes `[]` so `"NONE"`
  is the only legal answer. Declare the enum as `{ type: "STRING", enum: [...] }` only: `format:
"enum"` is for top-level `text/x.enum` responses and risks a 400 as a property.
  The **confidence** sub-object still keys on `heroImageUrl` — that name is the client-facing form
  field. Keep `logoUrl` as-is; it's still a model-emitted string.

- **Blocked-site escalation (Firecrawl).** When Jina comes back with a bot wall, the action retries
  through `fetchViaFirecrawl` (`FIRECRAWL_API_KEY`) before falling back to url_context — a real
  browser clears challenges that defeat every plain fetcher. fergusonhome.com sits behind Akamai Bot
  Manager and answers our direct fetch, Jina markdown and Jina HTML alike with a 403 challenge; a
  Jina API key made no difference, because the block is on the fetcher, not our quota. Firecrawl
  returns 17KB of real markdown and 840KB of HTML, and Ferguson now yields name, category, phone and
  5 measured hero candidates where it previously produced none.
  - **Request `rawHtml`, never `html`.** Firecrawl's `html` format is cleaned and drops `<head>`,
    taking og:image and JSON-LD with it (measured on both ferguson and arhaus).
  - **On success, Firecrawl's rawHtml REPLACES whatever we already had** — it doesn't just fill an
    empty slot. Ferguson's direct fetch returns HTTP 200 with a 2.5KB Akamai sensor stub, which
    passes a non-empty check and would otherwise shadow the real 840KB page.
  - **`looksBlocked` gates the escalation on a LENGTH FLOOR, not just phrases.** Matching one exact
    string wasn't enough: Ferguson's block page alternates between Jina's `Warning: Target URL
returned error` wrapper and a bare `Access Denied` body, so a phrase-only check fired on one run
    and silently skipped the next. Real vendor homepages measured 30K-75K markdown chars; every
    block page came back under 400. `MIN_USABLE_MARKDOWN` is 600.
  - It's slow (~15s cold) and metered, so it stays the tier _after_ Jina, never the default fetcher.
  - **`looksBlockedHtml` discards challenge HTML before the url_context guard.** A bot challenge is
    served as HTTP 200 with a real body, so a non-empty `rawHtml` is not proof we got the page —
    ferguson's is 2.5KB of Akamai sensor script against 840KB for the real thing. Left in place it
    poisoned image extraction _and_ made the `!markdownText && !rawHtml` guard below unreachable for
    exactly the sites that guard exists for. `MIN_USABLE_HTML` is 5000; genuine vendor pages
    measured 400KB-3.5MB.

- **Name-only resolution (`resolveVendorWebsite`).** The form's enrich button also works with just
  a vendor NAME (typed or dictated, misspellings expected): it resolves the official website, sets
  the field, and flows into the normal enrich scrape. Two steps because **JSON response mode
  suppresses Google Search grounding** (verified on both 3.1/3.5-flash-lite): (1) a knowledge-only
  JSON call — zero search cost, resolves known brands, returns empty rather than guessing; (2) only
  on empty, a schema-less grounded call whose reply is instructed JSON via `parseGeminiJson`, with
  search queries counted from `groundingMetadata.webSearchQueries` into the org's
  `groundedSearches` counter (billed PER QUERY; 5k/month free shared across 3.x, then $14/1k).
  Candidates are liveness-probed (any HTTP status = alive; only network-dead hosts drop) to catch
  hallucinated domains. Multiple candidates (retail arm vs wholesale parent) render a picker —
  never silently chosen; a fuzzy name match against the org's existing vendors warns about
  duplicates without blocking.

- **Footer contacts/socials are harvested from the raw HTML, not trusted to the markdown.**
  Lazy-loading storefronts never render their footer into Jina's snapshot — measured on
  perigold.com (Wayfair platform): the markdown is 6.8k chars ending mid-page, no footer at all,
  while the direct HTML fetch carries the full 660KB page. And the links there live in
  double-escaped embedded JSON (`\\\"url\\\":\\\"https://instagram.com/perigold\\\"`), not href
  attributes, so `extractContactLinksFromHtml` flattens JSON escapes and scans the whole document:
  one official-profile URL per social platform (www-only hosts — wildcard subdomains matched
  developers.facebook.com; share/intent/post URLs excluded), up to two `tel:`/`mailto:` links
  (tel deduped by digits), and a JSON `"phoneNumber"` field as phone fallback. The harvest is
  handed to the model as a "Contact & Social Links" prompt block with attribute-only-if-the-handle-
  matches guidance. Verified on perigold.com, finearthl.com, ngalatrading.com.

- **Logo sources are probed before the model sees them.** Pages DECLARE logo URLs without
  serving them — Perigold's apple-touch-icon path 404s, and the model returned the dead URL as
  `logoUrl` on every attempt. Each source (Schema.org logo, touch icon/favicon, page candidates)
  now passes `probeIsImage` (raster header, SVG, or ICO — logos are often the latter two) before
  entering the prompt's Logo Sources list; when everything on-page is dead or absent, the
  extraction falls back to Google's favicon cache (`faviconLogoUrl`, confidence 0.4, itself
  probed) — the same fallback the url_context path always used.

- **The full chain is: direct fetch → Jina markdown → Jina HTML → Firecrawl → url_context → error.**
  Both branches are verified against fergusonhome.com: with Firecrawl it returns name, phone and 5
  measured hero candidates; with `FIRECRAWL_API_KEY` unset it falls through to url_context and still
  returns name, phone and the favicon logo (no images, as designed).

- **Blocked-site fallback (url_context).** Jina's "Access Denied" scrape output is detected and
  treated as no content; when neither Jina markdown nor the direct HTML fetch got through (WAF'd
  sites like fergusonhome.com), the action falls back to one Gemini call with the `urlContext`
  tool (`SCRAPER_CONFIG.urlContextModel` — must stay Gemini 3.x, and the REST field must be
  camelCase `urlContext`; see the library AGENTS.md for the discovery history). The call also
  attaches the `googleSearch` tool, intended to backfill HQ address/phone/socials from Google's
  index — **but verified 2026-08-22: `responseSchema` SUPPRESSES `googleSearch` entirely on both
  3.1- and 3.5-flash-lite** (the tool is accepted, never invoked, even for questions impossible
  without live search; `urlContext` is NOT suppressed). So the backfill has been a silent no-op —
  contact fields that fill on this path come from the page digest or model knowledge. Fixing it
  means a schema-less grounded call (see `resolveVendorWebsite`'s two-step pattern). Other text fields fill from the page digest; images can't (the digest strips
  markup), so `logoUrl` falls back to
  Google's favicon cache (`t3.gstatic.com/faviconV2`, confidence 0.4 — user-replaceable, and the
  mirror step self-hosts it on save) and `heroImageUrl` stays empty with no picker. This path calls
  `vendorResponseSchema([])`, so its prompt instructs `heroImageId: "NONE"` (there is no candidate
  list in this mode) — keep the two prompts in sync when the schema changes.

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
- **Deep-link triggers.** The directory honors `?search=` on mount, and `?add=true` via the shared
  `QuickCreateTrigger` (`../_components/quick-create-trigger.tsx`), which reacts to same-page
  navigations and immediately clears `?add=true` via `window.history.replaceState` (root AGENTS.md
  rule #3). Preserve the cleanup so reloads don't re-open the dialog.
- **`vendorId` is generated client-side** (`vendor-<random>`) and reused as the Storage upload
  prefix so images land under the right vendor even before the doc is created.
