// Internal Facebook Graph API helpers for the Meta integration.
//
// No "use server" directive: these are plain server-side functions imported by
// the OAuth callback route and the server actions. They are never callable from
// the client, and the access tokens they handle never leave the server.

import type { MetaIntegrationConfig, MetaSecrets } from "@/types/meta";

import { getAdminDb } from "./firebase-admin";

const GRAPH = "https://graph.facebook.com/v22.0";

export interface MetaPage {
  id: string;
  name: string;
  accessToken: string;
}

export interface MetaInstagramProfile {
  instagramAccountId: string;
  username: string;
  name: string;
  profilePictureUrl: string;
  followersCount: number;
  mediaCount: number;
}

/** Upgrades a short-lived user token to a long-lived one (~60 days). */
export async function exchangeForLongLivedToken(
  shortToken: string,
): Promise<{ token: string; expiresAt?: number }> {
  const res = await fetch(
    `${GRAPH}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: process.env.META_APP_ID ?? "",
        client_secret: process.env.META_APP_SECRET ?? "",
        fb_exchange_token: shortToken,
      }),
  );
  const data = await res.json();
  return {
    token: data.access_token ?? shortToken,
    expiresAt:
      typeof data.expires_in === "number"
        ? Date.now() + data.expires_in * 1000
        : undefined,
  };
}

/** Lists the Facebook Pages the user manages (each with its own page token). */
export async function fetchPages(userToken: string): Promise<MetaPage[]> {
  const res = await fetch(`${GRAPH}/me/accounts?access_token=${userToken}`);
  const data = await res.json();
  return (data.data ?? []).map(
    (p: { id: string; name: string; access_token: string }) => ({
      id: p.id,
      name: p.name,
      accessToken: p.access_token,
    }),
  );
}

/** Resolves the Instagram Business account + profile linked to a page, or null. */
export async function fetchInstagramProfile(
  page: MetaPage,
): Promise<MetaInstagramProfile | null> {
  const igRes = await fetch(
    `${GRAPH}/${page.id}?` +
      new URLSearchParams({
        fields: "instagram_business_account",
        access_token: page.accessToken,
      }),
  );
  const igData = await igRes.json();
  const instagramAccountId = igData.instagram_business_account?.id;
  if (!instagramAccountId) return null;

  const profileRes = await fetch(
    `${GRAPH}/${instagramAccountId}?` +
      new URLSearchParams({
        fields:
          "id,username,name,profile_picture_url,followers_count,media_count",
        access_token: page.accessToken,
      }),
  );
  const p = await profileRes.json();
  return {
    instagramAccountId,
    username: p.username ?? "",
    name: p.name ?? "",
    profilePictureUrl: p.profile_picture_url ?? "",
    followersCount: p.followers_count ?? 0,
    mediaCount: p.media_count ?? 0,
  };
}

/**
 * Writes the connection for a tenant: display data on the org doc's config,
 * the page access token in the locked-down secrets subcollection.
 */
export async function storeMetaConnection(
  organizationId: string,
  page: MetaPage,
  profile: MetaInstagramProfile,
  expiresAt?: number,
): Promise<MetaIntegrationConfig> {
  const now = Date.now();

  const config: MetaIntegrationConfig = {
    connected: true,
    facebookPageId: page.id,
    facebookPageName: page.name,
    instagramAccountId: profile.instagramAccountId,
    instagramUsername: profile.username,
    instagramName: profile.name,
    instagramProfilePictureUrl: profile.profilePictureUrl,
    followersCount: profile.followersCount,
    mediaCount: profile.mediaCount,
    connectedAt: now,
    updatedAt: now,
  };

  const secrets: MetaSecrets = {
    facebookPageAccessToken: page.accessToken,
    tokenType: "page",
    instagramAccountId: profile.instagramAccountId,
    updatedAt: now,
    // Firestore admin rejects `undefined`, so only include when we have a value.
    ...(expiresAt !== undefined ? { expiresAt } : {}),
  };

  const orgRef = getAdminDb().collection("organizations").doc(organizationId);
  // merge keeps existing config (e.g. gaPropertyId) intact.
  await orgRef.set({ config: { metaIntegration: config } }, { merge: true });
  await orgRef.collection("secrets").doc("meta").set(secrets, { merge: true });

  return config;
}

// ---------------------------------------------------------------------------
// Insights (analytics)
// ---------------------------------------------------------------------------

export interface StoredMetaCreds {
  token: string;
  igId: string;
}

export interface IgKpis {
  reach: number;
  views: number;
  profileViews: number;
  accountsEngaged: number;
  likes: number;
  comments: number;
  websiteClicks: number;
}

export interface IgTrendPoint {
  label: string;
  reach: number;
}

export interface IgMediaItem {
  id: string;
  caption: string;
  mediaType: string;
  timestamp: string;
  likeCount: number;
  commentsCount: number;
  permalink: string;
  /** Image/video URL. For video posts use `thumbnailUrl` to render a still. */
  mediaUrl: string;
  /** Still image for video/reel posts; empty for images. */
  thumbnailUrl: string;
}

/** Reads the stored page token + IG account id for a tenant (server-only). */
export async function getStoredMetaCreds(
  organizationId: string,
): Promise<StoredMetaCreds | null> {
  const snap = await getAdminDb()
    .collection("organizations")
    .doc(organizationId)
    .collection("secrets")
    .doc("meta")
    .get();
  if (!snap.exists) return null;
  const token = snap.data()?.facebookPageAccessToken as string | undefined;
  const igId = snap.data()?.instagramAccountId as string | undefined;
  if (!token || !igId) return null;
  return { token, igId };
}

// Surfaces real Graph errors (e.g. an expired token) instead of silently
// returning zeros, so the UI can show a meaningful message.
async function graphJson(url: string): Promise<{ data?: unknown[] }> {
  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json()) as {
    data?: unknown[];
    error?: { message?: string; error_user_msg?: string };
  };
  if (json.error) {
    throw new Error(
      json.error.error_user_msg ??
        json.error.message ??
        "Instagram Graph API error.",
    );
  }
  return json;
}

function formatDayLabel(endTime: string): string {
  const d = new Date(endTime);
  return Number.isNaN(d.getTime())
    ? endTime
    : d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

// Instagram's day-period insights reject any window wider than 30 days
// ((#100) "There cannot be more than 30 days between since and until"), so we
// split longer ranges into ≤30-day chunks and aggregate the results.
const MAX_WINDOW = 30 * 24 * 60 * 60;

function splitWindow(
  since: number,
  until: number,
): { since: number; until: number }[] {
  const chunks: { since: number; until: number }[] = [];
  let cursor = since;
  while (cursor < until) {
    const end = Math.min(cursor + MAX_WINDOW, until);
    chunks.push({ since: cursor, until: end });
    cursor = end;
  }
  return chunks;
}

/** Account-level totals over a window: reach, views, profile visits, accounts engaged. */
export async function fetchAccountKpis(
  creds: StoredMetaCreds,
  since: number,
  until: number,
): Promise<IgKpis> {
  const chunks = await Promise.all(
    splitWindow(since, until).map((w) =>
      graphJson(
        `${GRAPH}/${creds.igId}/insights?${new URLSearchParams({
          metric:
            "reach,views,profile_views,accounts_engaged,likes,comments,website_clicks",
          period: "day",
          metric_type: "total_value",
          since: String(w.since),
          until: String(w.until),
          access_token: creds.token,
        })}`,
      ),
    ),
  );

  // Summed across chunks. Reach is unique-per-chunk, so a multi-chunk total
  // slightly over-counts accounts seen in more than one chunk — unavoidable
  // given the 30-day cap, and the standard workaround.
  const byName: Record<string, number> = {};
  for (const json of chunks) {
    for (const m of (json.data ?? []) as {
      name: string;
      total_value?: { value?: number };
    }[]) {
      byName[m.name] = (byName[m.name] ?? 0) + (m.total_value?.value ?? 0);
    }
  }

  return {
    reach: byName.reach ?? 0,
    views: byName.views ?? 0,
    profileViews: byName.profile_views ?? 0,
    accountsEngaged: byName.accounts_engaged ?? 0,
    likes: byName.likes ?? 0,
    comments: byName.comments ?? 0,
    websiteClicks: byName.website_clicks ?? 0,
  };
}

/** Daily reach series over a window, for the trend chart. */
export async function fetchReachTrend(
  creds: StoredMetaCreds,
  since: number,
  until: number,
): Promise<IgTrendPoint[]> {
  const chunks = await Promise.all(
    splitWindow(since, until).map((w) =>
      graphJson(
        `${GRAPH}/${creds.igId}/insights?${new URLSearchParams({
          metric: "reach",
          period: "day",
          since: String(w.since),
          until: String(w.until),
          access_token: creds.token,
        })}`,
      ),
    ),
  );

  // Daily points just concatenate across chunks (in window order).
  return chunks.flatMap((json) => {
    const values =
      (
        (json.data ?? [])[0] as
          | { values?: { value?: number; end_time?: string }[] }
          | undefined
      )?.values ?? [];
    return values.map((v) => ({
      label: formatDayLabel(v.end_time ?? ""),
      reach: v.value ?? 0,
    }));
  });
}

/** Live total follower count for the IG account. */
export async function fetchFollowerCount(
  creds: StoredMetaCreds,
): Promise<number> {
  const res = await fetch(
    `${GRAPH}/${creds.igId}?fields=followers_count&access_token=${creds.token}`,
    {
      cache: "no-store",
    },
  );
  const json = (await res.json()) as {
    followers_count?: number;
    error?: { message?: string; error_user_msg?: string };
  };
  if (json.error) {
    throw new Error(
      json.error.error_user_msg ??
        json.error.message ??
        "Instagram Graph API error.",
    );
  }
  return json.followers_count ?? 0;
}

/**
 * Current profile display fields for the IG account. The daily snapshot re-
 * fetches these because `profile_picture_url` is a signed, expiring CDN URL —
 * the copy stored at connect time eventually 403s and the avatar breaks.
 */
export async function fetchProfileDisplay(creds: StoredMetaCreds): Promise<{
  username: string;
  name: string;
  profilePictureUrl: string;
  followersCount: number;
  mediaCount: number;
}> {
  const res = await fetch(
    `${GRAPH}/${creds.igId}?` +
      new URLSearchParams({
        fields: "username,name,profile_picture_url,followers_count,media_count",
        access_token: creds.token,
      }),
    { cache: "no-store" },
  );
  const json = (await res.json()) as {
    username?: string;
    name?: string;
    profile_picture_url?: string;
    followers_count?: number;
    media_count?: number;
    error?: { message?: string; error_user_msg?: string };
  };
  if (json.error) {
    throw new Error(
      json.error.error_user_msg ??
        json.error.message ??
        "Instagram Graph API error.",
    );
  }
  return {
    username: json.username ?? "",
    name: json.name ?? "",
    profilePictureUrl: json.profile_picture_url ?? "",
    followersCount: json.followers_count ?? 0,
    mediaCount: json.media_count ?? 0,
  };
}

/**
 * New followers gained per day, summed over the window (≤30 days). Returns null
 * when the metric is unavailable — Instagram doesn't expose `follower_count` for
 * accounts under 100 followers, which we treat as "no comparison" rather than an error.
 */
export async function fetchFollowerGains(
  creds: StoredMetaCreds,
  since: number,
  until: number,
): Promise<number | null> {
  try {
    const json = await graphJson(
      `${GRAPH}/${creds.igId}/insights?${new URLSearchParams({
        metric: "follower_count",
        period: "day",
        since: String(since),
        until: String(until),
        access_token: creds.token,
      })}`,
    );
    const values =
      ((json.data ?? [])[0] as { values?: { value?: number }[] } | undefined)
        ?.values ?? [];
    return values.reduce((sum, v) => sum + (v.value ?? 0), 0);
  } catch {
    return null;
  }
}

export interface DemographicItem {
  label: string;
  value: number;
}

/**
 * Follower demographics for one breakdown dimension (city | country | age | gender),
 * sorted by follower count. Requires the account to have 100+ followers — below that
 * the API returns an empty list (handled by callers), not an error.
 */
export async function fetchFollowerDemographics(
  creds: StoredMetaCreds,
  breakdown: "city" | "country" | "age" | "gender",
): Promise<DemographicItem[]> {
  const json = await graphJson(
    `${GRAPH}/${creds.igId}/insights?${new URLSearchParams({
      metric: "follower_demographics",
      period: "lifetime",
      metric_type: "total_value",
      breakdown,
      access_token: creds.token,
    })}`,
  );

  const node = (json.data ?? [])[0] as
    | {
        total_value?: {
          breakdowns?: {
            results?: { dimension_values?: string[]; value?: number }[];
          }[];
        };
      }
    | undefined;
  const results = node?.total_value?.breakdowns?.[0]?.results ?? [];

  return results
    .map((r) => ({
      label: (r.dimension_values ?? []).join(", "),
      value: r.value ?? 0,
    }))
    .sort((a, b) => b.value - a.value);
}

/** Recent media with engagement counts. */
export async function fetchRecentMedia(
  creds: StoredMetaCreds,
  limit = 10,
): Promise<IgMediaItem[]> {
  const json = await graphJson(
    `${GRAPH}/${creds.igId}/media?${new URLSearchParams({
      fields:
        "id,caption,media_type,timestamp,like_count,comments_count,permalink,media_url,thumbnail_url",
      limit: String(limit),
      access_token: creds.token,
    })}`,
  );

  return ((json.data ?? []) as Record<string, unknown>[]).map((m) => ({
    id: String(m.id ?? ""),
    caption: String(m.caption ?? ""),
    mediaType: String(m.media_type ?? ""),
    timestamp: String(m.timestamp ?? ""),
    likeCount: Number(m.like_count ?? 0),
    commentsCount: Number(m.comments_count ?? 0),
    permalink: String(m.permalink ?? ""),
    mediaUrl: String(m.media_url ?? ""),
    thumbnailUrl: String(m.thumbnail_url ?? ""),
  }));
}
