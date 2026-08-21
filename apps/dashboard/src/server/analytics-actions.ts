"use server";

import type { protos } from "@google-analytics/data";

import { getGA4Client, hasGA4Credentials } from "./ga4";
import type { KpiMetric } from "./meta-actions";
import { getActiveOrgConfig } from "./org-config";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

// Resolve an ISO country code (e.g. "US") to a display name. Querying countryId
// alone keeps activeUsers counts matching GA4's single-dimension Countries report.
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
function countryNameFromCode(code: string): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

// GA4 returns unresolved geography under two blank spellings — "" and "(not set)" —
// and (when a second dimension is present) smears the same users across several such
// rows. We treat both as "unknown" so they can be collapsed into one group.
function isUnknownGeo(value: string | null | undefined): boolean {
  return !value || value === "(not set)";
}

export interface GA4ConnectionResult {
  success: boolean;
  activeUsers?: number;
  error?: string;
  configMissing: boolean;
}

export async function testGA4Connection(): Promise<GA4ConnectionResult> {
  const propertyId = await getConfiguredPropertyId();

  if (!propertyId) {
    return {
      success: false,
      configMissing: true,
      error: CONFIG_MISSING_ERROR,
    };
  }

  try {
    const client = getGA4Client();

    // Query active users for the last 7 days as a lightweight validation check
    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [
        {
          startDate: "7daysAgo",
          endDate: "today",
        },
      ],
      metrics: [
        {
          name: "activeUsers",
        },
      ],
    });

    const activeUsersVal = response.rows?.[0]?.metricValues?.[0]?.value;
    const activeUsers = activeUsersVal ? parseInt(activeUsersVal, 10) : 0;

    return {
      success: true,
      activeUsers,
      configMissing: false,
    };
  } catch (error: unknown) {
    console.error("GA4 Connection Test Failed:", error);
    return {
      success: false,
      configMissing: false,
      error: getErrorMessage(
        error,
        "An unexpected error occurred while communicating with the GA4 API.",
      ),
    };
  }
}

// Table rows carry raw numbers so client-side sorting works; cells format for
// display (a pre-formatted "1.0k" sorts alphabetically).
export interface TopPageItem {
  path: string;
  views: number;
  /** Formatted avg engagement time, e.g. "2m 03s". */
  time: string;
  /** Raw avg engagement seconds — sort key for the time column. */
  avgSeconds: number;
  /** Fraction 0–1. */
  bounceRate: number;
}

export async function fetchTopPagesData(
  range?: string,
  campaign?: string,
): Promise<{ success: boolean; data: TopPageItem[]; error?: string }> {
  const propertyId = await getConfiguredPropertyId();

  if (!propertyId) {
    return { success: false, data: [], error: CONFIG_MISSING_ERROR };
  }

  try {
    const client = getGA4Client();

    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [rangeToDates(range)],
      dimensions: [
        {
          name: "pagePath",
        },
      ],
      metrics: [
        {
          name: "screenPageViews",
        },
        {
          name: "userEngagementDuration", // Total engagement duration in seconds
        },
        {
          name: "activeUsers", // Active users to calculate average engagement
        },
        {
          name: "bounceRate", // Fraction 0–1: sessions that were not engaged
        },
      ],
      dimensionFilter: campaignFilter(campaign),
    });

    const items: TopPageItem[] = (response.rows || []).map((row) => {
      const path = row.dimensionValues?.[0]?.value || "/";
      const views = parseInt(row.metricValues?.[0]?.value || "0", 10);
      const durationNum = parseFloat(row.metricValues?.[1]?.value || "0");
      const usersNum = parseInt(row.metricValues?.[2]?.value || "1", 10) || 1;
      const bounceRate = parseFloat(row.metricValues?.[3]?.value || "0");

      // Average Engagement Time = Total Duration / Active Users
      const avgSeconds = durationNum / usersNum;
      const mins = Math.floor(avgSeconds / 60);
      const secs = Math.round(avgSeconds % 60);
      const time =
        mins > 0 ? `${mins}m ${secs.toString().padStart(2, "0")}s` : `${secs}s`;

      return { path, views, time, avgSeconds, bounceRate };
    });

    return {
      success: true,
      data: items,
    };
  } catch (error: unknown) {
    console.error("Failed to fetch top pages from GA4:", error);
    return {
      success: false,
      data: [],
      error: getErrorMessage(error, "Failed to load GA4 top pages."),
    };
  }
}

export interface KpiCardData {
  value: string;
  previousValue: string;
  change: string;
  isPositive: boolean;
}

export interface AnalyticsKpis {
  uniqueVisitors: KpiCardData;
  /** GA4 `sessions` — visits, not people. */
  visits: KpiCardData;
  pageviews: KpiCardData;
  engagementRate: KpiCardData;
  conversionRate: KpiCardData;
}

