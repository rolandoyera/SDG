"use server";

// Read side of aiUsage/{YYYY-MM-DD} for the Usage page's AI metrics card.
// Docs are daily totals, so every range is served as whole ET calendar days:
// sub-day ranges (60m/24h) and the quota period show today's running total.
//
// Days are returned individually rather than collapsed — the same single
// getAll feeds both the range totals and the per-day chart series, so adding
// charts costs no extra reads.

import { queryRows } from "./bigquery-client";
import { getAdminDb } from "./firebase-admin";
import { listTimeSeries } from "./monitoring-client";
import { easternDateKey } from "./position-tracking";

export type AiUsageRange = "60m" | "24h" | "7d" | "30d" | "quota" | "billing";

export interface AiUsageCounters {
  inputTokens: number;
  outputTokens: number;
  requests: number;
}

export interface AiUsageDay extends AiUsageCounters {
  /** ET calendar day, YYYY-MM-DD. */
  date: string;
  /** The day's counters split by the model that served each call. */
  byModel: Record<string, AiUsageCounters>;
}

export interface AiUsage {
  range: AiUsageRange;
  /** Number of ET calendar days the totals cover. */
  days: number;
  inputTokens: number;
  outputTokens: number;
  requests: number;
  /** One entry per ET day in the range, oldest first, zero-filled. */
  daily: AiUsageDay[];
  /** Range totals split by model. Empty for days recorded before `byModel` shipped. */
  byModel: Record<string, AiUsageCounters>;
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

function zero(): AiUsageCounters {
  return { inputTokens: 0, outputTokens: 0, requests: 0 };
}

function readCounters(
  data: Record<string, unknown> | undefined,
): AiUsageCounters {
  return {
    inputTokens: Number(data?.inputTokens ?? 0),
    outputTokens: Number(data?.outputTokens ?? 0),
    requests: Number(data?.requests ?? 0),
  };
}

function addInto(target: AiUsageCounters, add: AiUsageCounters): void {
  target.inputTokens += add.inputTokens;
  target.outputTokens += add.outputTokens;
  target.requests += add.requests;
}

export async function getAiUsage(range: AiUsageRange): Promise<AiUsage> {
  const db = getAdminDb();
  const keys = dayKeysBack(daysFor(range));
  const refs = keys.map((key) => db.collection("aiUsage").doc(key));
  const snaps = await db.getAll(...refs);
  const byDate = new Map(snaps.map((snap) => [snap.id, snap.data()]));

  const totals = zero();
  const byModel: Record<string, AiUsageCounters> = {};

  // dayKeysBack counts backwards from today; reverse so the series reads
  // left-to-right on a chart.
  const daily = [...keys].reverse().map((date) => {
    const data = byDate.get(date);
    const dayTotals = readCounters(data);
    addInto(totals, dayTotals);

    const dayByModel: Record<string, AiUsageCounters> = {};
    const raw = (data?.byModel ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    for (const [model, counters] of Object.entries(raw)) {
      const parsed = readCounters(counters);
      dayByModel[model] = parsed;
      byModel[model] ??= zero();
      addInto(byModel[model], parsed);
    }

    return { date, ...dayTotals, byModel: dayByModel };
  });

  return {
    range,
    days: keys.length,
    ...totals,
    daily,
    byModel,
  };
}

// The Gemini console's "Total API Errors" card, off the same Cloud Monitoring
// metric it uses. Scoped to the server-side Gemini key on purpose: the
// project's PUBLIC Firebase browser key gets probed against
// generativelanguage by outsiders and every one of those attempts 403s, which
// unfiltered outnumbers our own failures. Re-read the id from
// `gcloud services api-keys list` if the key is ever rotated.
const GEMINI_CREDENTIAL_ID = "apikey:ef4a8356-ca07-434d-a766-0d7152062d2d";
const API_REQUEST_METRIC = "serviceruntime.googleapis.com/api/request_count";
const HOUR_MS = 3_600_000;

export interface GeminiErrors {
  range: AiUsageRange;
  /** Response codes seen in the window, ascending — these are the series keys. */
  codes: string[];
  /** One row per ET day, oldest first: `{ t, [code]: count }`. */
  daily: Record<string, number>[];
  total: number;
}

export async function getGeminiErrors(
  range: AiUsageRange,
): Promise<GeminiErrors> {
  const keys = dayKeysBack(daysFor(range));
  const dates = new Set(keys);
  // Hourly points bucketed into ET days here rather than asking Monitoring for
  // daily buckets: its alignment periods anchor to the request window, not to
  // any calendar, so the boundaries would drift off the aiUsage charts beside
  // them. The extra day of span guarantees the oldest ET day is fully covered.
  const endMs = Date.now();
  const startMs = endMs - keys.length * DAY_MS;

  const series = await listTimeSeries({
    filter: [
      `metric.type = "${API_REQUEST_METRIC}"`,
      `resource.labels.service = "generativelanguage.googleapis.com"`,
      `resource.labels.credential_id = "${GEMINI_CREDENTIAL_ID}"`,
      `metric.labels.response_code_class != "2xx"`,
    ].join(" AND "),
    startMs,
    endMs,
    alignmentSeconds: HOUR_MS / 1_000,
    perSeriesAligner: "ALIGN_SUM",
    crossSeriesReducer: "REDUCE_SUM",
    groupByFields: ["metric.labels.response_code"],
  });

  const perDay = new Map<string, Map<string, number>>();
  const codes = new Set<string>();
  let total = 0;

  for (const entry of series) {
    const code = entry.metric.labels?.response_code;
    if (!code) continue;
    for (const point of entry.points ?? []) {
      const count = Number(
        point.value.int64Value ?? point.value.doubleValue ?? 0,
      );
      if (!count) continue;
      // Aligned points are stamped with the bucket END; step back into the
      // bucket so the hour before ET midnight counts as the earlier day.
      const date = easternDateKey(
        new Date(Date.parse(point.interval.endTime) - HOUR_MS),
      );
      if (!dates.has(date)) continue;
      codes.add(code);
      total += count;
      const row = perDay.get(date) ?? new Map<string, number>();
      row.set(code, (row.get(code) ?? 0) + count);
      perDay.set(date, row);
    }
  }

  const sortedCodes = [...codes].sort();
  const daily = [...keys].reverse().map((date) => {
    const row: Record<string, number> = {
      t: Date.parse(`${date}T00:00:00`),
    };
    for (const code of sortedCodes) {
      row[code] = perDay.get(date)?.get(code) ?? 0;
    }
    return row;
  });

  return { range, codes: sortedCodes, daily, total };
}

// Billed Gemini spend from the Cloud Billing detailed export. This is the same
// number AI Studio's cost page shows and carries the same ~1 day lag — that
// page warns "cost information may take up to 24 hours to update", so reading
// billed truth here is no staler than reading it there.
const BILLING_EXPORT_TABLE =
  "sarvian-design-group-db.billing_export.gcp_billing_export_resource_v1_018BC0_2844AF_6A8046";

export interface GeminiSpend {
  range: AiUsageRange;
  /** USD over the range. */
  total: number;
  /** One row per ET day, oldest first: `{ t, cost }`. */
  daily: Record<string, number>[];
  /** Latest ET day the export has landed, or null when it holds nothing yet. */
  billedThrough: string | null;
}

// Billing rows change once a day, so a 60s memo like the Monitoring readers use
// would just re-bill the same query. Scans are ~200KB (under BigQuery's 10MB
// per-query minimum, inside the free tier), but there is no reason to repeat it
// for every viewer on every page refresh.
const SPEND_CACHE_TTL_MS = 15 * 60_000;
const spendCache = new Map<
  AiUsageRange,
  { at: number; promise: Promise<GeminiSpend> }
>();

async function fetchGeminiSpend(range: AiUsageRange): Promise<GeminiSpend> {
  const keys = dayKeysBack(daysFor(range));
  const oldest = [...keys].sort()[0];

  // Grouped in America/New_York so billed days line up with the aiUsage charts
  // beside them; usage_start_time is UTC and would shift the boundaries.
  const rows = await queryRows(`
    SELECT
      FORMAT_DATE('%Y-%m-%d', DATE(usage_start_time, 'America/New_York')) AS day,
      SUM(cost) AS cost
    FROM \`${BILLING_EXPORT_TABLE}\`
    WHERE service.description = 'Gemini API'
      AND DATE(usage_start_time, 'America/New_York') >= '${oldest}'
    GROUP BY day
    ORDER BY day
  `);

  const byDate = new Map(
    rows.map((row) => [row.day ?? "", Number(row.cost ?? 0)]),
  );
  let total = 0;
  let billedThrough: string | null = null;

  const daily = [...keys].reverse().map((date) => {
    const cost = byDate.get(date) ?? 0;
    total += cost;
    if (byDate.has(date)) billedThrough = date;
    return { t: Date.parse(`${date}T00:00:00`), cost };
  });

  return { range, total, daily, billedThrough };
}

export async function getGeminiSpend(
  range: AiUsageRange,
): Promise<GeminiSpend> {
  const cached = spendCache.get(range);
  if (cached && Date.now() - cached.at < SPEND_CACHE_TTL_MS) {
    return cached.promise;
  }
  const promise = fetchGeminiSpend(range);
  spendCache.set(range, { at: Date.now(), promise });
  // A failure must not be cached, or one blip blanks the card for 15 minutes.
  promise.catch(() => {
    if (spendCache.get(range)?.promise === promise) spendCache.delete(range);
  });
  return promise;
}
