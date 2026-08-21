"use server";

import { type TimeSeries, listTimeSeries } from "./monitoring-client";

export type UsageRange = "60m" | "24h" | "7d" | "30d";

export type OperationsPoint = {
  t: number;
  reads: number;
  writes: number;
  deletes: number;
};

export type SubscriptionsPoint = {
  t: number;
  listeners: number;
  connections: number;
};

export type RulesPoint = {
  t: number;
  allows: number;
  errors: number;
  denies: number;
};

export interface FirestoreUsage {
  range: UsageRange;
  /** Seconds each chart bucket spans (per-minute for 60m, wider for long ranges). */
  bucketSeconds: number;
  operations: OperationsPoint[];
  subscriptions: SubscriptionsPoint[];
  rules: RulesPoint[];
}

// The console's two cumulative windows: "quota" resets daily at midnight
// Pacific (the free-tier daily quota), "billing" covers the current calendar
// month (also Pacific). Charted like the console's quota view: count metrics
// as cumulative running totals, gauges as-is.
export type UsagePeriod = "quota" | "billing";

export interface UsageTotals {
  period: UsagePeriod;
  /** Absolute ms of the period's Pacific-time start (midnight PT). */
  periodStartMs: number;
  /** Seconds each chart bucket spans. */
  bucketSeconds: number;
  /** Cumulative running totals; the last point is the period total. */
  operations: OperationsPoint[];
  subscriptions: SubscriptionsPoint[];
  /** Cumulative running totals; the last point is the period total. */
  rules: RulesPoint[];
}

// Bucket widths keep every range at ~60 chart points, mirroring the console.
const RANGE_SPECS: Record<
  UsageRange,
  { durationMs: number; alignmentSeconds: number }
> = {
  "60m": { durationMs: 60 * 60_000, alignmentSeconds: 60 },
  "24h": { durationMs: 24 * 3_600_000, alignmentSeconds: 1_800 },
  "7d": { durationMs: 7 * 86_400_000, alignmentSeconds: 10_800 },
  "30d": { durationMs: 30 * 86_400_000, alignmentSeconds: 43_200 },
};

// Firestore metrics land in Cloud Monitoring ~4 minutes late (ingestDelay:
// 240s on the metric descriptors); ending the window earlier avoids a
// misleading dip to zero at the right edge of every chart.
const INGEST_DELAY_MS = 240_000;

const COUNT_METRICS = {
  "firestore.googleapis.com/document/read_count": "reads",
  "firestore.googleapis.com/document/write_count": "writes",
  "firestore.googleapis.com/document/delete_count": "deletes",
} as const;

const RULES_METRIC = "firestore.googleapis.com/rules/evaluation_count";

const RULES_RESULTS = {
  ALLOW: "allows",
  DENY: "denies",
  ERROR: "errors",
} as const;

const GAUGE_METRICS = {
  "firestore.googleapis.com/network/snapshot_listeners": "listeners",
  "firestore.googleapis.com/network/active_connections": "connections",
} as const;

function pointValue(point: NonNullable<TimeSeries["points"]>[number]): number {
  const { int64Value, doubleValue } = point.value;
  return int64Value !== undefined ? Number(int64Value) : (doubleValue ?? 0);
}

/** Map of series key -> (bucket end ms -> value). */
function indexSeries(
  series: TimeSeries[],
  keyOf: (s: TimeSeries) => string | null,
): Map<string, Map<number, number>> {
  const byKey = new Map<string, Map<number, number>>();
  for (const s of series) {
    const key = keyOf(s);
    if (!key) continue;
    const buckets = byKey.get(key) ?? new Map<number, number>();
    for (const point of s.points ?? []) {
      buckets.set(Date.parse(point.interval.endTime), pointValue(point));
    }
    byKey.set(key, buckets);
  }
  return byKey;
}

interface SeriesBundle {
  operations: OperationsPoint[];
  subscriptions: SubscriptionsPoint[];
  rules: RulesPoint[];
}