export interface FetchKpiResult {
  success: boolean;
  data?: AnalyticsKpis;
  error?: string;
  label: string;
  comparisonLabel: string;
}

// Custom "?range=" encoding from the date-range picker: "YYYY-MM-DD_YYYY-MM-DD".
const CUSTOM_RANGE_PATTERN = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/;

function parseCustomRange(
  range?: string,
): { startDate: string; endDate: string } | null {
  const match = range ? CUSTOM_RANGE_PATTERN.exec(range) : null;
  return match ? { startDate: match[1], endDate: match[2] } : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const parseDay = (value: string) => new Date(`${value}T00:00:00Z`);
const formatDay = (date: Date) => date.toISOString().split("T")[0];
const prettyDay = (date: Date) =>
  date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

function getDateRangesForRange(range: string): {
  current: { startDate: string; endDate: string };
  previous: { startDate: string; endDate: string };
  label: string;
  comparisonLabel: string;
} {
  const custom = parseCustomRange(range);
  if (custom) {
    const start = parseDay(custom.startDate);
    const end = parseDay(custom.endDate);
    const days = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
    return {
      current: custom,
      // Compare against the window of equal length immediately before.
      previous: {
        startDate: formatDay(new Date(start.getTime() - days * DAY_MS)),
        endDate: formatDay(new Date(start.getTime() - DAY_MS)),
      },
      label:
        days === 1
          ? prettyDay(start)
          : `${prettyDay(start)} – ${prettyDay(end)}`,
      comparisonLabel: days === 1 ? "previous day" : `previous ${days} days`,
    };
  }

  if (range === "today") {
    return {
      current: { startDate: "today", endDate: "today" },
      previous: { startDate: "yesterday", endDate: "yesterday" },
      label: "today",
      comparisonLabel: "yesterday",
    };
  }
  if (range === "yesterday") {
    return {
      current: { startDate: "yesterday", endDate: "yesterday" },
      previous: { startDate: "2daysAgo", endDate: "2daysAgo" },
      label: "yesterday",
      comparisonLabel: "previous day",
    };
  }

  const today = new Date();
  const formatDate = (date: Date) => date.toISOString().split("T")[0];

  let days = 28;
  let label = "last 4 weeks";
  let comparisonLabel = "previous 4 weeks";

  if (range === "last-7-days") {
    days = 7;
    label = "last 7 days";
    comparisonLabel = "previous 7 days";
  } else if (range === "last-4-weeks") {
    days = 28;
    label = "last 4 weeks";
    comparisonLabel = "previous 4 weeks";
  } else if (range === "last-3-months") {
    days = 90;
    label = "last 3 months";
    comparisonLabel = "previous 3 months";
  } else if (range === "year-to-date") {
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const diffTime = Math.abs(today.getTime() - startOfYear.getTime());
    days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    label = "year to date";
    comparisonLabel = "same period last year";
  }

  if (range === "year-to-date") {
    const currentStartStr = `${today.getFullYear()}-01-01`;
    const currentEndStr = formatDate(today);

    const prevStartStr = `${today.getFullYear() - 1}-01-01`;
    const prevYearDate = new Date(today);
    prevYearDate.setFullYear(today.getFullYear() - 1);
    const prevEndStr = formatDate(prevYearDate);

    return {
      current: { startDate: currentStartStr, endDate: currentEndStr },
      previous: { startDate: prevStartStr, endDate: prevEndStr },
      label: "year to date",
      comparisonLabel: "same period last year",
    };
  }

  const currentEnd = new Date(today);
  const currentStart = new Date(today);
  currentStart.setDate(today.getDate() - days + 1);

  const prevEnd = new Date(today);
  prevEnd.setDate(today.getDate() - days);
  const prevStart = new Date(today);
  prevStart.setDate(today.getDate() - 2 * days + 1);

  return {
    current: {
      startDate: formatDate(currentStart),
      endDate: formatDate(currentEnd),
    },
    previous: {
      startDate: formatDate(prevStart),
      endDate: formatDate(prevEnd),
    },
    label,
    comparisonLabel,
  };
}

export async function fetchKpiData(
  range?: string,
  campaign?: string,
): Promise<FetchKpiResult> {
  const activeRange = range ?? "last-4-weeks";
  const dateRanges = getDateRangesForRange(activeRange);

  const propertyId = await getConfiguredPropertyId();

  if (!propertyId) {
    return {
      success: false,
      error: CONFIG_MISSING_ERROR,
      label: dateRanges.label,
      comparisonLabel: dateRanges.comparisonLabel,
    };
  }

  try {
    const client = getGA4Client();

    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [
        {
          startDate: dateRanges.current.startDate,
          endDate: dateRanges.current.endDate,
          name: "current",
        },
        {
          startDate: dateRanges.previous.startDate,
          endDate: dateRanges.previous.endDate,
          name: "previous",
        },
      ],
      metrics: [
        { name: "activeUsers" },
        { name: "sessions" },
        { name: "screenPageViews" },
        { name: "engagementRate" },
        { name: "sessionConversionRate" },
      ],
      dimensionFilter: campaignFilter(campaign),
    });

    let currentData = {
      activeUsers: 0,
      sessions: 0,
      screenPageViews: 0,
      engagementRate: 0,
      sessionConversionRate: 0,
    };

    let previousData = {
      activeUsers: 0,
      sessions: 0,
      screenPageViews: 0,
      engagementRate: 0,
      sessionConversionRate: 0,
    };

    if (response.rows) {
      for (const row of response.rows) {
        const rangeName = row.dimensionValues?.[0]?.value;
        const values = row.metricValues || [];
        const activeUsers = parseInt(values[0]?.value || "0", 10);
        const sessions = parseInt(values[1]?.value || "0", 10);
        const screenPageViews = parseInt(values[2]?.value || "0", 10);
        const engagementRate = parseFloat(values[3]?.value || "0");
        const sessionConversionRate = parseFloat(values[4]?.value || "0");

        const data = {
          activeUsers,
          sessions,
          screenPageViews,
          engagementRate,
          sessionConversionRate,
        };

        if (rangeName === "current" || rangeName === "date_range_0") {
          currentData = data;
        } else if (rangeName === "previous" || rangeName === "date_range_1") {
          previousData = data;
        }
      }
    }

    const formatGAValue = (val: number): string => {
      if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
      if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
      return val.toString();
    };

    const getKpiMetrics = (
      current: number,
      previous: number,
      isPercent = false,
    ): KpiCardData => {
      const currentStr = isPercent
        ? `${(current * 100).toFixed(1)}%`
        : formatGAValue(current);
      const previousStr = isPercent
        ? `${(previous * 100).toFixed(1)}%`
        : formatGAValue(previous);

      if (previous === 0) {
        return {
          value: currentStr,
          previousValue: previousStr,
          change: "0.0%",
          isPositive: true,
        };
      }

      const diff = current - previous;
      const pct = (diff / previous) * 100;
      const isPositive = pct >= 0;

      return {
        value: currentStr,
        previousValue: previousStr,
        change: `${Math.abs(pct).toFixed(1)}%`,
        isPositive,
      };
    };

    return {
      success: true,
      data: {
        uniqueVisitors: getKpiMetrics(
          currentData.activeUsers,
          previousData.activeUsers,
        ),
        visits: getKpiMetrics(currentData.sessions, previousData.sessions),
        pageviews: getKpiMetrics(
          currentData.screenPageViews,
          previousData.screenPageViews,
        ),
        engagementRate: getKpiMetrics(
          currentData.engagementRate,
          previousData.engagementRate,
          true,
        ),
        conversionRate: getKpiMetrics(
          currentData.sessionConversionRate,
          previousData.sessionConversionRate,
          true,
        ),
      },
      label: dateRanges.label,
      comparisonLabel: dateRanges.comparisonLabel,
    };
  } catch (error: unknown) {
    console.error("Failed to fetch KPI data from GA4:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Failed to load GA4 KPI strip metrics."),
      label: dateRanges.label,
      comparisonLabel: dateRanges.comparisonLabel,
    };
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the GA4 property for the current request's tenant.
 *
 * Only the verified caller's org `config.gaPropertyId` counts — no env
 * fallback, so an unauthenticated request (Server Actions are publicly
 * reachable endpoints) can never read any property, and one tenant can
 * never see another's data.
 */
