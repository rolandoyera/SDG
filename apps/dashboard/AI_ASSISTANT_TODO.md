# AI Assistant (CRM Discussion Agent) — Plan

Goal: an in-app chat assistant that lets a user discuss what's already in the CRM —
clients, projects, contracts, activities, library items, and gathered SEO/analytics
data (GSC positions, GA4, Instagram) — from a panel inside the dashboard.

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
  rules the existing server actions follow: org derived from `ACTIVE_ORG_COOKIE`,
  never from client input. First tool set (all read-only):
  - `get_client(clientId)` / `get_project(projectId)` / `get_contract(contractId)`
  - `search_clients(query)` / `list_projects_for_client(clientId)`
  - `list_activities(source)` — the flat `activities` collection makes this cheap
  - SEO/analytics readers over data we already gather (GSC positions, GA4, Instagram
    snapshots)
- **Read-only first.** Write tools ("update the project status") are a later phase
  with explicit confirmation UX — a hallucinated write into the CRM is much worse
  than a hallucinated answer.
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
- [ ] **Usage/limits**: per-org daily cap surfaced on the existing usage page.
- [ ] Later phase: **write tools** with confirmation UX; **MCP wrapper** over the
      same tool layer if external access is ever wanted.
