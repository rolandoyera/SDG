import { GoogleAuth } from "google-auth-library";

// Pinned REST API version; Google sunsets versions ~yearly, bump deliberately.
const API_VERSION = "v24";
const ADWORDS_SCOPE = "https://www.googleapis.com/auth/adwords";

let auth: GoogleAuth | null = null;

export function hasGoogleAdsCredentials(): boolean {
  return Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
}

/**
 * Prod: OAuth refresh-token trio in env (the MCC user's credentials).
 * Local dev: falls through to Application Default Credentials — the same
 * gcloud ADC (with the adwords scope) that Web/Tools/ads-tools/ads.py uses.
 */
function getAuth(): GoogleAuth {
  if (auth) return auth;

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;

  auth =
    clientId && clientSecret && refreshToken
      ? new GoogleAuth({
          credentials: {
            type: "authorized_user",
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
          },
        })
      : new GoogleAuth({ scopes: [ADWORDS_SCOPE] });
  return auth;
}

// Only the fields our GAQL queries select. The REST API returns camelCase
// JSON and serializes int64 metrics (impressions, clicks, micros) as STRINGS;
// doubles (ctr, shares, conversions) stay numbers.
export interface GoogleAdsRow {
  customer?: {
    descriptiveName?: string;
    currencyCode?: string;
    timeZone?: string;
  };
  campaign?: {
    id?: string;
    name?: string;
    status?: string;
    advertisingChannelType?: string;
  };
  campaignBudget?: { amountMicros?: string };
  adGroup?: { name?: string };
  adGroupCriterion?: {
    keyword?: { text?: string; matchType?: string };
    qualityInfo?: {
      qualityScore?: number;
      creativeQualityScore?: string;
      postClickQualityScore?: string;
      searchPredictedCtr?: string;
    };
  };
  searchTermView?: { searchTerm?: string; status?: string };
  sharedSet?: { resourceName?: string; name?: string };
  userLocationView?: { targetingLocation?: boolean };
  geoTargetConstant?: {
    id?: string;
    name?: string;
    targetType?: string;
    canonicalName?: string;
  };
  segments?: {
    date?: string;
    hour?: number;
    device?: string;
    keyword?: { info?: { text?: string } };
    /** Resource name, e.g. "geoTargetConstants/1015027". */
    geoTargetCity?: string;
    /** Resource name, e.g. "geoTargetConstants/9011965". */
    geoTargetPostalCode?: string;
  };
  metrics?: {
    impressions?: string;
    clicks?: string;
    costMicros?: string;
    ctr?: number;
    averageCpc?: number;
    conversions?: number;
    costPerConversion?: number;
    searchImpressionShare?: number;
    searchBudgetLostImpressionShare?: number;
    searchRankLostImpressionShare?: number;
  };
}

interface ApiError {
  error?: {
    message?: string;
    details?: { errors?: { message?: string }[] }[];
  };
}

interface SearchResponse extends ApiError {
  results?: GoogleAdsRow[];
}

async function adsRequest<T extends ApiError>(
  customerId: string,
  method: string,
  payload: unknown,
): Promise<T> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) throw new Error("Missing GOOGLE_ADS_DEVELOPER_TOKEN.");

  const token = await getAuth().getAccessToken();
  if (!token) throw new Error("Failed to obtain a Google Ads access token.");

  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  const res = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/${method}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "developer-token": developerToken,
        ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );

  const body = (await res.json()) as T;
  if (!res.ok) {
    const detail = body.error?.details?.[0]?.errors?.[0]?.message;
    throw new Error(
      detail || body.error?.message || `Google Ads API error (${res.status}).`,
    );
  }
  return body;
}

/**
 * Runs a GAQL query via the Google Ads REST API. Single page only (10k rows)
 * — every caller LIMITs well below that.
 */
export async function searchGoogleAds(
  customerId: string,
  query: string,
): Promise<GoogleAdsRow[]> {
  const body = await adsRequest<SearchResponse>(
    customerId,
    "googleAds:search",
    {
      query,
    },
  );
  return body.results ?? [];
}

/**
 * Runs a mutate against one service (e.g. "sharedCriteria",
 * "campaignCriteria"). Callers own the operation shape.
 */
export async function mutateGoogleAds(
  customerId: string,
  service: string,
  operations: unknown[],
): Promise<void> {
  await adsRequest<ApiError>(customerId, `${service}:mutate`, { operations });
}