async function getConfiguredPropertyId(): Promise<string | null> {
  if (!hasGA4Credentials()) return null;

  const orgConfig = await getActiveOrgConfig();
  if (!orgConfig) return null;

  const gaPropertyId = orgConfig.gaPropertyId;
  return gaPropertyId?.trim() ? gaPropertyId.trim() : null;
}

const CONFIG_MISSING_ERROR =
  "Google Analytics 4 is not configured for this organization yet.";

type FilterExpression = protos.google.analytics.data.v1beta.IFilterExpression;

/**
 * Session-scoped campaign filter for the toolbar's `?campaign=` param.
 * Returns undefined when no campaign is selected so `dimensionFilter` is
 * simply omitted; `merge` folds it into a query's own filter via andGroup.
 */
function campaignFilter(campaign?: string): FilterExpression | undefined {
  if (!campaign?.trim()) return undefined;
  return {
    filter: {
      fieldName: "sessionCampaignName",
      stringFilter: { matchType: "EXACT", value: campaign.trim() },
    },
  };
}

function mergeFilters(
  own: FilterExpression,
  campaign?: FilterExpression,
): FilterExpression {
  return campaign ? { andGroup: { expressions: [own, campaign] } } : own;
}

/**
 * Campaign values (`sessionCampaignName`) with sessions in the range, busiest
 * first — the toolbar's campaign dropdown options. Includes "(not set)",
 * "(direct)" etc.; they are real GA4 buckets and filterable like any other.
 */
