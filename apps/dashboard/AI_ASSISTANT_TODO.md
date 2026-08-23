# AI Assistant (CRM Discussion Agent) — Plan

## AI Assistant Goal

AI Assistant turns messy, time-consuming information into accurate, reviewable CRM work so design studios spend less time on administration and more time serving clients.

Status as of 2026-08-14: **not started — architecture decided, nothing built.**
Existing AI usage (the library/vendor autofill scrapers in
[`src/server/ai-actions.ts`](src/server/ai-actions.ts)) is unrelated to this; it stays
as-is.

## Decision: agent loop, not MCP

MCP is a protocol for letting _external_ AI clients (Claude Desktop, claude.ai) reach
our data. For a chat panel inside our own UI we control both ends, so MCP would only
add latency and an extra auth story. What we need is a **server-side agent loop with
tool calling**: send message + tool definitions → model requests a tool → execute it →
feed the result back → repeat until the model answers in text.

Keep the door open: write the tool layer as plain org-scoped functions in
`src/server/`. The in-app loop calls them directly; an MCP route (with OAuth tied to
Firebase auth) can wrap the same functions later if we ever want Claude Desktop / etc.
to reach the CRM. The two are not mutually exclusive.

## Architecture

- **Chat panel** — client component (drawer/sheet) on client, project, and contract
  pages, seeded with the entity being viewed ("discussing: Project ABC-123").
- **Streaming route handler** (`src/app/api/...`), _not_ a server action — server
  actions don't stream. The route runs the agent loop and streams text to the panel.
- **Tools are plain functions** wrapping firebase-admin queries, following the same
  rules the existing server actions follow: org derived from
  `getVerifiedCaller()`/`getActiveOrgId()` (never by reading `ACTIVE_ORG_COOKIE`
  directly, and never from client input — the cookie is only an org *selector*
  honored for SuperAdmins). First tool set (all read-only):
  - `get_client(clientId)` / `get_project(projectId)` / `get_contract(contractId)`
  - `search_clients(query)` / `list_projects_for_client(clientId)`
  - `list_activities(source)` — the flat `activities` collection makes this cheap
  - SEO/analytics readers over data we already gather (GSC positions, GA4, Instagram
    snapshots)
- **Read-only first.** Write tools ("update the project status") are a later phase
  with explicit confirmation UX — a hallucinated write into the CRM is much worse
  than a hallucinated answer.

## Tool tiers (decided 2026-08-22)

Three tiers, and the middle one is what makes "Shira, add Ferguson Home to my
vendors" shippable without write tools:

1. **CRM readers** — the org-scoped firebase-admin queries above. Trusted data.
2. **Web fetchers** — `fetch_vendor_page(vendorId, path?)` and
   `research_vendor(name)`. These ingest UNTRUSTED content, so they carry the
   containment rules:
   - **Domain-pinned**: fetches resolve only within the registrable domain of the
     vendor's stored `website` (or, for `research_vendor`, the official domain the
     SERP step identified). A prompt-injected agent has no URL it can exfiltrate to.
   - Fetches go through the existing Jina/Firecrawl door, so vendor COGS meter at
     the same single place; cap pages per turn (3–5).
   - Answers from fetched content must cite the URL read; the model is instructed
     to answer only from fetched pages, refuse otherwise — grounded-only is also
     what makes the assistant useless as free general-purpose AI on the org's dime
     (the abuse case is bounded by the per-org cap + per-uid attribution anyway).
   - Before fetching, consult the Web Risk verdict cache (below); flagged domains
     are declined, not fetched.
