"use server";

/**
 * Lighthouse via the PageSpeed Insights API — Google runs the audit on its
 * own infrastructure and returns the full Lighthouse result plus the CrUX
 * real-user field data it actually ranks with. One URL per run, ~15–30s.
 *
 * Google's machines fetch the page, so only public URLs work: live site and
 * competitors — never localhost/"Unpublished".
 */

import { getActiveOrgSeoCompetitors, getActiveOrgWebsite } from "./org-config";
import type { SeoResult } from "./seo-actions";

const PSI_ENDPOINT =
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
// The page exports maxDuration = 60; leave headroom to report a timeout.
const PSI_TIMEOUT_MS = 50_000;
// A run is slow and scores only move when the page changes, so cached reports
// serve leave-and-return restores (section convention: in-memory, no
// Firestore). Explicit Analyze always reruns.
const CACHE_TTL_MS = 30 * 60 * 1000;

export type PagespeedStrategy = "mobile" | "desktop";

/** Same source keys as the Keyword Analyzer dropdowns, minus local/none. */
export interface PagespeedInput {
  source: string; // "live" | "custom" | "comp:<index>"
  path: string;
  url: string;
  strategy: PagespeedStrategy;
}

export interface PagespeedScore {
  label: string;
  /** 0–100, Lighthouse-style; null when the category didn't run. */
  score: number | null;
}

export interface PagespeedMetric {
  id: string;
  label: string;
  displayValue: string;
  /** 0–1 Lighthouse audit score; null when not scored. */
  score: number | null;
}

export interface PagespeedFieldMetric {
  label: string;
  displayValue: string;
  /** CrUX bucket: FAST | AVERAGE | SLOW. */
  category: string;
}

/** One Insights/Diagnostics line: title plus the "Est savings of…" headline. */
export interface PagespeedAuditRow {
  id: string;
  title: string;
  displayValue: string;
  /** 0–1 audit score; null = informative (Lighthouse's hollow marker). */
  score: number | null;
}

export interface PagespeedReport {
  url: string;
  strategy: PagespeedStrategy;
  fetchedAt: number;
  scores: PagespeedScore[];
  metrics: PagespeedMetric[];
  /** Lighthouse's final render as a data: URI, for the report's phone thumbnail. */
  screenshot: string | null;
  /** Loading filmstrip frames (data: URIs), left to right. */
  filmstrip: string[];
  /** Failing/informative rows from the performance category's two audit groups. */
  insights: PagespeedAuditRow[];
  diagnostics: PagespeedAuditRow[];
  /** Insight/diagnostic audits that scored ≥ 0.9 — the "Passed audits (N)" line. */
  passedCount: number;
  /** Null when CrUX has no data for the page (or origin) — common on small sites. */
  fieldData: {
    /** True when CrUX lacked page-level data and reported the whole origin. */
    originFallback: boolean;
    metrics: PagespeedFieldMetric[];
  } | null;
}

// Shapes for just the slices of the PSI response we read.
interface PsiAudit {
  title?: string;
  score?: number | null;
  scoreDisplayMode?: string;
  displayValue?: string;
  details?: {
    type?: string;
    overallSavingsMs?: number;
    data?: string;
    /** Filmstrip frames on the screenshot-thumbnails audit. */
    items?: { data?: string }[];
  };
}

interface PsiResponse {
  error?: { message?: string };
  lighthouseResult?: {
    categories?: Record<
      string,
      {
        score?: number | null;
        auditRefs?: { id: string; group?: string }[];
      }
    >;
    audits?: Record<string, PsiAudit>;
  };
  loadingExperience?: {
    origin_fallback?: boolean;
    metrics?: Record<string, { percentile?: number; category?: string }>;
  };
}

const CATEGORY_LABELS: [key: string, label: string][] = [
  ["performance", "Performance"],
  ["accessibility", "Accessibility"],
  ["best-practices", "Best Practices"],
  ["seo", "SEO"],
];

const METRIC_LABELS: [id: string, label: string][] = [
  ["first-contentful-paint", "First Contentful Paint"],
  ["largest-contentful-paint", "Largest Contentful Paint"],
  ["total-blocking-time", "Total Blocking Time"],
  ["cumulative-layout-shift", "Cumulative Layout Shift"],
  ["speed-index", "Speed Index"],
];

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