export async function fetchCampaignOptions(range?: string): Promise<string[]> {
  const propertyId = await getConfiguredPropertyId();
  if (!propertyId) return [];

  try {
    const client = getGA4Client();
    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [rangeToDates(range)],
      dimensions: [{ name: "sessionCampaignName" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 100,
    });
    return (response.rows || [])
      .map((row) => row.dimensionValues?.[0]?.value || "")
      .filter(Boolean);
  } catch (error: unknown) {
    console.error("Failed to fetch campaign options from GA4:", error);
    return [];
  }
}

function rangeToDates(range?: string): {
  startDate: string;
  endDate: string;
} {
  const custom = parseCustomRange(range);
  if (custom) return custom;
  if (range === "today") return { startDate: "today", endDate: "today" };
  if (range === "yesterday")
    return { startDate: "yesterday", endDate: "yesterday" };
  if (range === "last-7-days")
    return { startDate: "7daysAgo", endDate: "today" };
  if (range === "last-3-months")
    return { startDate: "90daysAgo", endDate: "today" };
  if (range === "year-to-date")
    return { startDate: `${new Date().getFullYear()}-01-01`, endDate: "today" };
  return { startDate: "28daysAgo", endDate: "today" };
}

// Single-day ranges render trends hourly (dateHour) instead of daily.
function isSingleDayRange(range?: string): boolean {
  const custom = parseCustomRange(range);
  if (custom) return custom.startDate === custom.endDate;
  return range === "today" || range === "yesterday";
}

function formatCount(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
  return val.toString();
}

// GA4 returns dates as YYYYMMDD and date-hours as YYYYMMDDHH.
function formatTrendLabel(raw: string, hourly: boolean): string {
  if (hourly) return `${raw.slice(8, 10)}:00`;
  return `${raw.slice(4, 6)}/${raw.slice(6, 8)}`;
}

// ---------------------------------------------------------------------------
// Traffic trend (Overview)
// ---------------------------------------------------------------------------

export interface TrendPoint {
  label: string;
  activeUsers: number;
  sessions: number;
}

export async function fetchTrafficTrend(
  range?: string,
  campaign?: string,
): Promise<{ success: boolean; data: TrendPoint[]; error?: string }> {
  const propertyId = await getConfiguredPropertyId();
  if (!propertyId)
    return { success: false, data: [], error: CONFIG_MISSING_ERROR };

  const hourly = isSingleDayRange(range);
  const dimension = hourly ? "dateHour" : "date";

  try {
    const client = getGA4Client();
    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [rangeToDates(range)],
      dimensions: [{ name: dimension }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }],
      orderBys: [{ dimension: { dimensionName: dimension } }],
      dimensionFilter: campaignFilter(campaign),
      limit: 200,
    });

    const data: TrendPoint[] = (response.rows || []).map((row) => ({
      label: formatTrendLabel(row.dimensionValues?.[0]?.value || "", hourly),
      activeUsers: parseInt(row.metricValues?.[0]?.value || "0", 10),
      sessions: parseInt(row.metricValues?.[1]?.value || "0", 10),
    }));

    return { success: true, data };
  } catch (error: unknown) {
    console.error("Failed to fetch traffic trend from GA4:", error);
    return {
      success: false,
      data: [],
      error: getErrorMessage(error, "Failed to load GA4 traffic trend."),
    };
  }
}

// ---------------------------------------------------------------------------
// Traffic sources (Overview)
// ---------------------------------------------------------------------------

export interface TrafficSourceItem {
  source: string;
  visitors: number;
  label: string;
}

export interface TrafficSourcesData {
  channels: TrafficSourceItem[];
  sources: TrafficSourceItem[];
  campaigns: TrafficSourceItem[];
}

export async function fetchTrafficSources(
  range?: string,
  campaign?: string,
): Promise<{ success: boolean; data?: TrafficSourcesData; error?: string }> {
  const propertyId = await getConfiguredPropertyId();
  if (!propertyId) return { success: false, error: CONFIG_MISSING_ERROR };

  try {
    const client = getGA4Client();

    const runFor = async (dimension: string): Promise<TrafficSourceItem[]> => {
      const [response] = await client.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [rangeToDates(range)],
        dimensions: [{ name: dimension }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        dimensionFilter: campaignFilter(campaign),
        // Over-fetch so filtering "(not set)" can't starve the top-8 slice.
        limit: 10,
      });

      return (response.rows || [])
        .map((row) => {
          const visitors = parseInt(row.metricValues?.[0]?.value || "0", 10);
          return {
            source: row.dimensionValues?.[0]?.value || "(unknown)",
            visitors,
            label: formatCount(visitors),
          };
        })
        .filter((item) => item.source !== "(not set)")
        .slice(0, 8);
    };

    const [channels, sources, campaigns] = await Promise.all([
      runFor("sessionDefaultChannelGroup"),
      runFor("sessionSource"),
      runFor("sessionCampaignName"),
    ]);

    return { success: true, data: { channels, sources, campaigns } };
  } catch (error: unknown) {
    console.error("Failed to fetch traffic sources from GA4:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Failed to load GA4 traffic sources."),
    };
  }
}

