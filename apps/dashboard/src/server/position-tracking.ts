import { getAdminDb } from "./firebase-admin";

/**
 * Position Tracking core: daily Google rank checks for an org's tracked
 * keywords via the DataForSEO live SERP API, snapshotted to Firestore.
 * Shared by the cron route and the page's server actions — no "use server"
 * here so the cron can import it without the action wrapper.
 *
 * Storage:
 * - Keyword list: `organizations/{org}.seo.trackedKeywords` (config, like
 *   `seo.competitors`).
 * - Daily results: `organizations/{org}/positionSnapshots/{YYYY-MM-DD}` —
 *   date keys are America/New_York days.
 */

export const MAX_TRACKED_KEYWORDS = 50;
/** 5 pages of Google. Not found within this depth is recorded as null. */
export const SERP_DEPTH = 50;
export const FALLBACK_LOCATION = "United States";
const METADATA_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Live SERP calls run ~6s each; cap parallelism to stay polite and fast. */
const CHECK_CONCURRENCY = 5;

export interface TrackedKeyword {
  keyword: string;
  /** DataForSEO location_name, e.g. "Aventura,Florida,United States". */
  location: string;
  addedAt: number;
  volume: number | null;
  cpc: number | null;
  difficulty: number | null;
  intent: string | null;
  metadataUpdatedAt: number | null;
}

export interface PositionResult {
  keyword: string;
  /** Absolute SERP position, or null when not found within SERP_DEPTH. */
  position: number | null;
  url: string | null;
}

export interface PositionSnapshot {
  /** America/New_York day, `YYYY-MM-DD`. Also the document id. */
  date: string;
  results: PositionResult[];
  createdAt: number;
}

const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

/**
 * Builds a DataForSEO `location_name` from a bare city plus the company's
 * address codes: "Aventura" + FL/US → "Aventura,Florida,United States".
 * Blank means country-wide; input containing commas is passed through as an
 * already-full location_name. Non-US companies (or a missing state) fall
 * back to country-wide — and a city DataForSEO doesn't recognize is caught
 * at check time by the per-keyword downgrade.
 */
export function composeLocation(
  city: string,
  stateCode: string | null,
  countryCode: string | null,
): string {
  const trimmed = city.trim();
  if (!trimmed) return FALLBACK_LOCATION;
  if (trimmed.includes(",")) return trimmed;
  // Title-case so the typed capitalization never matters ("boca raton" →
  // "Boca Raton").
  const titled = trimmed
    .toLowerCase()
    .replace(/(^|[\s-])\p{L}/gu, (match) => match.toUpperCase());
  const stateName = stateCode
    ? US_STATE_NAMES[stateCode.toUpperCase()]
    : undefined;
  if ((countryCode ?? "US").toUpperCase() === "US" && stateName) {
    return `${titled},${stateName},United States`;
  }
  return FALLBACK_LOCATION;
}

/** America/New_York `YYYY-MM-DD` — the tracker's definition of "today". */
export function easternDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(date);
}

// ---------------------------------------------------------------------------
// DataForSEO client
// ---------------------------------------------------------------------------

interface DfsTask<T> {
  status_code: number;
  status_message: string;
  result: T[] | null;
}

