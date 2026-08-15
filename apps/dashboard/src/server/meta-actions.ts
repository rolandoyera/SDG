"use server";

import { revalidatePath, unstable_cache } from "next/cache";
import { cookies } from "next/headers";

import { FieldValue } from "firebase-admin/firestore";

import { ACTIVE_ORG_COOKIE } from "@/lib/org-cookie";
import type { MetaIntegrationConfig, MetaPendingPage } from "@/types/meta";

import { getAdminDb } from "./firebase-admin";
import { getLatestSnapshot, getSnapshotRange } from "./meta-snapshots";
import {
  type DemographicItem,
  fetchAccountKpis,
  fetchFollowerDemographics,
  fetchInstagramProfile,
  fetchPages,
  fetchReachTrend,
  fetchFollowerCount,
  fetchFollowerGains,
  fetchRecentMedia,
  getStoredMetaCreds,
  type IgMediaItem,
  type StoredMetaCreds,
  storeMetaConnection,
} from "./meta-graph";

const NOT_CONNECTED = "Instagram isn't connected yet.";

const RANGE_DAYS: Record<string, number> = {
  "last-7-days": 7,
  "last-14-days": 14,
  "last-30-days": 30,
  "last-60-days": 60,
  "last-90-days": 90,
};

// Custom "?range=" encoding from the date-range picker: "YYYY-MM-DD_YYYY-MM-DD".
const CUSTOM_RANGE_PATTERN = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/;

const DAY_SECONDS = 24 * 60 * 60;

/** Current window + the equal-length window immediately before it (for "vs previous"). */
function rangeToWindows(range?: string): {
  current: { since: number; until: number };
  previous: { since: number; until: number };
  comparisonLabel: string;
} {
  const custom = range ? CUSTOM_RANGE_PATTERN.exec(range) : null;
  if (custom) {
    const since = Math.floor(Date.parse(`${custom[1]}T00:00:00Z`) / 1000);
    // End date inclusive; clamp to now so a range ending today doesn't send
    // a future timestamp to the Graph API.
    const endExclusive =
      Math.floor(Date.parse(`${custom[2]}T00:00:00Z`) / 1000) + DAY_SECONDS;
    const span = endExclusive - since;
    const days = Math.round(span / DAY_SECONDS);
    return {
      current: {
        since,
        until: Math.min(endExclusive, Math.floor(Date.now() / 1000)),
      },
      previous: { since: since - span, until: since },
      comparisonLabel: days === 1 ? "previous day" : `previous ${days} days`,
    };
  }

  const days = RANGE_DAYS[range ?? ""] ?? 30;
  const span = days * DAY_SECONDS;
  const until = Math.floor(Date.now() / 1000);
  const since = until - span;
  return {
    current: { since, until },
    previous: { since: since - span, until: since },
    comparisonLabel: `previous ${days} days`,
  };
}

export interface KpiMetric {
  value: number;
  previousValue: number;
  /** Absolute percent change, e.g. "12.3%". */
  change: string;
  isPositive: boolean;
}

/** Percent change of `current` vs `previous`, mirroring the GA4 KPI comparison. */
function compareMetric(current: number, previous: number): KpiMetric {
  if (previous === 0) {
    return {
      value: current,
      previousValue: previous,
      change: "0.0%",
      isPositive: true,
    };
  }
  const pct = ((current - previous) / previous) * 100;
  return {
    value: current,
    previousValue: previous,
    change: `${Math.abs(pct).toFixed(1)}%`,
    isPositive: pct >= 0,
  };
}

async function getActiveOrgId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? null;
}

async function getActiveInstagramContext(): Promise<
  | { success: true; organizationId: string; creds: StoredMetaCreds }
  | { success: false; error: string }
> {
  const organizationId = await getActiveOrgId();
  if (!organizationId) return { success: false, error: NOT_CONNECTED };

  const creds = await getStoredMetaCreds(organizationId);
  if (!creds) return { success: false, error: NOT_CONNECTED };

  return { success: true, organizationId, creds };
}

/** Returns the tenant's Meta integration config, or null when not connected. */
export async function getMetaConnection(): Promise<MetaIntegrationConfig | null> {
  const organizationId = await getActiveOrgId();
  if (!organizationId) return null;

  try {
    const snap = await getAdminDb()
      .collection("organizations")
      .doc(organizationId)
      .get();
    const meta = snap.exists
      ? (snap.data()?.config?.metaIntegration as
          | MetaIntegrationConfig
          | undefined)
      : undefined;
    return meta?.connected ? meta : null;
  } catch (error) {
    console.error("Failed to load Meta connection:", error);
    return null;
  }
}

/**
 * Lists the candidate Pages staged for the picker (when the user granted access
 * to more than one). Returns [] when there's no pending selection.
 */