3. **Draft proposers** — `propose_vendor(name)` / `propose_library_item(url)`.
   These NEVER write. They run the existing autofill chains
   (`autofillVendorFromUrl`, `autofillProductFromUrl`, SERP official-site lookup)
   and return a draft payload; the chat panel hands it to the EXISTING prefilled
   form dialog (the parameter-driven deep-link pattern from the sidebar
   quick-create), and the human clicks Save through the same UI code path as
   manual entry. The autofill feature is already shaped
   propose → human review → save; the agent is just a second front door to it.
   True write tools (mutating existing records) stay a later phase.

   **Name → entity resolution (no URL, typed or voice input, misspellings
   expected).** Don't correct spelling — search the raw input: SERPs are the best
   speller for commercial names ("furgeson home" resolves itself). Order of
   operations: (1) fuzzy-match existing CRM vendors first (free, prevents
   duplicates — "you already have Ferguson Home"); (2) SERP the name for the
   official domain; (3) confirm via UI — one high-confidence hit goes straight to
   the prefilled form (which IS the confirmation surface), multiple plausible
   domains render a 2–3 candidate picker (name + domain + favicon; reuse the
   variant chip-picker pattern). Never silently pick: the real failure is
   wrong-entity resolution (ferguson.com wholesale vs fergusonhome.com retail —
   see DOMAIN_SCRAPE_HINTS), not typos. Items without a URL compose the same way:
   resolve vendor → site-restricted SERP within the pinned domain
   (`site:vendor.com <product name>`) → found URL feeds the existing
   `autofillProductFromUrl` chain; a garbled product name can only land on the
   wrong page of the RIGHT vendor.

   **Search mechanism**: Gemini's **Grounding with Google Search** tool —
   5,000 free requests/month SHARED across all Gemini 3.x models, then $14/1k
   (confirmed 2026-08-22). **Billing is per search QUERY the model issues, not
   per request** — one grounded call can fan out into several queries, each
   billed and each draining the shared pool (so 5k queries ≈ maybe 1.5–2.5k
   requests in practice). Resolution becomes one grounded model call instead of
   model + SERP vendor. Unwrap the `groundingMetadata` redirect URLs to get the
   real registrable domain before pinning. Meter by counting
   `groundingMetadata.webSearchQueries` per response (the actual billed unit),
   as a distinct `groundedSearches` usage counter from day one: the pool is
   shared, so ANY other feature that adopts grounding draws it down, and the
   counter is how we notice. Keep the resolution prompt narrow — instruct one
   focused search, not open research — to hold fan-out near 1. Past the free
   pool the economics flip — $14/1k ≈ 1.4¢/QUERY vs DataForSEO SERP at a
   fraction of that — so the DataForSEO fallback (behind the same function
   signature) is not just a safety net but the cheaper route once the month's
   pool is spent; route on remaining free quota.

   **Compound requests are one agent, not many** ("add the Mayu pendant from
   Fine Art" when Fine Art isn't in the CRM): the loop chains
   search_vendors (miss) → research_vendor → propose_vendor → site-restricted
   product search → propose_library_item — ~5 tool calls, inside the iteration
   cap. Since draft tools never write, the agent finishes ALL research first and
   presents ONE review surface: the prefilled item form with a "new vendor will
   be created" card (the QuickVendorDialog composition, agent-fronted). A single
   Save commits vendor then item in order, exactly as the manual quick-create
   path already does.

## Web Risk daily sweep (build alongside tier 2)

- Daily Vercel cron: collect distinct registrable domains from `vendors.website` +
  `library.sourcingLink`, check via the **Web Risk** GCP API (the paid enterprise
  one — the free consumer Safe Browsing API prohibits commercial use), store
  verdicts + timestamp in one small global doc (domains repeat across tenants).
- On a hit: **email the platform operator via the existing Brevo transport** —
  a human decides what to do; nothing automated beyond the agent declining to
  fetch flagged domains. At current URL volume the sweep sits in the free tier.
- Not worth building before the agent exists: the verdict needs a consumer.
- **Model**: the current Gemini raw-fetch path supports function calling through the
  same `generateContent` API, so we can stay on it and keep `recordAiUsage` flowing.
  Claude API tool-use is the alternative if multi-step tool reasoning proves weak —
  provider swap, same architecture.
- Reuse `AI_ASSISTANT_NAME` from `src/lib/ai-assistant` for the persona/UI.

## Prompt structure for Gemini implicit caching

Gemini discounts cached input automatically, but a hit requires the request's
**leading tokens to be byte-identical** to a recent request on the same model, and the
matching prefix must clear a floor (**4,096 tokens for Gemini 3.x Flash models**,
2,048 for 2.5). Design rules so the discount lands on most agent tokens:

- **Static first**: fat system prompt (persona, CRM schema description, behavior
  rules) + tool definitions at position zero, identical on every request. A real
  agent easily clears 4k tokens → permanent cache hit.
- **Entity context fetched once** at chat open and left verbatim in context — it then
  caches for every later turn. Re-fetching it fresh each turn breaks the prefix at
  that point and everything after bills full price.
- **Volatile data via tool results**, which naturally append at the end and leave the
  prefix intact.
- Conversation history + tool round-trips resend the whole context, so the cached
  share _grows_ as a conversation runs — this is where the discount compounds.
- Caveat: cache hits are per-model, so the 429/503 fallback model starts cold.
- The existing scraper prompts do **not** qualify (unique URL + page content sits
  ahead of the static instructions, and the static block is under the 4k floor
  anyway). Not worth restructuring; the scraper isn't a caching workload.

## Tasks

- [ ] **Tool layer** (`src/server/assistant-tools.ts` or similar): org-scoped
      read-only functions above, each returning compact JSON (trim Firestore docs to
      the fields the model needs — token cost is real).
- [ ] **Agent loop route**: streaming route handler running the
      Gemini function-calling loop; cap tool iterations (e.g. 8) and total tokens per
      turn; wire `recordAiUsage` on every model call.
- [ ] **System prompt**: persona (`AI_ASSISTANT_NAME`), CRM schema overview, tool
      usage rules — static, ordered for the caching rules above.
- [ ] **Chat panel UI**: drawer on client/project/contract pages, seeded with the
      current entity; existing design-system components only.
- [ ] **Auth on the route**: verify the Firebase session and org membership before
      running the loop (route handlers don't get server-action auth for free).
- [ ] **Usage/limits**: quota check at turn start (consumed on attempt, like
      autofills), a distinct `assistantTurns` unit on the org's monthly usage map
      (keep vendor units split, per the cap rules in AGENTS.md), surfaced on the
      existing usage page.
- [ ] **Attribution**: stamp each turn with the caller's uid; anything saved from
      a draft carries the normal ActivityActor of the user who clicked Save
      (the human committed it, the assistant only proposed).
- [ ] **Tier 2 web fetchers** (`fetch_vendor_page`, `research_vendor`):
      domain-pinned, metered through the existing scrape door, page-capped,
      Web Risk verdict check before fetch.
- [ ] **Tier 3 draft proposers** (`propose_vendor`, `propose_library_item`):
      wrap the existing autofill chains, return drafts to the prefilled form
      dialogs — no writes.
- [ ] **Web Risk sweep cron** + Brevo email on hit + verdict cache doc.
- [ ] Later phase: **write tools** (mutations to existing records) with
      confirmation UX; **MCP wrapper** over the same tool layer if external
      access is ever wanted.