async function dfsPost<T>(path: string, payload: unknown[]): Promise<T[]> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    throw new Error("DataForSEO credentials are not configured.");
  }

  const response = await fetch(`https://api.dataforseo.com/v3${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`DataForSEO request failed (HTTP ${response.status}).`);
  }

  const body = (await response.json()) as { tasks?: DfsTask<T>[] };
  const task = body.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(task?.status_message ?? "DataForSEO returned no task.");
  }
  return task.result ?? [];
}

interface SerpItem {
  type: string;
  rank_absolute: number;
  domain?: string;
  url?: string;
}

async function fetchSerpItems(
  keyword: string,
  location: string,
): Promise<SerpItem[]> {
  const result = await dfsPost<{ items: SerpItem[] | null }>(
    "/serp/google/organic/live/advanced",
    [
      {
        keyword,
        location_name: location,
        language_code: "en",
        depth: SERP_DEPTH,
      },
    ],
  );
  return result[0]?.items ?? [];
}

// ---------------------------------------------------------------------------
// Position checks
// ---------------------------------------------------------------------------

function normalizeDomain(value: string): string {
  return value.toLowerCase().replace(/^www\./, "");
}

function findPlacement(
  items: SerpItem[],
  domain: string,
): { position: number | null; url: string | null } {
  for (const item of items) {
    if (item.type !== "organic" || !item.domain) continue;
    if (normalizeDomain(item.domain) === domain) {
      return { position: item.rank_absolute, url: item.url ?? null };
    }
  }
  return { position: null, url: null };
}

/**
 * Live-checks the given keywords for one domain. A keyword whose saved
 * location DataForSEO rejects is retried against the country-level fallback
 * and reported in `downgraded` so the caller can persist the correction.
 * A keyword whose check fails outright is omitted from `results` (no data
 * for the day) rather than recorded as "not ranked".
 */
export async function checkKeywords(
  domain: string,
  entries: Pick<TrackedKeyword, "keyword" | "location">[],
): Promise<{ results: PositionResult[]; downgraded: string[] }> {
  const results: PositionResult[] = [];
  const downgraded: string[] = [];

  const queue = [...entries];
  const workers = Array.from(
    { length: Math.min(CHECK_CONCURRENCY, queue.length) },
    async () => {
      for (;;) {
        const entry = queue.shift();
        if (!entry) return;
        try {
          let items: SerpItem[];
          try {
            items = await fetchSerpItems(entry.keyword, entry.location);
          } catch (error) {
            if (entry.location === FALLBACK_LOCATION) throw error;
            items = await fetchSerpItems(entry.keyword, FALLBACK_LOCATION);
            downgraded.push(entry.keyword);
          }
          results.push({
            keyword: entry.keyword,
            ...findPlacement(items, domain),
          });
        } catch (error) {
          console.error(`Position check failed for "${entry.keyword}":`, error);
        }
      }
    },
  );
  await Promise.all(workers);

  return { results, downgraded };
}

// ---------------------------------------------------------------------------
// Keyword metadata (volume, CPC, difficulty, intent) — monthly refresh
// ---------------------------------------------------------------------------

/** Fetches volume/CPC/difficulty/intent for all entries in one batched pass. */
export async function fetchKeywordMetadata(
  keywords: string[],
): Promise<
  Map<string, Pick<TrackedKeyword, "volume" | "cpc" | "difficulty" | "intent">>
> {
  const [volumeResult, difficultyResult, intentResult] = await Promise.all([
    dfsPost<{
      keyword: string;
      search_volume: number | null;
      cpc: number | null;
    }>("/keywords_data/google_ads/search_volume/live", [
      { keywords, location_code: 2840, language_code: "en" },
    ]),
    dfsPost<{
      items: { keyword: string; keyword_difficulty: number | null }[] | null;
    }>("/dataforseo_labs/google/bulk_keyword_difficulty/live", [
      { keywords, location_code: 2840, language_code: "en" },
    ]),
    dfsPost<{
      items:
        | { keyword: string; keyword_intent: { label: string | null } | null }[]
        | null;
    }>("/dataforseo_labs/google/search_intent/live", [
      { keywords, language_code: "en" },
    ]),
  ]);

  const metadata = new Map<
    string,
    Pick<TrackedKeyword, "volume" | "cpc" | "difficulty" | "intent">
  >();
  const entry = (keyword: string) => {
    const key = keyword.toLowerCase();
    let existing = metadata.get(key);
    if (!existing) {
      existing = { volume: null, cpc: null, difficulty: null, intent: null };
      metadata.set(key, existing);
    }
    return existing;
  };

  for (const row of volumeResult) {
    const target = entry(row.keyword);
    target.volume = row.search_volume ?? null;
    target.cpc = row.cpc ?? null;
  }
  for (const row of difficultyResult[0]?.items ?? []) {
    entry(row.keyword).difficulty = row.keyword_difficulty ?? null;
  }
  for (const row of intentResult[0]?.items ?? []) {
    entry(row.keyword).intent = row.keyword_intent?.label ?? null;
  }
  return metadata;
}

// ---------------------------------------------------------------------------
// Org-level run (used by the cron and the page's "run now")
// ---------------------------------------------------------------------------

interface OrgTrackingData {
  website: string | null;
  keywords: TrackedKeyword[];
}

function readOrgTracking(
  data: Record<string, unknown> | undefined,
): OrgTrackingData {
  const profile = data?.companyProfile as { website?: string } | undefined;
  const seo = data?.seo as { trackedKeywords?: TrackedKeyword[] } | undefined;
  return {
    website: profile?.website?.trim() || null,
    keywords: seo?.trackedKeywords ?? [],
  };
}

export function websiteDomain(website: string): string {
  const url = new URL(
    /^https?:\/\//i.test(website) ? website : `https://${website}`,
  );
  return normalizeDomain(url.hostname);
}