/** Fetches all six metrics over one window into zero-filled, bucket-aligned point arrays. */
async function fetchSeriesBundle(
  startMs: number,
  endMs: number,
  alignmentSeconds: number,
): Promise<SeriesBundle> {
  // timeSeries.list accepts only ONE metric type per request (one_of filters
  // are rejected), so each metric is its own call: 6 per refresh, shared by
  // all viewers via the cache below.
  const window = { startMs, endMs, alignmentSeconds };
  const countCalls = Object.entries(COUNT_METRICS).map(async ([type, key]) => ({
    key,
    series: await listTimeSeries({
      ...window,
      filter: `metric.type = "${type}"`,
      // REDUCE_SUM collapses label splits (e.g. read type LOOKUP vs QUERY).
      perSeriesAligner: "ALIGN_SUM" as const,
      crossSeriesReducer: "REDUCE_SUM" as const,
      groupByFields: [],
    }),
  }));
  const rulesCall = listTimeSeries({
    ...window,
    filter: `metric.type = "${RULES_METRIC}"`,
    perSeriesAligner: "ALIGN_SUM",
    crossSeriesReducer: "REDUCE_SUM",
    groupByFields: ["metric.labels.result"],
  });
  const gaugeCalls = Object.entries(GAUGE_METRICS).map(async ([type, key]) => ({
    key,
    series: await listTimeSeries({
      ...window,
      filter: `metric.type = "${type}"`,
      perSeriesAligner: "ALIGN_MAX" as const,
      crossSeriesReducer: "REDUCE_MAX" as const,
      groupByFields: [],
    }),
  }));

  const [countResults, rulesSeries, gaugeResults] = await Promise.all([
    Promise.all(countCalls),
    rulesCall,
    Promise.all(gaugeCalls),
  ]);

  const counts = new Map<string, Map<number, number>>();
  for (const { key, series } of countResults) {
    counts.set(key, indexSeries(series, () => key).get(key) ?? new Map());
  }
  for (const [key, buckets] of indexSeries(rulesSeries, (s) => {
    const result = s.metric.labels?.result as
      | keyof typeof RULES_RESULTS
      | undefined;
    return result ? RULES_RESULTS[result] : null;
  })) {
    counts.set(key, buckets);
  }
  const gauges = new Map<string, Map<number, number>>();
  for (const { key, series } of gaugeResults) {
    gauges.set(key, indexSeries(series, () => key).get(key) ?? new Map());
  }

  // Aligned bucket end times are anchored to interval.endTime, so regenerating
  // them from endMs matches the API's timestamps exactly. Zero-fill misses so
  // idle periods draw as a flat line instead of a gap.
  const alignmentMs = alignmentSeconds * 1_000;
  // ceil, not floor: period windows aren't whole multiples of the alignment,
  // and flooring would drop the partial first bucket (the hours right after
  // midnight PT vanished from the quota chart).
  const bucketCount = Math.max(1, Math.ceil((endMs - startMs) / alignmentMs));
  const at = (buckets: Map<number, number> | undefined, t: number) =>
    buckets?.get(t) ?? 0;

  const operations: OperationsPoint[] = [];
  const subscriptions: SubscriptionsPoint[] = [];
  const rules: RulesPoint[] = [];
  for (let i = bucketCount - 1; i >= 0; i--) {
    const t = endMs - i * alignmentMs;
    operations.push({
      t,
      reads: at(counts.get("reads"), t),
      writes: at(counts.get("writes"), t),
      deletes: at(counts.get("deletes"), t),
    });
    subscriptions.push({
      t,
      listeners: at(gauges.get("listeners"), t),
      connections: at(gauges.get("connections"), t),
    });
    rules.push({
      t,
      allows: at(counts.get("allows"), t),
      denies: at(counts.get("denies"), t),
      errors: at(counts.get("errors"), t),
    });
  }

  return { operations, subscriptions, rules };
}

async function fetchUsage(range: UsageRange): Promise<FirestoreUsage> {
  const { durationMs, alignmentSeconds } = RANGE_SPECS[range];
  // Snap to a whole minute so bucket timestamps are clean and every fetch
  // within the same minute asks for an identical window.
  const endMs = Math.floor((Date.now() - INGEST_DELAY_MS) / 60_000) * 60_000;
  const bundle = await fetchSeriesBundle(
    endMs - durationMs,
    endMs,
    alignmentSeconds,
  );
  return { range, bucketSeconds: alignmentSeconds, ...bundle };
}

const PACIFIC_TZ = "America/Los_Angeles";

// Offset (ms) between UTC and Pacific at a given instant, derived by formatting
// the instant as Pacific wall-clock and diffing. DST-safe.
function pacificOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const at = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    at("year"),
    at("month") - 1,
    at("day"),
    at("hour") % 24, // Intl emits "24" for midnight; fold to 0.
    at("minute"),
    at("second"),
  );
  return asUtc - utcMs;
}