// ---------------------------------------------------------------------------
// Realtime (Overview)
// ---------------------------------------------------------------------------

export interface RealtimeData {
  total: number;
  perMinute: { minute: number; visitors: number }[];
  countries: { code: string; name: string; visitors: number }[];
}

export async function fetchRealtimeData(): Promise<{
  success: boolean;
  data?: RealtimeData;
  error?: string;
}> {
  const propertyId = await getConfiguredPropertyId();
  if (!propertyId) return { success: false, error: CONFIG_MISSING_ERROR };

  try {
    const client = getGA4Client();

    const [[minuteResponse], [countryResponse]] = await Promise.all([
      client.runRealtimeReport({
        property: `properties/${propertyId}`,
        dimensions: [{ name: "minutesAgo" }],
        metrics: [{ name: "activeUsers" }],
      }),
      client.runRealtimeReport({
        property: `properties/${propertyId}`,
        dimensions: [{ name: "countryId" }, { name: "country" }],
        metrics: [{ name: "activeUsers" }],
      }),
    ]);

    // Build a full 30-minute series (oldest -> newest); GA4 omits empty minutes.
    const byMinute = new Map<number, number>();
    for (const row of minuteResponse.rows || []) {
      const minutesAgo = parseInt(row.dimensionValues?.[0]?.value || "0", 10);
      byMinute.set(
        minutesAgo,
        parseInt(row.metricValues?.[0]?.value || "0", 10),
      );
    }
    const perMinute = Array.from({ length: 30 }, (_, i) => {
      const minutesAgo = 29 - i;
      return { minute: i + 1, visitors: byMinute.get(minutesAgo) || 0 };
    });

    const allCountries = (countryResponse.rows || []).map((row) => ({
      code: row.dimensionValues?.[0]?.value || "",
      name: row.dimensionValues?.[1]?.value || "Unknown",
      visitors: parseInt(row.metricValues?.[0]?.value || "0", 10),
    }));
    const total = allCountries.reduce((sum, c) => sum + c.visitors, 0);
    const countries = allCountries
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 4);

    return { success: true, data: { total, perMinute, countries } };
  } catch (error: unknown) {
    console.error("Failed to fetch realtime data from GA4:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Failed to load GA4 realtime data."),
    };
  }
}

// ---------------------------------------------------------------------------
// Conversions tab
// ---------------------------------------------------------------------------

// Custom events sent by the marketing site (see ANALYTICS_TODO.md).
const TRACKED_EVENTS = [
  "project_button_click",
  "form_start",
  "project_form_submit",
  "contact_form_submit",
  "phone_click",
  "email_click",
  "whatsapp_click",
] as const;

export interface ConversionsData {
  trend: { label: string; keyEvents: number }[];
  channels: { channel: string; sessions: number; keyEvents: number }[];
  eventCounts: Record<string, number>;
  /**
   * `form_start` counts split by the `form_type` event param ("modal",
   * "contact_page"). All zeros until the `form_type` custom dimension is
   * registered in GA4 Admin — GA4 can't query an unregistered param, and only
   * collects it from the registration date forward.
   */
  formStarts: { modal: number; contact: number };
  /** `contact_form_error` counts split the same way — the funnels' Failed bars. */
  formErrors: { modal: number; contact: number };
  /** Pageviews of /contact — the contact funnel's top step. */
  contactPageViews: number;
}