export async function saveTrackedKeywords(
  organizationId: string,
  keywords: TrackedKeyword[],
): Promise<void> {
  await getAdminDb()
    .doc(`organizations/${organizationId}`)
    .set({ seo: { trackedKeywords: keywords } }, { merge: true });
}

/** Merges freshly checked results into today's snapshot (keeps other keywords' rows). */
export async function mergeSnapshot(
  organizationId: string,
  results: PositionResult[],
): Promise<PositionSnapshot> {
  const date = easternDateKey();
  const ref = getAdminDb()
    .collection("organizations")
    .doc(organizationId)
    .collection("positionSnapshots")
    .doc(date);

  const existing = (await ref.get()).data() as PositionSnapshot | undefined;
  const merged = new Map<string, PositionResult>();
  for (const row of existing?.results ?? []) merged.set(row.keyword, row);
  for (const row of results) merged.set(row.keyword, row);

  const snapshot: PositionSnapshot = {
    date,
    results: [...merged.values()],
    createdAt: Date.now(),
  };
  await ref.set(snapshot);
  return snapshot;
}

/**
 * Full daily run for one org: check every tracked keyword, snapshot the
 * results, persist location downgrades, and refresh stale metadata. Returns
 * null when the org has nothing to track.
 */
export async function runPositionCheckForOrg(
  organizationId: string,
): Promise<{ checked: number; found: number } | null> {
  const orgSnap = await getAdminDb()
    .doc(`organizations/${organizationId}`)
    .get();
  const { website, keywords } = readOrgTracking(orgSnap.data());
  if (!website || keywords.length === 0) return null;

  const { results, downgraded } = await checkKeywords(
    websiteDomain(website),
    keywords,
  );
  await mergeSnapshot(organizationId, results);

  let updated = keywords;
  if (downgraded.length > 0) {
    updated = keywords.map((entry) =>
      downgraded.includes(entry.keyword)
        ? { ...entry, location: FALLBACK_LOCATION }
        : entry,
    );
  }

  const stale = updated.some(
    (entry) =>
      !entry.metadataUpdatedAt ||
      Date.now() - entry.metadataUpdatedAt > METADATA_TTL_MS,
  );
  if (stale) {
    try {
      const metadata = await fetchKeywordMetadata(
        updated.map((entry) => entry.keyword),
      );
      updated = updated.map((entry) => ({
        ...entry,
        ...(metadata.get(entry.keyword) ?? {}),
        metadataUpdatedAt: Date.now(),
      }));
    } catch (error) {
      console.error("Keyword metadata refresh failed:", error);
    }
  }
  if (updated !== keywords) {
    await saveTrackedKeywords(organizationId, updated);
  }

  return {
    checked: results.length,
    found: results.filter((row) => row.position !== null).length,
  };
}

/** Cron entry point: runs the daily check for every org with tracked keywords. */
export async function runPositionChecksForAllOrgs(): Promise<{
  orgs: number;
  checked: number;
}> {
  const orgs = await getAdminDb().collection("organizations").get();
  let ran = 0;
  let checked = 0;
  for (const doc of orgs.docs) {
    const { website, keywords } = readOrgTracking(doc.data());
    if (!website || keywords.length === 0) continue;
    try {
      const summary = await runPositionCheckForOrg(doc.id);
      if (summary) {
        ran += 1;
        checked += summary.checked;
      }
    } catch (error) {
      console.error(`Position check failed for org ${doc.id}:`, error);
    }
  }
  return { orgs: ran, checked };
}
