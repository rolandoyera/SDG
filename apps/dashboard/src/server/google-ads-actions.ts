"use server";

import type { KpiCardData } from "./analytics-actions";
import {
  hasGoogleAdsCredentials,
  mutateGoogleAds,
  searchGoogleAds,
} from "./google-ads";
import { getActiveOrgConfig } from "./org-config";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const CONFIG_MISSING_ERROR =
  "Google Ads is not configured for this organization yet.";

// GAQL dates resolve against explicit calendar days, so named ranges
// ("today", "last-7-days") must be turned into dates in the ads account's
// timezone. All current tenants' accounts run on Eastern time; make this
// per-org config if that ever stops being true.
const ACCOUNT_TIME_ZONE = "America/New_York";

// Custom "?range=" encoding from the date-range picker: "YYYY-MM-DD_YYYY-MM-DD".
const CUSTOM_RANGE_PATTERN = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/;

const DAY_MS = 24 * 60 * 60 * 1000;
const parseDay = (value: string) => new Date(`${value}T00:00:00Z`);
const formatDay = (date: Date) => date.toISOString().split("T")[0];

function todayInAccountTz(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ACCOUNT_TIME_ZONE,
  }).format(new Date());
}

function addDays(day: string, n: number): string {
  return formatDay(new Date(parseDay(day).getTime() + n * DAY_MS));
}

interface DateWindow {
  start: string;
  end: string;
}

function rangeToDates(range?: string): DateWindow {
  const custom = range ? CUSTOM_RANGE_PATTERN.exec(range) : null;
  if (custom) return { start: custom[1], end: custom[2] };

  const today = todayInAccountTz();
  if (range === "today") return { start: today, end: today };
  if (range === "yesterday") {
    const yesterday = addDays(today, -1);
    return { start: yesterday, end: yesterday };
  }
  if (range === "last-7-days") return { start: addDays(today, -6), end: today };
  if (range === "last-3-months")
    return { start: addDays(today, -89), end: today };
  if (range === "last-4-weeks")
    return { start: addDays(today, -27), end: today };
  if (range === "year-to-date")
    return { start: `${today.slice(0, 4)}-01-01`, end: today };
  return { start: `${today.slice(0, 7)}-01`, end: today }; // this-month default
}

function isSingleDayRange(range?: string): boolean {
  const custom = range ? CUSTOM_RANGE_PATTERN.exec(range) : null;
  if (custom) return custom[1] === custom[2];
  return range === "today" || range === "yesterday";
}

/** Comparison window of equal length immediately before (YTD: last year). */
function getComparisonWindow(
  current: DateWindow,
  range?: string,
): { previous: DateWindow; comparisonLabel: string } {
  if (range === "year-to-date") {
    const year = Number(current.start.slice(0, 4));
    return {
      previous: {
        start: `${year - 1}-01-01`,
        end: current.end.replace(`${year}`, `${year - 1}`),
      },
      comparisonLabel: "same period last year",
    };
  }

  const days =
    Math.round(
      (parseDay(current.end).getTime() - parseDay(current.start).getTime()) /
        DAY_MS,
    ) + 1;
  const previous = {
    start: addDays(current.start, -days),
    end: addDays(current.start, -1),
  };
  if (range === "today") return { previous, comparisonLabel: "yesterday" };
  if (days === 1) return { previous, comparisonLabel: "previous day" };
  if (range === "last-7-days")
    return { previous, comparisonLabel: "previous 7 days" };
  if (range === "last-3-months")
    return { previous, comparisonLabel: "previous 3 months" };
  if (range === "last-4-weeks")
    return { previous, comparisonLabel: "previous 4 weeks" };
  return { previous, comparisonLabel: `previous ${days} days` };
}

/**
 * Resolves the Google Ads customer for the current request's tenant.
 *
 * Only the verified caller's org `config.googleAdsCustomerId` counts — no env
 * fallback, so an unauthenticated request (Server Actions are publicly
 * reachable endpoints) can never read or mutate any account, and one tenant
 * can never see another's data.
 */
