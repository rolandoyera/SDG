"use server";

// Read side of aiUsage/{YYYY-MM-DD} for the Usage page's AI metrics card.
// Docs are daily totals, so every range is served as whole ET calendar days:
// sub-day ranges (60m/24h) and the quota period show today's running total.

import { AI_TOKEN_PRICING } from "./ai-usage";
import { getAdminDb } from "./firebase-admin";
import { easternDateKey } from "./position-tracking";

export type AiUsageRange = "60m" | "24h" | "7d" | "30d" | "quota" | "billing";

export interface AiUsage {
  range: AiUsageRange;
  /** Number of ET calendar days the totals cover. */
  days: number;
  inputTokens: number;
  outputTokens: number;
  requests: number;
  /** Flat-rate estimate (see AI_TOKEN_PRICING). */
  estimatedCostUsd: number;
}

const DAY_MS = 86_400_000;

/** Today plus the previous `count - 1` ET days, deduped across DST folds. */
function dayKeysBack(count: number): string[] {
  const now = Date.now();
  const keys = new Set<string>();
  for (let i = 0; i < count; i++) {
    keys.add(easternDateKey(new Date(now - i * DAY_MS)));
  }
  return [...keys];
}

function daysFor(range: AiUsageRange): number {
  if (range === "7d") return 7;
  if (range === "30d") return 30;
  // ET month-to-date: today's day-of-month is the day count.
  if (range === "billing") return Number(easternDateKey().slice(8));
  return 1;
}

export async function getAiUsage(range: AiUsageRange): Promise<AiUsage> {
  const db = getAdminDb();
  const keys = dayKeysBack(daysFor(range));
  const refs = keys.map((key) => db.collection("aiUsage").doc(key));
  const snaps = await db.getAll(...refs);

  let inputTokens = 0;
  let outputTokens = 0;
  let requests = 0;
  for (const snap of snaps) {
    const data = snap.data();
    if (!data) continue;
    inputTokens += Number(data.inputTokens ?? 0);
    outputTokens += Number(data.outputTokens ?? 0);
    requests += Number(data.requests ?? 0);
  }

  const estimatedCostUsd =
    (inputTokens / 1_000_000) * AI_TOKEN_PRICING.inputPerMillion +
    (outputTokens / 1_000_000) * AI_TOKEN_PRICING.outputPerMillion;

  return {
    range,
    days: keys.length,
    inputTokens,
    outputTokens,
    requests,
    estimatedCostUsd,
  };
}
