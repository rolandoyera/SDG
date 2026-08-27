"use server";

import { getGSCClient, hasGSCCredentials } from "./gsc";
import { getActiveOrgConfig } from "./org-config";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const CONFIG_MISSING_ERROR =
  "Google Search Console is not configured for this organization yet.";

// GSC keys its data to America/Los_Angeles calendar days.
function ptToday(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Los_Angeles",
  });
}

function shiftDays(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Ranges pass through exactly as picked; days GSC hasn't published yet simply
// return no rows (queries request dataState "all", so fresh data covers up to
// ~a few hours ago). Never substitute a different window than the label shows.
function getDateRange(range?: string): { startDate: string; endDate: string } {
  const today = ptToday();

  const custom = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(range ?? "");
  if (custom && custom[1] <= custom[2]) {
    return { startDate: custom[1], endDate: custom[2] };
  }

  if (range === "yesterday") {
    const yesterday = shiftDays(today, -1);
    return { startDate: yesterday, endDate: yesterday };
  }
  if (range === "year-to-date") {
    return { startDate: `${today.slice(0, 4)}-01-01`, endDate: today };
  }

  let days = 28;
  if (range === "today") days = 1;
  else if (range === "last-7-days") days = 7;
  else if (range === "last-3-months") days = 90;

  return { startDate: shiftDays(today, -(days - 1)), endDate: today };
}

/**
 * Resolves the Search Console site for the current request's tenant.
 *
 * Only the verified caller's org `config.gscSiteUrl` counts — no env
 * fallback, so an unauthenticated request (Server Actions are publicly
 * reachable endpoints) can never read any site, and one tenant can
 * never see another's data.
 */
async function getConfiguredSiteUrl(): Promise<string | null> {
  if (!hasGSCCredentials()) return null;

  const orgConfig = await getActiveOrgConfig();
  if (!orgConfig) return null;

  const siteUrl = orgConfig.gscSiteUrl;
  return siteUrl?.trim() ? siteUrl.trim() : null;
}

export interface GSCConnectionResult {
  success: boolean;
  totalClicks?: number;
  error?: string;
  configMissing: boolean;
}

/** Lightweight validation: total clicks over the last 7 days. */
export async function testGSCConnection(): Promise<GSCConnectionResult> {
  const siteUrl = await getConfiguredSiteUrl();
  if (!siteUrl) {
    return { success: false, configMissing: true, error: CONFIG_MISSING_ERROR };
  }

  try {
    const client = getGSCClient();
    const { startDate, endDate } = getDateRange("last-7-days");

    const res = await client.searchanalytics.query({
      siteUrl,
      requestBody: { startDate, endDate, dimensions: [], dataState: "all" },
    });

    const totalClicks = res.data.rows?.[0]?.clicks ?? 0;
    return { success: true, totalClicks, configMissing: false };
  } catch (error: unknown) {
    console.error("Search Console connection test failed:", error);
    return {
      success: false,
      configMissing: false,
      error: getErrorMessage(
        error,
        "An unexpected error occurred while communicating with the Search Console API.",
      ),
    };
  }
}

export interface SearchTotals {
  clicks: string;
  impressions: string;
  ctr: string;
  position: string;
}

function formatCount(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
  return Math.round(val).toString();
}

/** Site-wide totals (clicks, impressions, CTR, average position) for the range. */
export async function fetchSearchTotals(
  range?: string,
): Promise<{ success: boolean; data?: SearchTotals; error?: string }> {
  const siteUrl = await getConfiguredSiteUrl();
  if (!siteUrl) return { success: false, error: CONFIG_MISSING_ERROR };

  try {
    const client = getGSCClient();
    const { startDate, endDate } = getDateRange(range);

    const res = await client.searchanalytics.query({
      siteUrl,
      requestBody: { startDate, endDate, dimensions: [], dataState: "all" },
    });

    const row = res.data.rows?.[0];
    return {
      success: true,
      data: {
        clicks: formatCount(row?.clicks ?? 0),
        impressions: formatCount(row?.impressions ?? 0),
        ctr: `${((row?.ctr ?? 0) * 100).toFixed(1)}%`,
        position: (row?.position ?? 0).toFixed(1),
      },
    };
  } catch (error: unknown) {
    console.error("Failed to fetch search totals from Search Console:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Failed to load Search Console totals."),
    };
  }
}

// Raw numbers so client-side sorting works; cells format for display.
export interface SearchQueryItem {
  query: string;
  clicks: number;
  impressions: number;
  /** Fraction 0–1. */
  ctr: number;
  position: number;
}

/** Top search queries (clicks, impressions, CTR, average position). */
export async function fetchTopSearchQueries(
  range?: string,
): Promise<{ success: boolean; data: SearchQueryItem[]; error?: string }> {
  const siteUrl = await getConfiguredSiteUrl();
  if (!siteUrl)
    return { success: false, data: [], error: CONFIG_MISSING_ERROR };

  try {
    const client = getGSCClient();
    const { startDate, endDate } = getDateRange(range);

    const res = await client.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ["query"],
        rowLimit: 1000,
        dataState: "all",
      },
    });

    const data: SearchQueryItem[] = (res.data.rows || []).map((row) => ({
      query: row.keys?.[0] || "(unknown)",
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
    }));

    return { success: true, data };
  } catch (error: unknown) {
    console.error(
      "Failed to fetch top search queries from Search Console:",
      error,
    );
    return {
      success: false,
      data: [],
      error: getErrorMessage(error, "Failed to load Search Console queries."),
    };
  }
}

export interface SearchPageItem {
  page: string;
  clicks: number;
  impressions: number;
  /** Fraction 0–1. */
  ctr: number;
  position: number;
}

/** Top landing pages from Google Search (clicks, impressions, CTR, avg position). */
export async function fetchTopSearchPages(
  range?: string,
): Promise<{ success: boolean; data: SearchPageItem[]; error?: string }> {
  const siteUrl = await getConfiguredSiteUrl();
  if (!siteUrl)
    return { success: false, data: [], error: CONFIG_MISSING_ERROR };

  try {
    const client = getGSCClient();
    const { startDate, endDate } = getDateRange(range);

    const res = await client.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ["page"],
        rowLimit: 1000,
        dataState: "all",
      },
    });

    const data: SearchPageItem[] = (res.data.rows || []).map((row) => ({
      page: row.keys?.[0] || "(unknown)",
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
    }));

    return { success: true, data };
  } catch (error: unknown) {
    console.error(
      "Failed to fetch top search pages from Search Console:",
      error,
    );
    return {
      success: false,
      data: [],
      error: getErrorMessage(error, "Failed to load Search Console pages."),
    };
  }
}