/** CrUX field metrics worth showing: the Core Web Vitals. */
const FIELD_METRICS: {
  key: string;
  label: string;
  display: (percentile: number) => string;
}[] = [
  { key: "LARGEST_CONTENTFUL_PAINT_MS", label: "LCP", display: formatMs },
  { key: "INTERACTION_TO_NEXT_PAINT", label: "INP", display: formatMs },
  {
    key: "CUMULATIVE_LAYOUT_SHIFT_SCORE",
    label: "CLS",
    // CrUX reports CLS ×100 as an integer.
    display: (percentile) => (percentile / 100).toFixed(2),
  },
];

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Live/competitor URLs resolve server-side from org config — same posture as
 * the crawler. Custom mirrors analyzeExternalUrl: PSI only audits public
 * pages via Google's own fetch, so a client-supplied URL is fine there.
 */
async function resolveUrl(input: PagespeedInput): Promise<string> {
  if (input.source === "custom") {
    const raw = input.url.trim();
    if (!raw) throw new Error("Enter a URL.");
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).href;
  }

  const path = input.path.trim();
  const suffix = path.startsWith("/") ? path : `/${path}`;
  if (input.source === "live") {
    const website = await getActiveOrgWebsite();
    if (!website) {
      throw new Error(
        "No company website configured — set the Website field on the Company page.",
      );
    }
    const origin = new URL(
      /^https?:\/\//i.test(website) ? website : `https://${website}`,
    ).origin;
    return new URL(suffix, origin).href;
  }

  const competitor = /^comp:(\d+)$/.exec(input.source);
  if (competitor) {
    const saved = await getActiveOrgSeoCompetitors();
    const url = saved[Number(competitor[1])]?.url;
    if (!url) throw new Error("That competitor is no longer saved.");
    return new URL(suffix, url).href;
  }

  throw new Error("Unknown source.");
}