export async function getMetaPendingPages(): Promise<MetaPendingPage[]> {
  const organizationId = await getActiveOrgId();
  if (!organizationId) return [];

  try {
    const pendingSnap = await getAdminDb()
      .collection("organizations")
      .doc(organizationId)
      .collection("secrets")
      .doc("metaPending")
      .get();

    const userAccessToken = pendingSnap.exists
      ? (pendingSnap.data()?.userAccessToken as string | undefined)
      : undefined;
    if (!userAccessToken) return [];

    const pages = await fetchPages(userAccessToken);

    return await Promise.all(
      pages.map(async (page): Promise<MetaPendingPage> => {
        const profile = await fetchInstagramProfile(page);
        return {
          pageId: page.id,
          pageName: page.name,
          instagramUsername: profile?.username ?? null,
          instagramName: profile?.name ?? null,
          followersCount: profile?.followersCount ?? null,
          hasInstagram: profile !== null,
        };
      }),
    );
  } catch (error) {
    console.error("Failed to load pending Meta pages:", error);
    return [];
  }
}

/** Connects the chosen Page from the picker and clears the pending selection. */
export async function selectMetaPage(pageId: string): Promise<{
  success: boolean;
  error?: string;
  connection?: MetaIntegrationConfig;
}> {
  const organizationId = await getActiveOrgId();
  if (!organizationId)
    return { success: false, error: "No active organization." };

  try {
    const orgRef = getAdminDb().collection("organizations").doc(organizationId);
    const pendingSnap = await orgRef
      .collection("secrets")
      .doc("metaPending")
      .get();
    const data = pendingSnap.exists ? pendingSnap.data() : undefined;

    const userAccessToken = data?.userAccessToken as string | undefined;
    if (!userAccessToken) {
      return {
        success: false,
        error: "Connection session expired. Please reconnect.",
      };
    }
    const expiresAt =
      typeof data?.expiresAt === "number" ? data.expiresAt : undefined;

    const pages = await fetchPages(userAccessToken);
    const page = pages.find((p) => p.id === pageId);
    if (!page) {
      return {
        success: false,
        error: "That page is no longer available. Please reconnect.",
      };
    }

    const profile = await fetchInstagramProfile(page);
    if (!profile) {
      return {
        success: false,
        error: "That page has no linked Instagram account.",
      };
    }

    const connection = await storeMetaConnection(
      organizationId,
      page,
      profile,
      expiresAt,
    );
    await orgRef.collection("secrets").doc("metaPending").delete();
    revalidatePath("/dashboard/instagram");
    return { success: true, connection };
  } catch (error) {
    console.error("Failed to select Meta page:", error);
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

export interface InstagramKpiComparison {
  reach: KpiMetric;
  views: KpiMetric;
  likes: KpiMetric;
  comments: KpiMetric;
  profileViews: KpiMetric;
  accountsEngaged: KpiMetric;
  websiteClicks: KpiMetric;
  comparisonLabel: string;
}

export interface InstagramKpiResult {
  success: boolean;
  data?: InstagramKpiComparison;
  /** "live" = fresh from Graph; "fallback" = served from the latest stored snapshot. */
  source?: "live" | "fallback";
  /** Snapshot date (`YYYY-MM-DD`) when `source` is "fallback". */
  asOf?: string;
  error?: string;
}

/** A snapshot value as a comparison metric with no prior period to compare against. */
function flatMetric(value: number): KpiMetric {
  return { value, previousValue: 0, change: "0.0%", isPositive: true };
}

/** Account KPI totals (reach, views, likes, comments, profile visits, accounts engaged) with vs-previous comparison. */
export async function fetchInstagramKpis(
  range?: string,
): Promise<InstagramKpiResult> {
  let organizationId: string | null = null;

  try {
    const context = await getActiveInstagramContext();
    if (!context.success) return { success: false, error: context.error };

    organizationId = context.organizationId;
    const { creds } = context;
    const { current, previous, comparisonLabel } = rangeToWindows(range);
    const [cur, prev] = await Promise.all([
      fetchAccountKpis(creds, current.since, current.until),
      fetchAccountKpis(creds, previous.since, previous.until),
    ]);
    return {
      success: true,
      source: "live",
      data: {
        reach: compareMetric(cur.reach, prev.reach),
        views: compareMetric(cur.views, prev.views),
        likes: compareMetric(cur.likes, prev.likes),
        comments: compareMetric(cur.comments, prev.comments),
        profileViews: compareMetric(cur.profileViews, prev.profileViews),
        accountsEngaged: compareMetric(
          cur.accountsEngaged,
          prev.accountsEngaged,
        ),
        websiteClicks: compareMetric(cur.websiteClicks, prev.websiteClicks),
        comparisonLabel,
      },
    };
  } catch (error) {
    console.error(
      "Failed to fetch Instagram KPIs, trying snapshot fallback:",
      error,
    );
    // Live Graph call failed — serve the last stored snapshot so the strip isn't empty.
    if (organizationId) {
      try {
        const snapshot = await getLatestSnapshot(organizationId);
        if (snapshot) {
          return {
            success: true,
            source: "fallback",
            asOf: snapshot.date,
            data: {
              reach: flatMetric(snapshot.reach),
              views: flatMetric(snapshot.views),
              likes: flatMetric(snapshot.likes),
              comments: flatMetric(snapshot.comments),
              profileViews: flatMetric(snapshot.profileViews),
              accountsEngaged: flatMetric(snapshot.accountsEngaged),
              websiteClicks: flatMetric(snapshot.websiteClicks),
              comparisonLabel: "",
            },
          };
        }
      } catch (snapshotError) {
        console.error("Failed to load Instagram KPI snapshot:", snapshotError);
      }
    }
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load Instagram metrics.",
    };
  }
}

/**
 * Live follower total plus a vs-previous-30-days comparison. `comparison` is null
 * when the account is under 100 followers (Instagram won't expose daily gains there).
 */
export async function fetchInstagramFollowers(): Promise<{
  success: boolean;
  data?: { followers: number; comparison: KpiMetric | null };
  error?: string;
}> {
  try {
    const context = await getActiveInstagramContext();
    if (!context.success) return { success: false, error: context.error };

    const { creds } = context;
    const until = Math.floor(Date.now() / 1000);
    const since = until - 30 * 24 * 60 * 60;
    const [followers, gains] = await Promise.all([
      fetchFollowerCount(creds),
      fetchFollowerGains(creds, since, until),
    ]);
    // followers 30 days ago = current total minus net gains over the window.
    const comparison =
      gains === null ? null : compareMetric(followers, followers - gains);
    return { success: true, data: { followers, comparison } };
  } catch (error) {
    console.error("Failed to fetch Instagram followers:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to load followers.",
    };
  }
}

export interface InstagramHeadline {
  /** Net followers gained over the window; null when IG won't expose it (<100 followers). */
  newFollowers: number | null;
  likes: number;
  comments: number;
  profileViews: number;
}

/** Fixed last-30-days totals for the headline cards (not driven by the range dropdown). */
export async function fetchInstagramHeadline(): Promise<{
  success: boolean;
  data?: InstagramHeadline;
  error?: string;
}> {
  try {
    const context = await getActiveInstagramContext();
    if (!context.success) return { success: false, error: context.error };

    const { creds } = context;
    const until = Math.floor(Date.now() / 1000);
    const since = until - 30 * 24 * 60 * 60;
    const [kpis, gains] = await Promise.all([
      fetchAccountKpis(creds, since, until),
      fetchFollowerGains(creds, since, until),
    ]);
    return {
      success: true,
      data: {
        newFollowers: gains,
        likes: kpis.likes,
        comments: kpis.comments,
        profileViews: kpis.profileViews,
      },
    };
  } catch (error) {
    console.error("Failed to fetch Instagram headline:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load metrics.",
    };
  }
}

export interface ReachTrendPoint {
  /** Current-window date (the x-axis label). */
  label: string;
  /** Aligned previous-window date, shown alongside the previous value in the tooltip. */
  previousLabel: string;
  current: number;
  previous: number;
}

export interface InstagramReachTrend {
  points: ReachTrendPoint[];
  /** Total reach over the current window, compared to the previous window. */
  comparison: KpiMetric;
  comparisonLabel: string;
}

/** Daily reach series for the current range, plus a vs-previous total for the comparison badge. */
export async function fetchInstagramReachTrend(
  range?: string,
): Promise<{ success: boolean; data?: InstagramReachTrend; error?: string }> {
  try {
    const context = await getActiveInstagramContext();
    if (!context.success) return { success: false, error: context.error };

    const { creds } = context;
    const { current, previous, comparisonLabel } = rangeToWindows(range);
    const [curPoints, prevPoints] = await Promise.all([
      fetchReachTrend(creds, current.since, current.until),
      fetchReachTrend(creds, previous.since, previous.until),
    ]);
    const total = curPoints.reduce((sum, p) => sum + p.reach, 0);
    const previousTotal = prevPoints.reduce((sum, p) => sum + p.reach, 0);
    // Both windows are equal length, so align the previous series to the current
    // one by day index — the x-axis shows current-window dates.
    const points: ReachTrendPoint[] = curPoints.map((p, i) => ({
      label: p.label,
      previousLabel: prevPoints[i]?.label ?? "",
      current: p.reach,
      previous: prevPoints[i]?.reach ?? 0,
    }));
    return {
      success: true,
      data: {
        points,
        comparison: compareMetric(total, previousTotal),
        comparisonLabel,
      },
    };
  } catch (error) {
    console.error("Failed to fetch Instagram reach trend:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load reach.",
    };
  }
}

export interface FollowerTrendPoint {
  /** Snapshot date formatted for the x-axis. */
  label: string;
  followers: number;
}

export interface InstagramFollowerTrend {
  points: FollowerTrendPoint[];
  /** Net follower change across the window: last snapshot − first. */
  netChange: number;
}

/**
 * Follower total per day from the stored snapshots — the only long-range
 * follower history (Meta exposes ~30 rolling days and never backfills, but
 * the daily cron has been accumulating levels since 2026-06). No Graph call,
 * so this renders even while the token is broken.
 */
export async function fetchInstagramFollowerTrend(range?: string): Promise<{
  success: boolean;
  data?: InstagramFollowerTrend;
  error?: string;
}> {
  try {
    const organizationId = await getActiveOrgId();
    if (!organizationId) return { success: false, error: NOT_CONNECTED };

    const { current } = rangeToWindows(range);
    const sinceDate = new Date(current.since * 1000).toISOString().slice(0, 10);
    // `until` is exclusive — step inside it for the inclusive end date key.
    const untilDate = new Date((current.until - 1) * 1000)
      .toISOString()
      .slice(0, 10);
    const snapshots = await getSnapshotRange(
      organizationId,
      sinceDate,
      untilDate,
    );

    const points: FollowerTrendPoint[] = snapshots.map((s) => ({
      label: new Date(`${s.date}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
      followers: s.followersCount,
    }));
    const netChange =
      snapshots.length >= 2
        ? snapshots[snapshots.length - 1].followersCount -
          snapshots[0].followersCount
        : 0;
    return { success: true, data: { points, netChange } };
  } catch (error) {
    console.error("Failed to fetch Instagram follower trend:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to load followers.",
    };
  }
}

/** Recent posts with engagement counts. */
export async function fetchInstagramMedia(limit = 10): Promise<{
  success: boolean;
  data: IgMediaItem[];
  error?: string;
}> {
  try {
    const context = await getActiveInstagramContext();
    if (!context.success)
      return { success: false, data: [], error: context.error };

    const { creds, organizationId } = context;
    // The Graph API returns signed CDN URLs that rotate on every call, so re-fetching
    // on each navigation hands next/image a new src and busts both the optimizer and
    // browser caches. Cache the result per org so revisits reuse identical URLs. The 6h
    // window stays well inside Meta's URL expiry while limiting how often next/image
    // re-transforms the same (rotated-URL) thumbnails.
    const data = await unstable_cache(
      () => fetchRecentMedia(creds, limit),
      ["ig-media", organizationId, String(limit)],
      {
        revalidate: 21600,
      },
    )();
    return { success: true, data };
  } catch (error) {
    console.error("Failed to fetch Instagram media:", error);
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : "Failed to load posts.",
    };
  }
}

export interface InstagramDemographics {
  cities: DemographicItem[];
  countries: DemographicItem[];
  age: DemographicItem[];
  gender: DemographicItem[];
}

/** Follower demographics (city, country, age, gender). Empty until the account has 100+ followers. */
export async function fetchInstagramDemographics(): Promise<{
  success: boolean;
  data?: InstagramDemographics;
  error?: string;
}> {
  try {
    const context = await getActiveInstagramContext();
    if (!context.success) return { success: false, error: context.error };

    const { creds } = context;
    const [cities, countries, age, gender] = await Promise.all([
      fetchFollowerDemographics(creds, "city"),
      fetchFollowerDemographics(creds, "country"),
      fetchFollowerDemographics(creds, "age"),
      fetchFollowerDemographics(creds, "gender"),
    ]);
    return { success: true, data: { cities, countries, age, gender } };
  } catch (error) {
    console.error("Failed to fetch Instagram demographics:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to load demographics.",
    };
  }
}

/** Clears the stored config and deletes the secret token for the active tenant. */
export async function disconnectMeta(): Promise<{ success: boolean }> {
  const organizationId = await getActiveOrgId();
  if (!organizationId) return { success: false };

  try {
    const orgRef = getAdminDb().collection("organizations").doc(organizationId);
    await orgRef.set(
      { config: { metaIntegration: FieldValue.delete() } },
      { merge: true },
    );
    await orgRef.collection("secrets").doc("meta").delete();
    revalidatePath("/dashboard/instagram");
    return { success: true };
  } catch (error) {
    console.error("Failed to disconnect Meta:", error);
    return { success: false };
  }
}