async function getConfiguredCustomerId(): Promise<string | null> {
  if (!hasGoogleAdsCredentials()) return null;

  const orgConfig = await getActiveOrgConfig();
  if (!orgConfig) return null;

  const id = orgConfig.googleAdsCustomerId?.replace(/\D/g, "");
  return id?.length ? id : null;
}

// REST int64s arrive as strings; doubles as numbers.
const toInt = (value?: string) => {
  const parsed = Number.parseInt(value ?? "0", 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const microsToDollars = (value?: string) => toInt(value) / 1_000_000;

export interface GoogleAdsConnectionResult {
  success: boolean;
  accountName?: string;
  error?: string;
  configMissing: boolean;
}

export async function testGoogleAdsConnection(): Promise<GoogleAdsConnectionResult> {
  const customerId = await getConfiguredCustomerId();
  if (!customerId) {
    return { success: false, configMissing: true, error: CONFIG_MISSING_ERROR };
  }

  try {
    const rows = await searchGoogleAds(
      customerId,
      "SELECT customer.descriptive_name FROM customer",
    );
    return {
      success: true,
      accountName: rows[0]?.customer?.descriptiveName,
      configMissing: false,
    };
  } catch (error: unknown) {
    console.error("Google Ads connection test failed:", error);
    return {
      success: false,
      configMissing: false,
      error: getErrorMessage(
        error,
        "An unexpected error occurred while communicating with the Google Ads API.",
      ),
    };
  }
}

// ---------------------------------------------------------------------------
// KPI strip (Overview)
// ---------------------------------------------------------------------------

export interface AdsKpis {
  spend: KpiCardData;
  clicks: KpiCardData;
  ctr: KpiCardData;
  avgCpc: KpiCardData;
  conversions: KpiCardData;
}

export interface FetchAdsKpisResult {
  success: boolean;
  data?: AdsKpis;
  error?: string;
  comparisonLabel: string;
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function buildKpi(
  current: number,
  previous: number,
  format: (value: number) => string,
): KpiCardData {
  const base: Pick<KpiCardData, "value" | "previousValue"> = {
    value: format(current),
    previousValue: format(previous),
  };
  if (previous === 0) {
    return { ...base, change: current === 0 ? "0.0%" : "New", isPositive: true };
  }

  const pct = ((current - previous) / previous) * 100;
  return {
    ...base,
    change: `${Math.abs(pct).toFixed(1)}%`,
    isPositive: pct >= 0,
  };
}

export async function fetchAdsKpis(
  range?: string,
): Promise<FetchAdsKpisResult> {
  const current = rangeToDates(range);
  const { previous, comparisonLabel } = getComparisonWindow(current, range);

  const customerId = await getConfiguredCustomerId();
  if (!customerId) {
    return { success: false, error: CONFIG_MISSING_ERROR, comparisonLabel };
  }

  try {
    // One daily-segmented query spanning both windows, split in JS (the
    // windows can be disjoint for year-to-date, so rows are matched per day).
    const rows = await searchGoogleAds(
      customerId,
      `SELECT segments.date, metrics.cost_micros, metrics.clicks,
              metrics.impressions, metrics.conversions
       FROM customer
       WHERE segments.date BETWEEN '${previous.start}' AND '${current.end}'`,
    );

    const totals = { cost: 0, clicks: 0, impressions: 0, conversions: 0 };
    const prevTotals = { ...totals };
    for (const row of rows) {
      const date = row.segments?.date ?? "";
      const inCurrent = date >= current.start && date <= current.end;
      const inPrevious = date >= previous.start && date <= previous.end;
      if (!inCurrent && !inPrevious) continue;
      const target = inCurrent ? totals : prevTotals;
      target.cost += microsToDollars(row.metrics?.costMicros);
      target.clicks += toInt(row.metrics?.clicks);
      target.impressions += toInt(row.metrics?.impressions);
      target.conversions += row.metrics?.conversions ?? 0;
    }

    const ctr = (t: typeof totals) =>
      t.impressions > 0 ? t.clicks / t.impressions : 0;
    const cpc = (t: typeof totals) => (t.clicks > 0 ? t.cost / t.clicks : 0);
    const count = (value: number) => value.toLocaleString("en-US");
    const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
    const money = (value: number) => usd.format(value);

    return {
      success: true,
      data: {
        spend: buildKpi(totals.cost, prevTotals.cost, money),
        clicks: buildKpi(totals.clicks, prevTotals.clicks, count),
        ctr: buildKpi(ctr(totals), ctr(prevTotals), percent),
        avgCpc: buildKpi(cpc(totals), cpc(prevTotals), money),
        conversions: buildKpi(
          totals.conversions,
          prevTotals.conversions,
          count,
        ),
      },
      comparisonLabel,
    };
  } catch (error: unknown) {
    console.error("Failed to fetch Google Ads KPIs:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Failed to load Google Ads KPIs."),
      comparisonLabel,
    };
  }
}

// ---------------------------------------------------------------------------
// Spend & clicks trend (Overview)
// ---------------------------------------------------------------------------

export interface AdsTrendPoint {
  label: string;
  /** Dollars. */
  cost: number;
  clicks: number;
}

export async function fetchAdsTrend(
  range?: string,
): Promise<{ success: boolean; data: AdsTrendPoint[]; error?: string }> {
  const customerId = await getConfiguredCustomerId();
  if (!customerId)
    return { success: false, data: [], error: CONFIG_MISSING_ERROR };

  const { start, end } = rangeToDates(range);
  const hourly = isSingleDayRange(range);
  const dimension = hourly ? "segments.hour" : "segments.date";

  try {
    const rows = await searchGoogleAds(
      customerId,
      `SELECT ${dimension}, metrics.cost_micros, metrics.clicks
       FROM customer
       WHERE segments.date BETWEEN '${start}' AND '${end}'
       ORDER BY ${dimension}`,
    );

    // The API omits empty buckets; fill them so the chart has a full axis.
    const byKey = new Map<string, { cost: number; clicks: number }>();
    for (const row of rows) {
      const key = hourly
        ? String(row.segments?.hour ?? 0)
        : (row.segments?.date ?? "");
      byKey.set(key, {
        cost: microsToDollars(row.metrics?.costMicros),
        clicks: toInt(row.metrics?.clicks),
      });
    }

    const data: AdsTrendPoint[] = [];
    if (hourly) {
      for (let hour = 0; hour < 24; hour++) {
        const point = byKey.get(String(hour));
        data.push({
          label: `${String(hour).padStart(2, "0")}:00`,
          cost: Math.round((point?.cost ?? 0) * 100) / 100,
          clicks: point?.clicks ?? 0,
        });
      }
    } else {
      for (let day = start; day <= end; day = addDays(day, 1)) {
        const point = byKey.get(day);
        data.push({
          label: `${day.slice(5, 7)}/${day.slice(8, 10)}`,
          cost: Math.round((point?.cost ?? 0) * 100) / 100,
          clicks: point?.clicks ?? 0,
        });
      }
    }

    return { success: true, data };
  } catch (error: unknown) {
    console.error("Failed to fetch Google Ads trend:", error);
    return {
      success: false,
      data: [],
      error: getErrorMessage(error, "Failed to load Google Ads trend."),
    };
  }
}

// ---------------------------------------------------------------------------
// Device split (Overview)
// ---------------------------------------------------------------------------

const DEVICE_LABELS: Record<string, string> = {
  DESKTOP: "Desktop",
  MOBILE: "Mobile",
  TABLET: "Tablet",
  CONNECTED_TV: "TV",
  OTHER: "Other",
};

export interface AdsDeviceRow {
  device: string;
  clicks: number;
  impressions: number;
  /** Dollars. */
  cost: number;
  conversions: number;
}

export async function fetchAdsDevices(
  range?: string,
): Promise<{ success: boolean; data: AdsDeviceRow[]; error?: string }> {
  const customerId = await getConfiguredCustomerId();
  if (!customerId)
    return { success: false, data: [], error: CONFIG_MISSING_ERROR };

  const { start, end } = rangeToDates(range);

  try {
    const rows = await searchGoogleAds(
      customerId,
      `SELECT segments.device, metrics.clicks, metrics.impressions,
              metrics.cost_micros, metrics.conversions
       FROM customer
       WHERE segments.date BETWEEN '${start}' AND '${end}'`,
    );

    const data: AdsDeviceRow[] = rows
      .map((row) => ({
        device:
          DEVICE_LABELS[row.segments?.device ?? ""] ??
          (row.segments?.device || "Unknown"),
        clicks: toInt(row.metrics?.clicks),
        impressions: toInt(row.metrics?.impressions),
        cost: microsToDollars(row.metrics?.costMicros),
        conversions: row.metrics?.conversions ?? 0,
      }))
      .sort((a, b) => b.cost - a.cost);

    return { success: true, data };
  } catch (error: unknown) {
    console.error("Failed to fetch Google Ads device split:", error);
    return {
      success: false,
      data: [],
      error: getErrorMessage(error, "Failed to load Google Ads device split."),
    };
  }
}

// ---------------------------------------------------------------------------
// Campaigns tab
// ---------------------------------------------------------------------------

// Raw numbers so client-side sorting works; cells format for display.
export interface AdsCampaignRow {
  id: string;
  name: string;
  status: string;
  channel: string;
  /** Dollars per day. */
  dailyBudget: number;
  impressions: number;
  clicks: number;
  /** Fraction 0–1. */
  ctr: number;
  /** Dollars. */
  avgCpc: number;
  /** Dollars. */
  cost: number;
  conversions: number;
  /** Fraction 0–1; null when Google withholds it (low volume). */
  searchImpressionShare: number | null;
  /** Fraction 0–1 lost to budget / to rank. */
  lostToBudget: number;
  lostToRank: number;
}

export async function fetchAdsCampaigns(
  range?: string,
): Promise<{ success: boolean; data: AdsCampaignRow[]; error?: string }> {
  const customerId = await getConfiguredCustomerId();
  if (!customerId)
    return { success: false, data: [], error: CONFIG_MISSING_ERROR };

  const { start, end } = rangeToDates(range);

  try {
    const rows = await searchGoogleAds(
      customerId,
      `SELECT campaign.id, campaign.name, campaign.status,
              campaign.advertising_channel_type, campaign_budget.amount_micros,
              metrics.impressions, metrics.clicks, metrics.ctr,
              metrics.average_cpc, metrics.cost_micros, metrics.conversions,
              metrics.search_impression_share,
              metrics.search_budget_lost_impression_share,
              metrics.search_rank_lost_impression_share
       FROM campaign
       WHERE segments.date BETWEEN '${start}' AND '${end}'
         AND campaign.status != 'REMOVED'
       ORDER BY metrics.cost_micros DESC`,
    );

    const data: AdsCampaignRow[] = rows.map((row) => ({
      id: row.campaign?.id ?? "",
      name: row.campaign?.name ?? "(unknown)",
      status: row.campaign?.status ?? "UNKNOWN",
      channel: row.campaign?.advertisingChannelType ?? "UNKNOWN",
      dailyBudget: microsToDollars(row.campaignBudget?.amountMicros),
      impressions: toInt(row.metrics?.impressions),
      clicks: toInt(row.metrics?.clicks),
      ctr: row.metrics?.ctr ?? 0,
      avgCpc: (row.metrics?.averageCpc ?? 0) / 1_000_000,
      cost: microsToDollars(row.metrics?.costMicros),
      conversions: row.metrics?.conversions ?? 0,
      searchImpressionShare: row.metrics?.searchImpressionShare ?? null,
      lostToBudget: row.metrics?.searchBudgetLostImpressionShare ?? 0,
      lostToRank: row.metrics?.searchRankLostImpressionShare ?? 0,
    }));

    return { success: true, data };
  } catch (error: unknown) {
    console.error("Failed to fetch Google Ads campaigns:", error);
    return {
      success: false,
      data: [],
      error: getErrorMessage(error, "Failed to load Google Ads campaigns."),
    };
  }
}

// ---------------------------------------------------------------------------
// Search terms tab
// ---------------------------------------------------------------------------

export interface AdsSearchTermRow {
  term: string;
  /** ADDED | EXCLUDED | ADDED_EXCLUDED | NONE | UNKNOWN */
  status: string;
  /** The keyword that matched the query. */
  keyword: string;
  /** The campaign the term served under — needed by the exclude action. */
  campaignId: string;
  impressions: number;
  clicks: number;
  /** Dollars. */
  cost: number;
  conversions: number;
}

export async function fetchAdsSearchTerms(
  range?: string,
): Promise<{ success: boolean; data: AdsSearchTermRow[]; error?: string }> {
  const customerId = await getConfiguredCustomerId();
  if (!customerId)
    return { success: false, data: [], error: CONFIG_MISSING_ERROR };

  const { start, end } = rangeToDates(range);

  try {
    const rows = await searchGoogleAds(
      customerId,
      `SELECT search_term_view.search_term, search_term_view.status,
              segments.keyword.info.text, campaign.id, metrics.impressions,
              metrics.clicks, metrics.cost_micros, metrics.conversions
       FROM search_term_view
       WHERE segments.date BETWEEN '${start}' AND '${end}'
       ORDER BY metrics.cost_micros DESC
       LIMIT 200`,
    );

    const data: AdsSearchTermRow[] = rows.map((row) => ({
      term: row.searchTermView?.searchTerm ?? "(unknown)",
      status: row.searchTermView?.status ?? "UNKNOWN",
      keyword: row.segments?.keyword?.info?.text ?? "",
      campaignId: row.campaign?.id ?? "",
      impressions: toInt(row.metrics?.impressions),
      clicks: toInt(row.metrics?.clicks),
      cost: microsToDollars(row.metrics?.costMicros),
      conversions: row.metrics?.conversions ?? 0,
    }));

    return { success: true, data };
  } catch (error: unknown) {
    console.error("Failed to fetch Google Ads search terms:", error);
    return {
      success: false,
      data: [],
      error: getErrorMessage(error, "Failed to load Google Ads search terms."),
    };
  }
}

export interface ExcludeSearchTermResult {
  success: boolean;
  /** Where the negative landed: a shared list name, or "the campaign". */
  target?: string;
  error?: string;
}

/**
 * Adds a search term as an EXACT-match negative keyword. Prefers the
 * negative-keyword shared list linked to the term's campaign (this account's
 * convention — negatives live in one shared list); falls back to a
 * campaign-level negative when no list is linked.
 */
export async function excludeSearchTerm(input: {
  term: string;
  campaignId: string;
}): Promise<ExcludeSearchTermResult> {
  const term = input.term?.trim();
  const campaignId = input.campaignId?.replace(/\D/g, "");
  if (!term || !campaignId) {
    return { success: false, error: "Missing search term or campaign." };
  }

  const customerId = await getConfiguredCustomerId();
  if (!customerId) return { success: false, error: CONFIG_MISSING_ERROR };

  try {
    const keyword = { text: term, matchType: "EXACT" };

    const sharedSets = await searchGoogleAds(
      customerId,
      `SELECT shared_set.resource_name, shared_set.name
       FROM campaign_shared_set
       WHERE campaign.id = ${campaignId}
         AND shared_set.type = 'NEGATIVE_KEYWORDS'
         AND campaign_shared_set.status = 'ENABLED'
       LIMIT 1`,
    );

    const sharedSet = sharedSets[0]?.sharedSet;
    if (sharedSet?.resourceName) {
      await mutateGoogleAds(customerId, "sharedCriteria", [
        { create: { sharedSet: sharedSet.resourceName, keyword } },
      ]);
      return {
        success: true,
        target: sharedSet.name ? `"${sharedSet.name}"` : "the shared list",
      };
    }

    await mutateGoogleAds(customerId, "campaignCriteria", [
      {
        create: {
          campaign: `customers/${customerId}/campaigns/${campaignId}`,
          negative: true,
          keyword,
        },
      },
    ]);
    return { success: true, target: "the campaign" };
  } catch (error: unknown) {
    console.error("Failed to exclude search term:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Failed to exclude the search term."),
    };
  }
}

// ---------------------------------------------------------------------------
// Locations tab
// ---------------------------------------------------------------------------

export interface AdsLocationRow {
  city: string;
  /** "Florida, United States" — from the geo target's canonical name. */
  region: string;
  /** False = the user was outside the campaign's targeted locations. */
  inTargetedArea: boolean;
  impressions: number;
  clicks: number;
  /** Fraction 0–1. */
  ctr: number;
  /** Dollars. */
  cost: number;
  conversions: number;
}

/**
 * Where people who saw the ads physically were (user_location_view), by city.
 * Cities arrive as geo_target_constant resource names, so a second query
 * resolves them to display names.
 */
export async function fetchAdsLocations(
  range?: string,
): Promise<{ success: boolean; data: AdsLocationRow[]; error?: string }> {
  const customerId = await getConfiguredCustomerId();
  if (!customerId)
    return { success: false, data: [], error: CONFIG_MISSING_ERROR };

  const { start, end } = rangeToDates(range);

  try {
    const rows = await searchGoogleAds(
      customerId,
      `SELECT user_location_view.targeting_location, segments.geo_target_city,
              metrics.impressions, metrics.clicks, metrics.cost_micros,
              metrics.conversions
       FROM user_location_view
       WHERE segments.date BETWEEN '${start}' AND '${end}'
       ORDER BY metrics.impressions DESC
       LIMIT 200`,
    );

    // Rows repeat per (country, targeted) split — aggregate per city + flag.
    interface Bucket {
      cityId: string;
      inTargetedArea: boolean;
      impressions: number;
      clicks: number;
      cost: number;
      conversions: number;
    }
    const buckets = new Map<string, Bucket>();
    for (const row of rows) {
      const cityId =
        row.segments?.geoTargetCity?.replace("geoTargetConstants/", "") ?? "";
      const inTargetedArea = row.userLocationView?.targetingLocation ?? false;
      const key = `${cityId}~${inTargetedArea}`;
      const bucket = buckets.get(key) ?? {
        cityId,
        inTargetedArea,
        impressions: 0,
        clicks: 0,
        cost: 0,
        conversions: 0,
      };
      bucket.impressions += toInt(row.metrics?.impressions);
      bucket.clicks += toInt(row.metrics?.clicks);
      bucket.cost += microsToDollars(row.metrics?.costMicros);
      bucket.conversions += row.metrics?.conversions ?? 0;
      buckets.set(key, bucket);
    }

    // Resolve city ids to names in one lookup.
    const cityIds = [
      ...new Set([...buckets.values()].map((b) => b.cityId).filter(Boolean)),
    ];
    const names = new Map<string, { city: string; region: string }>();
    if (cityIds.length > 0) {
      const nameRows = await searchGoogleAds(
        customerId,
        `SELECT geo_target_constant.id, geo_target_constant.name,
                geo_target_constant.canonical_name
         FROM geo_target_constant
         WHERE geo_target_constant.id IN (${cityIds.join(", ")})`,
      );
      for (const row of nameRows) {
        const geo = row.geoTargetConstant;
        if (!geo?.id) continue;
        names.set(geo.id, {
          city: geo.name ?? "(unknown)",
          region: geo.canonicalName?.split(",").slice(1).join(", ") ?? "",
        });
      }
    }

    const data: AdsLocationRow[] = [...buckets.values()]
      .map((bucket) => ({
        city: names.get(bucket.cityId)?.city ?? "Unknown",
        region: names.get(bucket.cityId)?.region ?? "",
        inTargetedArea: bucket.inTargetedArea,
        impressions: bucket.impressions,
        clicks: bucket.clicks,
        ctr: bucket.impressions > 0 ? bucket.clicks / bucket.impressions : 0,
        cost: bucket.cost,
        conversions: bucket.conversions,
      }))
      .sort((a, b) => b.cost - a.cost || b.impressions - a.impressions);

    return { success: true, data };
  } catch (error: unknown) {
    console.error("Failed to fetch Google Ads locations:", error);
    return {
      success: false,
      data: [],
      error: getErrorMessage(error, "Failed to load Google Ads locations."),
    };
  }
}

// ---------------------------------------------------------------------------
// Keywords tab
// ---------------------------------------------------------------------------

export interface AdsKeywordRow {
  keyword: string;
  /** EXACT | PHRASE | BROAD | UNKNOWN */
  matchType: string;
  adGroup: string;
  /** 1–10, or null while Google hasn't scored the keyword. */
  qualityScore: number | null;
  /** QS components (ABOVE_AVERAGE | AVERAGE | BELOW_AVERAGE), null unscored. */
  expectedCtr: string | null;
  adRelevance: string | null;
  landingPageExperience: string | null;
  impressions: number;
  clicks: number;
  /** Fraction 0–1. */
  ctr: number;
  /** Dollars. */
  cost: number;
  conversions: number;
}

export async function fetchAdsKeywords(
  range?: string,
): Promise<{ success: boolean; data: AdsKeywordRow[]; error?: string }> {
  const customerId = await getConfiguredCustomerId();
  if (!customerId)
    return { success: false, data: [], error: CONFIG_MISSING_ERROR };

  const { start, end } = rangeToDates(range);

  try {
    const rows = await searchGoogleAds(
      customerId,
      `SELECT ad_group.name, ad_group_criterion.keyword.text,
              ad_group_criterion.keyword.match_type,
              ad_group_criterion.quality_info.quality_score,
              ad_group_criterion.quality_info.search_predicted_ctr,
              ad_group_criterion.quality_info.creative_quality_score,
              ad_group_criterion.quality_info.post_click_quality_score,
              metrics.impressions, metrics.clicks, metrics.ctr,
              metrics.cost_micros, metrics.conversions
       FROM keyword_view
       WHERE segments.date BETWEEN '${start}' AND '${end}'
         AND ad_group_criterion.status != 'REMOVED'
         AND ad_group_criterion.negative = FALSE
       ORDER BY metrics.cost_micros DESC
       LIMIT 200`,
    );

    // Unscored keywords come back with the component enums missing or UNKNOWN.
    const component = (value?: string) =>
      value && value !== "UNKNOWN" && value !== "UNSPECIFIED" ? value : null;

    const data: AdsKeywordRow[] = rows.map((row) => {
      const quality = row.adGroupCriterion?.qualityInfo;
      return {
        keyword: row.adGroupCriterion?.keyword?.text ?? "(unknown)",
        matchType: row.adGroupCriterion?.keyword?.matchType ?? "UNKNOWN",
        adGroup: row.adGroup?.name ?? "(unknown)",
        qualityScore: quality?.qualityScore ?? null,
        expectedCtr: component(quality?.searchPredictedCtr),
        adRelevance: component(quality?.creativeQualityScore),
        landingPageExperience: component(quality?.postClickQualityScore),
        impressions: toInt(row.metrics?.impressions),
        clicks: toInt(row.metrics?.clicks),
        ctr: row.metrics?.ctr ?? 0,
        cost: microsToDollars(row.metrics?.costMicros),
        conversions: row.metrics?.conversions ?? 0,
      };
    });

    return { success: true, data };
  } catch (error: unknown) {
    console.error("Failed to fetch Google Ads keywords:", error);
    return {
      success: false,
      data: [],
      error: getErrorMessage(error, "Failed to load Google Ads keywords."),
    };
  }
}
