// Gemini token accounting. Every AI call increments one daily doc at
// aiUsage/{YYYY-MM-DD} (America/New_York days, like positionSnapshots) —
// token history can't be recomputed, so this is a deliberate Firestore write.
// Admin-SDK-only; no rules changes.
//
// Each doc carries project-wide totals plus the same counters split per model
// under `byModel`. Cloud Monitoring's API metrics have no model dimension
// (`method` is just …GenerativeService.GenerateContent) and billing SKUs name
// the model but lag ~a day, so this write is the only source of realtime
// per-model usage.

import { FieldValue } from "firebase-admin/firestore";

import { recordOrgUsage } from "./ai-quota";
import { getAdminDb } from "./firebase-admin";
import { easternDateKey } from "./position-tracking";

/** The `usageMetadata` object on every generateContent response. */
interface GeminiUsageMetadata {
  promptTokenCount?: number;
  /** Content injected by tools (url_context page digests, grounding) — billed as INPUT. */
  toolUsePromptTokenCount?: number;
  /** Thinking tokens — billed as OUTPUT but not part of candidatesTokenCount. */
  thoughtsTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

/**
 * Fire-and-forget (`void recordAiUsage(...)`) after each successful Gemini
 * call. Never throws — losing a data point must not fail the user's autofill.
 *
 * `model` is the model that actually served the response — pass
 * `fetchGeminiWithFallback`'s `modelUsed`, not the configured primary, so a
 * fallback is attributed to the model that ran it.
 *
 * `organizationId` is the caller's ACTIVE org, so a SuperAdmin working inside a
 * tenant meters against that tenant rather than against themselves.
 */
export async function recordAiUsage(
  usage: GeminiUsageMetadata | undefined,
  model: string,
  organizationId: string,
): Promise<void> {
  try {
    if (!usage) return;
    // Tool-injected content (url_context digests, grounding) bills as input —
    // deriving output as `total - prompt` would misclassify it as output.
    const input =
      (usage.promptTokenCount ?? 0) + (usage.toolUsePromptTokenCount ?? 0);
    // Thinking tokens bill as output but aren't in candidatesTokenCount.
    // Prefer the explicit counts; fall back to the total-derived value for
    // responses that omit thoughtsTokenCount.
    const output = Math.max(
      (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
      (usage.totalTokenCount ?? 0) - input,
    );
    if (input === 0 && output === 0) return;

    await getAdminDb()
      .collection("aiUsage")
      .doc(easternDateKey())
      .set(
        {
          inputTokens: FieldValue.increment(input),
          outputTokens: FieldValue.increment(output),
          requests: FieldValue.increment(1),
          // A nested map, not a dotted field path: model ids contain dots
          // ("gemini-3.1-flash-lite"), which Firestore would read as path
          // separators. set({ merge: true }) merges map keys literally.
          byModel: {
            [model]: {
              inputTokens: FieldValue.increment(input),
              outputTokens: FieldValue.increment(output),
              requests: FieldValue.increment(1),
            },
          },
        },
        { merge: true },
      );

    // Same numbers, different consumer: the daily doc above drives the Usage
    // page's platform-wide charts, this drives the tenant's monthly counters.
    void recordOrgUsage(organizationId, {
      geminiRequests: 1,
      geminiTokens: input + output,
    });
  } catch (error) {
    console.error("[AI Usage] Failed to record token usage:", error);
  }
}