function parseReport(
  data: PsiResponse,
  url: string,
  strategy: PagespeedStrategy,
): PagespeedReport {
  const categories = data.lighthouseResult?.categories ?? {};
  const audits = data.lighthouseResult?.audits ?? {};

  const scores: PagespeedScore[] = CATEGORY_LABELS.map(([key, label]) => {
    const score = categories[key]?.score;
    return {
      label,
      score: typeof score === "number" ? Math.round(score * 100) : null,
    };
  });

  const metrics: PagespeedMetric[] = METRIC_LABELS.map(([id, label]) => {
    const score = audits[id]?.score;
    return {
      id,
      label,
      displayValue: audits[id]?.displayValue ?? "—",
      score: typeof score === "number" ? score : null,
    };
  });

  // Lighthouse's Insights/Diagnostics sections: the performance category's
  // auditRefs carry the grouping; a row is shown when it fails (score < 0.9)
  // or is informative (null score, e.g. "LCP breakdown"), and counted as
  // passed otherwise — same split the Lighthouse report makes.
  const auditRefs =
    data.lighthouseResult?.categories?.performance?.auditRefs ?? [];
  const collectGroup = (group: string) => {
    const rows: PagespeedAuditRow[] = [];
    let passed = 0;
    for (const ref of auditRefs) {
      if (ref.group !== group) continue;
      const audit = audits[ref.id];
      if (!audit) continue;
      const mode = audit.scoreDisplayMode ?? "";
      if (mode === "notApplicable" || mode === "manual") continue;
      const score = typeof audit.score === "number" ? audit.score : null;
      if (score !== null && score >= 0.9) {
        passed += 1;
        continue;
      }
      rows.push({
        id: ref.id,
        title: audit.title ?? ref.id,
        displayValue: audit.displayValue ?? "",
        score,
      });
    }
    return { rows, passed };
  };
  const insights = collectGroup("insights");
  const diagnostics = collectGroup("diagnostics");

  const filmstrip = (
    audits["screenshot-thumbnails"]?.details?.items ?? []
  ).flatMap((item) => (item.data ? [item.data] : []));

  const cruxMetrics = data.loadingExperience?.metrics ?? {};
  const fieldMetrics: PagespeedFieldMetric[] = FIELD_METRICS.flatMap(
    ({ key, label, display }) => {
      const metric = cruxMetrics[key];
      if (metric?.percentile === undefined) return [];
      return [
        {
          label,
          displayValue: display(metric.percentile),
          category: metric.category ?? "",
        },
      ];
    },
  );

  return {
    url,
    strategy,
    fetchedAt: Date.now(),
    scores,
    metrics,
    screenshot: audits["final-screenshot"]?.details?.data ?? null,
    filmstrip,
    insights: insights.rows,
    diagnostics: diagnostics.rows,
    passedCount: insights.passed + diagnostics.passed,
    fieldData: fieldMetrics.length
      ? {
          originFallback: data.loadingExperience?.origin_fallback === true,
          metrics: fieldMetrics,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// CrUX (dedicated Chrome UX Report API — instant field data, no Lighthouse)
// ---------------------------------------------------------------------------

const CRUX_ENDPOINT =
  "https://chromeuxreport.googleapis.com/v1/records:queryRecord";

export interface CruxFieldData {
  originFallback: boolean;
  metrics: PagespeedFieldMetric[];
}

/** p75 → bucket using the web-vitals thresholds PSI itself categorizes with. */
const CRUX_METRICS: {
  key: string;
  label: string;
  good: number;
  poor: number;
  display: (p75: number) => string;
}[] = [
  {
    key: "largest_contentful_paint",
    label: "LCP",
    good: 2500,
    poor: 4000,
    display: formatMs,
  },
  {
    key: "interaction_to_next_paint",
    label: "INP",
    good: 200,
    poor: 500,
    display: formatMs,
  },
  {
    key: "cumulative_layout_shift",
    label: "CLS",
    good: 0.1,
    poor: 0.25,
    // The CrUX API reports CLS p75 as a decimal string, not ×100 like PSI.
    display: (p75) => p75.toFixed(2),
  },
];

interface CruxResponse {
  record?: {
    metrics?: Record<string, { percentiles?: { p75?: number | string } }>;
  };
}

async function queryCrux(
  body: Record<string, unknown>,
  apiKey: string,
): Promise<CruxResponse | null> {
  const response = await fetch(`${CRUX_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  // 404 = CrUX has no record at this level (page vs origin), not a failure.
  if (!response.ok) return null;
  return (await response.json()) as CruxResponse;
}

/**
 * Real-user field data straight from the CrUX API — sub-second, so the card
 * fills while the Lighthouse runs are still going. Resolves null (never an
 * error) when there's no API key or no data: field data is supplemental, and
 * the PSI report's embedded copy is the fallback. Needs the Chrome UX Report
 * API enabled on the PAGESPEED_API_KEY project.
 */
export async function fetchCruxFieldData(
  input: PagespeedInput,
): Promise<SeoResult<CruxFieldData | null>> {
  try {
    const apiKey = process.env.PAGESPEED_API_KEY;
    if (!apiKey) return { success: true, data: null };
    const url = await resolveUrl(input);
    const formFactor = input.strategy === "desktop" ? "DESKTOP" : "PHONE";

    let originFallback = false;
    let data = await queryCrux({ url, formFactor }, apiKey);
    if (!data?.record?.metrics) {
      originFallback = true;
      data = await queryCrux(
        { origin: new URL(url).origin, formFactor },
        apiKey,
      );
    }
    const cruxMetrics = data?.record?.metrics;
    if (!cruxMetrics) return { success: true, data: null };

    const metrics: PagespeedFieldMetric[] = CRUX_METRICS.flatMap(
      ({ key, label, good, poor, display }) => {
        const p75 = Number(cruxMetrics[key]?.percentiles?.p75);
        if (!Number.isFinite(p75)) return [];
        return [
          {
            label,
            displayValue: display(p75),
            category: p75 <= good ? "FAST" : p75 <= poor ? "AVERAGE" : "SLOW",
          },
        ];
      },
    );
    return {
      success: true,
      data: metrics.length ? { originFallback, metrics } : null,
    };
  } catch {
    return { success: true, data: null };
  }
}

// ---------------------------------------------------------------------------
// Cache (in-memory per server instance, same policy as the analyzer caches)
// ---------------------------------------------------------------------------

const psiCache = new Map<string, PagespeedReport>();

/** Last report for the target if this instance ran one recently — never runs PSI. */
export async function fetchCachedPagespeed(
  input: PagespeedInput,
): Promise<SeoResult<PagespeedReport | null>> {
  try {
    const url = await resolveUrl(input);
    const cached = psiCache.get(`${input.strategy}|${url}`);
    return {
      success: true,
      data:
        cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS ? cached : null,
    };
  } catch {
    // An unresolvable target has no report — the empty state covers it.
    return { success: true, data: null };
  }
}

/** Run Lighthouse (PSI) against the target. Always fresh; updates the cache. */
export async function runPagespeed(
  input: PagespeedInput,
): Promise<SeoResult<PagespeedReport>> {
  try {
    const url = await resolveUrl(input);
    const strategy: PagespeedStrategy =
      input.strategy === "desktop" ? "desktop" : "mobile";

    const params = new URLSearchParams({ url, strategy });
    for (const [key] of CATEGORY_LABELS) params.append("category", key);
    // Optional: raises the shared anonymous quota to ~25k runs/day.
    const apiKey = process.env.PAGESPEED_API_KEY;
    if (apiKey) params.set("key", apiKey);

    const response = await fetch(`${PSI_ENDPOINT}?${params}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(PSI_TIMEOUT_MS),
    });
    const data = (await response.json()) as PsiResponse;
    if (!response.ok) {
      const message = data.error?.message ?? `PSI HTTP ${response.status}`;
      // Keyless runs draw from a shared anonymous pool that routinely runs
      // dry — the raw quota message doesn't say what to do about it. With a
      // key configured, "set the key" is misleading advice; show the real
      // message (likely a per-minute limit or the key's own quota).
      throw new Error(
        /quota/i.test(message) && !apiKey
          ? "PageSpeed quota exceeded — set PAGESPEED_API_KEY (a free key from Google Cloud Console) for a ~25k/day quota of your own."
          : message,
      );
    }

    const report = parseReport(data, url, strategy);
    psiCache.set(`${strategy}|${url}`, report);
    return { success: true, data: report };
  } catch (error) {
    console.error("runPagespeed failed:", error);
    return {
      success: false,
      error: getErrorMessage(error, "The Lighthouse run failed."),
    };
  }
}

// ---------------------------------------------------------------------------
// Both-strategy wrappers. Next.js runs server actions from one client
// serially, so two runPagespeed invocations execute back-to-back (~50s and
// the desktop tab sits empty the whole first half). One invocation running
// both strategies via Promise.all finishes with the slower run instead.
// ---------------------------------------------------------------------------

export type PagespeedTarget = Omit<PagespeedInput, "strategy">;

export async function runPagespeedBoth(input: PagespeedTarget): Promise<{
  mobile: SeoResult<PagespeedReport>;
  desktop: SeoResult<PagespeedReport>;
}> {
  const [mobile, desktop] = await Promise.all([
    runPagespeed({ ...input, strategy: "mobile" }),
    runPagespeed({ ...input, strategy: "desktop" }),
  ]);
  return { mobile, desktop };
}

export async function fetchCruxBoth(input: PagespeedTarget): Promise<{
  mobile: SeoResult<CruxFieldData | null>;
  desktop: SeoResult<CruxFieldData | null>;
}> {
  const [mobile, desktop] = await Promise.all([
    fetchCruxFieldData({ ...input, strategy: "mobile" }),
    fetchCruxFieldData({ ...input, strategy: "desktop" }),
  ]);
  return { mobile, desktop };
}

export async function fetchCachedPagespeedBoth(
  input: PagespeedTarget,
): Promise<{
  mobile: SeoResult<PagespeedReport | null>;
  desktop: SeoResult<PagespeedReport | null>;
}> {
  const [mobile, desktop] = await Promise.all([
    fetchCachedPagespeed({ ...input, strategy: "mobile" }),
    fetchCachedPagespeed({ ...input, strategy: "desktop" }),
  ]);
  return { mobile, desktop };
}
