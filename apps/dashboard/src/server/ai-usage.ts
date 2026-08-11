// Gemini token accounting. Every AI call increments one daily doc at
// aiUsage/{YYYY-MM-DD} (America/New_York days, like positionSnapshots) —
// token history can't be recomputed, so this is a deliberate Firestore write.
// Admin-SDK-only; no rules changes.

import { FieldValue } from "firebase-admin/firestore";

import { getAdminDb } from "./firebase-admin";
import { easternDateKey } from "./position-tracking";

/**
 * Flat cost-estimate rates, USD per million tokens. Everything is priced at the
 * primary model's (gemini-3.1-flash-lite) rates — the fallback is too rare to
 * track separately. Update alongside SCRAPER_CONFIG model changes.
 */
export const AI_TOKEN_PRICING = {
  inputPerMillion: 0.25,
  outputPerMillion: 1.5,
};

/** The `usageMetadata` object on every generateContent response. */
interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

/**
 * Fire-and-forget (`void recordAiUsage(...)`) after each successful Gemini
 * call. Never throws — losing a data point must not fail the user's autofill.
 */
export async function recordAiUsage(
  usage: GeminiUsageMetadata | undefined,
): Promise<void> {
  try {
    if (!usage) return;
    const input = usage.promptTokenCount ?? 0;
    // Thinking tokens bill as output but aren't in candidatesTokenCount, so
    // derive output from the total when present.
    const output = Math.max(
      usage.candidatesTokenCount ?? 0,
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
        },
        { merge: true },
      );
  } catch (error) {
    console.error("[AI Usage] Failed to record token usage:", error);
  }
}