// Midnight Pacific that opens the current quota (today) or billing (1st of
// month) period. DST transitions happen at 2am, so midnight is unambiguous and
// a single offset correction is exact.
function pacificPeriodStart(period: UsagePeriod): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const at = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const day = period === "billing" ? 1 : at("day");
  const midnightGuess = Date.UTC(at("year"), at("month") - 1, day);
  return midnightGuess - pacificOffsetMs(midnightGuess);
}

// Midnight PT that closes the current period: tomorrow for quota, the 1st of
// next month for billing. Date.UTC carries day/month overflow.
function pacificPeriodEnd(period: UsagePeriod): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const at = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const guess =
    period === "quota"
      ? Date.UTC(at("year"), at("month") - 1, at("day") + 1)
      : Date.UTC(at("year"), at("month"), 1);
  return guess - pacificOffsetMs(guess);
}

/** Running-sums count series in place so charts match the console's cumulative quota view. */
function accumulate<K extends string>(
  points: ({ t: number } & Record<K, number>)[],
  keys: K[],
): void {
  const running = new Map<K, number>();
  for (const point of points) {
    // Write through a plain Record view — TS can't index-assign the intersection.
    const record: Record<K, number> = point;
    for (const key of keys) {
      const sum = (running.get(key) ?? 0) + record[key];
      running.set(key, sum);
      record[key] = sum;
    }
  }
}

async function fetchTotals(period: UsagePeriod): Promise<UsageTotals> {
  const startMs = pacificPeriodStart(period);
  const endMs = Math.floor((Date.now() - INGEST_DELAY_MS) / 60_000) * 60_000;
  // Hourly buckets draw the quota day like the console's chart; the billing
  // month uses 12h buckets to keep the point count sane.
  const alignmentSeconds = period === "quota" ? 3_600 : 43_200;
  const bundle = await fetchSeriesBundle(startMs, endMs, alignmentSeconds);
  accumulate(bundle.operations, ["reads", "writes", "deletes"]);
  accumulate(bundle.rules, ["allows", "denies", "errors"]);

  // Console parity: the axis spans the whole quota day / billing month with
  // the line stopping at "now". Cumulative series get an explicit zero at the
  // period start (not the gauge — listeners weren't 0 at midnight); rows after
  // "now" carry only `t`, so recharts ends each line there while the axis
  // continues to the period's end.
  bundle.operations.unshift({ t: startMs, reads: 0, writes: 0, deletes: 0 });
  bundle.rules.unshift({ t: startMs, allows: 0, denies: 0, errors: 0 });
  const alignmentMs = alignmentSeconds * 1_000;
  const periodEndMs = pacificPeriodEnd(period);
  for (let t = endMs + alignmentMs; t <= periodEndMs; t += alignmentMs) {
    bundle.operations.push({ t } as OperationsPoint);
    bundle.subscriptions.push({ t } as SubscriptionsPoint);
    bundle.rules.push({ t } as RulesPoint);
  }

  return {
    period,
    periodStartMs: startMs,
    bucketSeconds: alignmentSeconds,
    ...bundle,
  };
}

// One upstream fetch per key per minute, shared by every viewer. Caching the
// promise also dedupes concurrent requests; failures evict so the next call retries.
const CACHE_TTL_MS = 60_000;

function memoizePerMinute<K, V>(
  cache: Map<K, { at: number; promise: Promise<V> }>,
  key: K,
  make: () => Promise<V>,
): Promise<V> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.promise;
  }
  const promise = make();
  cache.set(key, { at: Date.now(), promise });
  promise.catch(() => {
    if (cache.get(key)?.promise === promise) {
      cache.delete(key);
    }
  });
  return promise;
}

const usageCache = new Map<
  UsageRange,
  { at: number; promise: Promise<FirestoreUsage> }
>();

export async function getFirestoreUsage(
  range: UsageRange,
): Promise<FirestoreUsage> {
  return memoizePerMinute(usageCache, range, () => fetchUsage(range));
}

const totalsCache = new Map<
  UsagePeriod,
  { at: number; promise: Promise<UsageTotals> }
>();

export async function getFirestoreUsageTotals(
  period: UsagePeriod,
): Promise<UsageTotals> {
  return memoizePerMinute(totalsCache, period, () => fetchTotals(period));
}
