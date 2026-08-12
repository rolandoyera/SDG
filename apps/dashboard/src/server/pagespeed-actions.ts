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
const MAX_OPPORTUNITIES = 8;

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

export interface PagespeedOpportunity {
  title: string;
  displayValue: string;
  savingsMs: number;
}

export interface PagespeedReport {
  url: string;
  strategy: PagespeedStrategy;
  fetchedAt: number;
  scores: PagespeedScore[];
  metrics: PagespeedMetric[];
  /** Null when CrUX has no data for the page (or origin) — common on small sites. */
  fieldData: {
    /** True when CrUX lacked page-level data and reported the whole origin. */
    originFallback: boolean;
    metrics: PagespeedFieldMetric[];
  } | null;
  opportunities: PagespeedOpportunity[];
}

// Shapes for just the slices of the PSI response we read.
interface PsiAudit {
  title?: string;
  score?: number | null;
  displayValue?: string;
  details?: { type?: string; overallSavingsMs?: number };
}

interface PsiResponse {
  error?: { message?: string };
  lighthouseResult?: {
    categories?: Record<string, { score?: number | null }>;
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

  const opportunities: PagespeedOpportunity[] = Object.values(audits)
    .filter(
      (audit) =>
        audit.details?.type === "opportunity" &&
        (audit.details.overallSavingsMs ?? 0) > 0 &&
        (audit.score ?? 1) < 1,
    )
    .map((audit) => ({
      title: audit.title ?? "",
      displayValue: audit.displayValue ?? "",
      savingsMs: audit.details?.overallSavingsMs ?? 0,
    }))
    .sort((a, b) => b.savingsMs - a.savingsMs)
    .slice(0, MAX_OPPORTUNITIES);

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
    fieldData: fieldMetrics.length
      ? {
          originFallback: data.loadingExperience?.origin_fallback === true,
          metrics: fieldMetrics,
        }
      : null,
    opportunities,
  };
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
      // dry — the raw quota message doesn't say what to do about it.
      throw new Error(
        /quota/i.test(message)
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