export async function fetchConversionsData(
  range?: string,
  campaign?: string,
): Promise<{ success: boolean; data?: ConversionsData; error?: string }> {
  const propertyId = await getConfiguredPropertyId();
  if (!propertyId) return { success: false, error: CONFIG_MISSING_ERROR };

  const hourly = isSingleDayRange(range);
  const trendDimension = hourly ? "dateHour" : "date";
  const dateRanges = [rangeToDates(range)];
  const cFilter = campaignFilter(campaign);

  try {
    const client = getGA4Client();

    const [
      [trendResponse],
      [channelResponse],
      [eventsResponse],
      [contactViewsResponse],
    ] = await Promise.all([
      client.runReport({
        property: `properties/${propertyId}`,
        dateRanges,
        dimensions: [{ name: trendDimension }],
        metrics: [{ name: "keyEvents" }],
        orderBys: [{ dimension: { dimensionName: trendDimension } }],
        dimensionFilter: cFilter,
        limit: 200,
      }),
      client.runReport({
        property: `properties/${propertyId}`,
        dateRanges,
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }, { name: "keyEvents" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        dimensionFilter: cFilter,
      }),
      client.runReport({
        property: `properties/${propertyId}`,
        dateRanges,
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: mergeFilters(
          {
            filter: {
              fieldName: "eventName",
              inListFilter: { values: [...TRACKED_EVENTS] },
            },
          },
          cFilter,
        ),
      }),
      client.runReport({
        property: `properties/${propertyId}`,
        dateRanges,
        metrics: [{ name: "screenPageViews" }],
        dimensionFilter: mergeFilters(
          {
            filter: {
              fieldName: "pagePath",
              stringFilter: { matchType: "EXACT", value: "/contact" },
            },
          },
          cFilter,
        ),
      }),
    ]);

    // Separate call with its own catch: querying an unregistered custom
    // dimension is a 400 from GA4, and that must not take down the section.
    const formStarts = { modal: 0, contact: 0 };
    const formErrors = { modal: 0, contact: 0 };
    try {
      const [formTypeResponse] = await client.runReport({
        property: `properties/${propertyId}`,
        dateRanges,
        dimensions: [{ name: "eventName" }, { name: "customEvent:form_type" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: mergeFilters(
          {
            filter: {
              fieldName: "eventName",
              inListFilter: { values: ["form_start", "contact_form_error"] },
            },
          },
          cFilter,
        ),
      });
      for (const row of formTypeResponse.rows || []) {
        const eventName = row.dimensionValues?.[0]?.value || "";
        const formType = row.dimensionValues?.[1]?.value || "";
        const count = parseInt(row.metricValues?.[0]?.value || "0", 10);
        const target = eventName === "form_start" ? formStarts : formErrors;
        if (formType === "modal") target.modal = count;
        else if (formType === "contact_page") target.contact = count;
      }
    } catch {
      // form_type custom dimension not registered yet — leave zeros.
    }

    const trend = (trendResponse.rows || []).map((row) => ({
      label: formatTrendLabel(row.dimensionValues?.[0]?.value || "", hourly),
      keyEvents: parseInt(row.metricValues?.[0]?.value || "0", 10),
    }));

    const channels = (channelResponse.rows || []).map((row) => ({
      channel: row.dimensionValues?.[0]?.value || "(unknown)",
      sessions: parseInt(row.metricValues?.[0]?.value || "0", 10),
      keyEvents: parseInt(row.metricValues?.[1]?.value || "0", 10),
    }));

    const eventCounts: Record<string, number> = {};
    for (const eventName of TRACKED_EVENTS) eventCounts[eventName] = 0;
    for (const row of eventsResponse.rows || []) {
      const name = row.dimensionValues?.[0]?.value || "";
      eventCounts[name] = parseInt(row.metricValues?.[0]?.value || "0", 10);
    }

    const contactPageViews = parseInt(
      contactViewsResponse.rows?.[0]?.metricValues?.[0]?.value || "0",
      10,
    );

    return {
      success: true,
      data: {
        trend,
        channels,
        eventCounts,
        formStarts,
        formErrors,
        contactPageViews,
      },
    };
  } catch (error: unknown) {
    console.error("Failed to fetch conversions data from GA4:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Failed to load GA4 conversions data."),
    };
  }
}

// ---------------------------------------------------------------------------
// Landing pages (Engagement tab)
// ---------------------------------------------------------------------------

export interface LandingPageItem {
  path: string;
  sessions: number;
  keyEvents: number;
  /** Fraction 0–1 (keyEvents / sessions). */
  conversionRate: number;
}

export async function fetchLandingPages(
  range?: string,
  campaign?: string,
): Promise<{ success: boolean; data: LandingPageItem[]; error?: string }> {
  const propertyId = await getConfiguredPropertyId();
  if (!propertyId)
    return { success: false, data: [], error: CONFIG_MISSING_ERROR };

  try {
    const client = getGA4Client();
    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [rangeToDates(range)],
      dimensions: [{ name: "landingPage" }],
      metrics: [{ name: "sessions" }, { name: "keyEvents" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      dimensionFilter: campaignFilter(campaign),
    });

    // GA4 can return an empty-string landing page (sessions with no recorded
    // landing page); drop it along with "(not set)" so paths stay unique.
    const data: LandingPageItem[] = (response.rows || [])
      .filter((row) => {
        const path = row.dimensionValues?.[0]?.value;
        return path !== "(not set)" && path !== "" && path != null;
      })
      .map((row) => {
        const sessions = parseInt(row.metricValues?.[0]?.value || "0", 10);
        const keyEvents = parseInt(row.metricValues?.[1]?.value || "0", 10);
        return {
          path: row.dimensionValues?.[0]?.value as string,
          sessions,
          keyEvents,
          conversionRate: sessions > 0 ? keyEvents / sessions : 0,
        };
      });

    return { success: true, data };
  } catch (error: unknown) {
    console.error("Failed to fetch landing pages from GA4:", error);
    return {
      success: false,
      data: [],
      error: getErrorMessage(error, "Failed to load GA4 landing pages."),
    };
  }
}

// ---------------------------------------------------------------------------
// Audience tab
// ---------------------------------------------------------------------------

export interface AudienceData {
  cities: { city: string; countryId: string; users: number }[];
  countries: { country: string; countryId: string; users: number }[];
  devices: { device: string; users: number }[];
  newVsReturning: { type: string; users: number }[];
}

export async function fetchAudienceData(
  range?: string,
  campaign?: string,
): Promise<{ success: boolean; data?: AudienceData; error?: string }> {
  const propertyId = await getConfiguredPropertyId();
  if (!propertyId) return { success: false, error: CONFIG_MISSING_ERROR };

  const dateRanges = [rangeToDates(range)];
  const dimensionFilter = campaignFilter(campaign);

  try {
    const client = getGA4Client();

    const [
      [cityResponse],
      [cityFlagResponse],
      [countryResponse],
      [deviceResponse],
      [newReturningResponse],
    ] = await Promise.all([
      // Counts come from the single-dimension city report so they match GA4 exactly.
      client.runReport({
        property: `properties/${propertyId}`,
        dateRanges,
        dimensions: [{ name: "city" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        dimensionFilter,
        limit: 250,
      }),
      // Secondary lookup only: maps each city to its dominant country for the flag.
      client.runReport({
        property: `properties/${propertyId}`,
        dateRanges,
        dimensions: [{ name: "city" }, { name: "countryId" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        dimensionFilter,
        limit: 250,
      }),
      client.runReport({
        property: `properties/${propertyId}`,
        dateRanges,
        dimensions: [{ name: "countryId" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        dimensionFilter,
        limit: 250,
      }),
      client.runReport({
        property: `properties/${propertyId}`,
        dateRanges,
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        dimensionFilter,
      }),
      client.runReport({
        property: `properties/${propertyId}`,
        dateRanges,
        dimensions: [{ name: "newVsReturning" }],
        metrics: [{ name: "activeUsers" }],
        dimensionFilter,
      }),
    ]);

    // City -> dominant country code (rows are sorted desc, so the first hit per city
    // is its highest-traffic country). Used only to attach the flag.
    const cityFlag = new Map<string, string>();
    for (const row of cityFlagResponse.rows || []) {
      const city = row.dimensionValues?.[0]?.value;
      const code = row.dimensionValues?.[1]?.value;
      if (!city || isUnknownGeo(city) || isUnknownGeo(code)) continue;
      if (!cityFlag.has(city)) cityFlag.set(city, code as string);
    }

    const cityRows = cityResponse.rows || [];
    const knownCities = cityRows
      .filter((row) => !isUnknownGeo(row.dimensionValues?.[0]?.value))
      .map((row) => {
        const name = row.dimensionValues?.[0]?.value as string;
        return {
          city: name,
          countryId: cityFlag.get(name) || "",
          users: parseInt(row.metricValues?.[0]?.value || "0", 10),
        };
      });
    // Single-dimension blanks are GA4's one "(not set)" bucket — sum into a flag-less Unknown.
    const unknownCityUsers = cityRows
      .filter((row) => isUnknownGeo(row.dimensionValues?.[0]?.value))
      .reduce(
        (sum, row) => sum + parseInt(row.metricValues?.[0]?.value || "0", 10),
        0,
      );
    const cities = [
      ...knownCities,
      ...(unknownCityUsers > 0
        ? [{ city: "Unknown", countryId: "", users: unknownCityUsers }]
        : []),
    ].sort((a, b) => b.users - a.users);

    const countryRows = countryResponse.rows || [];
    const knownCountries = countryRows
      .filter((row) => !isUnknownGeo(row.dimensionValues?.[0]?.value))
      .map((row) => {
        const code = row.dimensionValues?.[0]?.value as string;
        return {
          country: countryNameFromCode(code),
          countryId: code,
          users: parseInt(row.metricValues?.[0]?.value || "0", 10),
        };
      });
    const unknownCountryUsers = countryRows
      .filter((row) => isUnknownGeo(row.dimensionValues?.[0]?.value))
      .reduce(
        (sum, row) => sum + parseInt(row.metricValues?.[0]?.value || "0", 10),
        0,
      );
    const countries = [
      ...knownCountries,
      ...(unknownCountryUsers > 0
        ? [{ country: "Unknown", countryId: "", users: unknownCountryUsers }]
        : []),
    ].sort((a, b) => b.users - a.users);

    const devices = (deviceResponse.rows || []).map((row) => ({
      device: row.dimensionValues?.[0]?.value || "unknown",
      users: parseInt(row.metricValues?.[0]?.value || "0", 10),
    }));

    const newVsReturning = (newReturningResponse.rows || [])
      .filter((row) => row.dimensionValues?.[0]?.value !== "(not set)")
      .map((row) => ({
        type: row.dimensionValues?.[0]?.value || "unknown",
        users: parseInt(row.metricValues?.[0]?.value || "0", 10),
      }));

    return {
      success: true,
      data: { cities, countries, devices, newVsReturning },
    };
  } catch (error: unknown) {
    console.error("Failed to fetch audience data from GA4:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Failed to load GA4 audience data."),
    };
  }
}

// ---------------------------------------------------------------------------
// Acquisition tab
// ---------------------------------------------------------------------------

export interface ChannelRow {
  channel: string;
  sessions: number;
  users: number;
  /** Fraction 0–1. */
  engagementRate: number;
  keyEvents: number;
}

export interface SourceMediumRow {
  source: string;
  medium: string;
  sessions: number;
  keyEvents: number;
}

export interface AcquisitionData {
  channels: ChannelRow[];
  sourceMedium: SourceMediumRow[];
}

export async function fetchAcquisitionData(
  range?: string,
  campaign?: string,
): Promise<{ success: boolean; data?: AcquisitionData; error?: string }> {
  const propertyId = await getConfiguredPropertyId();
  if (!propertyId) return { success: false, error: CONFIG_MISSING_ERROR };

  const dateRanges = [rangeToDates(range)];
  const dimensionFilter = campaignFilter(campaign);

  try {
    const client = getGA4Client();

    const [[channelResponse], [sourceMediumResponse]] = await Promise.all([
      client.runReport({
        property: `properties/${propertyId}`,
        dateRanges,
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [
          { name: "sessions" },
          { name: "activeUsers" },
          { name: "engagementRate" },
          { name: "keyEvents" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        dimensionFilter,
      }),
      client.runReport({
        property: `properties/${propertyId}`,
        dateRanges,
        dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
        metrics: [{ name: "sessions" }, { name: "keyEvents" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        dimensionFilter,
      }),
    ]);

    const channels = (channelResponse.rows || []).map((row) => ({
      channel: row.dimensionValues?.[0]?.value || "(unknown)",
      sessions: parseInt(row.metricValues?.[0]?.value || "0", 10),
      users: parseInt(row.metricValues?.[1]?.value || "0", 10),
      engagementRate: parseFloat(row.metricValues?.[2]?.value || "0"),
      keyEvents: parseInt(row.metricValues?.[3]?.value || "0", 10),
    }));

    const sourceMedium = (sourceMediumResponse.rows || []).map((row) => ({
      source: row.dimensionValues?.[0]?.value || "(unknown)",
      medium: row.dimensionValues?.[1]?.value || "(unknown)",
      sessions: parseInt(row.metricValues?.[0]?.value || "0", 10),
      keyEvents: parseInt(row.metricValues?.[1]?.value || "0", 10),
    }));

    return { success: true, data: { channels, sourceMedium } };
  } catch (error: unknown) {
    console.error("Failed to fetch acquisition data from GA4:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Failed to load GA4 acquisition data."),
    };
  }
}

export interface WebsiteVisitsResult {
  success: boolean;
  data?: { visits: number; comparison: KpiMetric };
  error?: string;
}

/**
 * GA4 sessions ("visits") for the last 30 days vs the previous 30, for the
 * home metric card. Fixed 30-day windows to mirror the Instagram followers
 * card, independent of the analytics page's `?range=` presets.
 */
export async function fetchWebsiteVisits(): Promise<WebsiteVisitsResult> {
  const propertyId = await getConfiguredPropertyId();
  if (!propertyId) {
    return { success: false, error: CONFIG_MISSING_ERROR };
  }

  try {
    const client = getGA4Client();
    const today = new Date();
    const day = (offset: number) => {
      const d = new Date(today);
      d.setDate(today.getDate() + offset);
      return d.toISOString().split("T")[0];
    };

    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [
        { startDate: day(-29), endDate: day(0), name: "current" },
        { startDate: day(-59), endDate: day(-30), name: "previous" },
      ],
      metrics: [{ name: "sessions" }],
    });

    let current = 0;
    let previous = 0;
    for (const row of response.rows ?? []) {
      const rangeName = row.dimensionValues?.[0]?.value;
      const value = parseInt(row.metricValues?.[0]?.value || "0", 10);
      if (rangeName === "current" || rangeName === "date_range_0") {
        current = value;
      } else if (rangeName === "previous" || rangeName === "date_range_1") {
        previous = value;
      }
    }

    const pct = previous === 0 ? 0 : ((current - previous) / previous) * 100;
    const comparison: KpiMetric = {
      value: current,
      previousValue: previous,
      change: `${Math.abs(pct).toFixed(1)}%`,
      isPositive: pct >= 0,
    };

    return { success: true, data: { visits: current, comparison } };
  } catch (error: unknown) {
    console.error("Failed to fetch website visits from GA4:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Failed to load GA4 website visits."),
    };
  }
}
