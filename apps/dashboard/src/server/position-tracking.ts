import { createHmac } from "node:crypto";

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
/**
 * Deepest scan (8 pages), used by queued checks for keywords with no known
 * placement and as the automatic re-check depth when a shallow check misses.
 */
export const DEEP_SERP_DEPTH = 80;
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
  id: string;
  status_code: number;
  status_message: string;
  result: T[] | null;
}

/** Raw request; returns every task envelope so callers can handle per-task status. */
async function dfsRequest<T>(
  path: string,
  payload?: unknown[],
): Promise<DfsTask<T>[]> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    throw new Error("DataForSEO credentials are not configured.");
  }

  const response = await fetch(`https://api.dataforseo.com/v3${path}`, {
    method: payload ? "POST" : "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`DataForSEO request failed (HTTP ${response.status}).`);
  }

  const body = (await response.json()) as { tasks?: DfsTask<T>[] };
  return body.tasks ?? [];
}

async function dfsPost<T>(path: string, payload: unknown[]): Promise<T[]> {
  const task = (await dfsRequest<T>(path, payload))[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(task?.status_message ?? "DataForSEO returned no task.");
  }
  return task.result ?? [];
}

// ---------------------------------------------------------------------------
// Location registry — typeahead source for the add-keywords city field
// ---------------------------------------------------------------------------

export interface SerpLocationSuggestion {
  /** Full canonical DataForSEO location_name, e.g. "Aventura,Florida,United States". */
  name: string;
  /** DataForSEO location_type: City, Neighborhood, County, Airport, … */
  type: string;
}

export const MAX_LOCATION_SUGGESTIONS = 8;
/** The registry rarely changes; one download per country per day is plenty. */
const LOCATIONS_TTL_MS = 24 * 60 * 60 * 1000;
const locationsCache = new Map<
  string,
  { fetchedAt: number; locations: SerpLocationSuggestion[] }
>();

/** Downloads a country's full location registry (~60k rows for the US). */
async function loadSerpLocations(
  country: string,
): Promise<SerpLocationSuggestion[]> {
  const key = country.toLowerCase();
  const cached = locationsCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < LOCATIONS_TTL_MS) {
    return cached.locations;
  }
  const task = (
    await dfsRequest<{ location_name: string; location_type: string }>(
      `/serp/google/locations/${key}`,
    )
  )[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(task?.status_message ?? "Could not load locations.");
  }
  const locations = (task.result ?? []).map((row) => ({
    name: row.location_name,
    type: row.location_type,
  }));
  locationsCache.set(key, { fetchedAt: Date.now(), locations });
  return locations;
}

/**
 * Matches a typed fragment against the place part of each location_name
 * (the segment before the first comma). Prefix matches rank above
 * substring matches; within a tier the company's home state comes first
 * (so a Florida org typing "mia" sees Miami, FL above Miami, TX), then
 * shorter names, so "Miami" beats "Miami Gardens" beats "Tamiami".
 */
export async function searchSerpLocations(
  country: string,
  stateCode: string | null,
  query: string,
): Promise<SerpLocationSuggestion[]> {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const locations = await loadSerpLocations(country);
  const homeState = stateCode ? US_STATE_NAMES[stateCode.toUpperCase()] : null;
  const prefix: SerpLocationSuggestion[] = [];
  const substring: SerpLocationSuggestion[] = [];
  for (const location of locations) {
    const comma = location.name.indexOf(",");
    const place = (
      comma === -1 ? location.name : location.name.slice(0, comma)
    ).toLowerCase();
    if (place.startsWith(needle)) prefix.push(location);
    else if (place.includes(needle)) substring.push(location);
  }
  const rank = (a: SerpLocationSuggestion, b: SerpLocationSuggestion) => {
    if (homeState) {
      const aHome = a.name.includes(`,${homeState},`);
      const bHome = b.name.includes(`,${homeState},`);
      if (aHome !== bHome) return aHome ? -1 : 1;
    }
    return a.name.length - b.name.length || a.name.localeCompare(b.name);
  };
  return [...prefix.sort(rank), ...substring.sort(rank)].slice(
    0,
    MAX_LOCATION_SUGGESTIONS,
  );
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
// Queued (Standard-priority) checks — cheap async SERP tasks
// ---------------------------------------------------------------------------

/**
 * SERP depth for a keyword given its last known position: one page of slack
 * past the current spot (round up to the next 10, +10). Unknown or ">depth"
 * placements scan the full DEEP_SERP_DEPTH. Billing is per 10 results, so
 * every bucket saved is money saved.
 */
export function adaptiveDepth(lastPosition: number | null): number {
  if (lastPosition === null) return DEEP_SERP_DEPTH;
  return Math.min(Math.ceil(lastPosition / 10) * 10 + 10, DEEP_SERP_DEPTH);
}

export interface QueuedSerpTask {
  /** DataForSEO task id used to collect the result. */
  id: string;
  keyword: string;
  location: string;
  depth: number;
  /** Post time; drives the stale-sweep when a postback goes missing. */
  queuedAt: number;
}

/**
 * Base URL for DataForSEO postbacks: explicit override first, then Vercel's
 * production domain. Locally neither is set, so postbacks are off and
 * checks are collected via task_get instead.
 */
function postbackBaseUrl(): string | null {
  if (process.env.DATAFORSEO_POSTBACK_URL) {
    return process.env.DATAFORSEO_POSTBACK_URL;
  }
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}` : null;
}

export function postbackConfigured(): boolean {
  return Boolean(postbackBaseUrl() && process.env.CRON_SECRET);
}

/** Per-org token, so a leaked postback URL can only feed results to its own org. */
export function postbackToken(organizationId: string): string {
  return createHmac("sha256", process.env.CRON_SECRET ?? "")
    .update(organizationId)
    .digest("hex");
}

export function postbackUrlFor(organizationId: string): string | undefined {
  if (!postbackConfigured()) return undefined;
  return `${postbackBaseUrl()}/api/dataforseo/postback?org=${encodeURIComponent(organizationId)}&token=${postbackToken(organizationId)}`;
}

/** task_post accepted the task; anything else at post time is a task error. */
const DFS_TASK_CREATED = 20100;
/** task_get codes meaning "not done yet, ask again". */
const DFS_PENDING_CODES = new Set([40601, 40602]);

/**
 * Posts one Standard-queue SERP task per entry (single POST, one task per
 * keyword). An entry whose location is rejected at post time is retried
 * country-wide and reported in `downgraded`, mirroring the live flow; an
 * entry that fails outright is skipped and logged.
 */
export async function postSerpTasks(
  entries: { keyword: string; location: string; depth: number }[],
  opts?: { postbackUrl?: string },
): Promise<{ tasks: QueuedSerpTask[]; downgraded: string[] }> {
  const post = async (batch: typeof entries) =>
    dfsRequest("/serp/google/organic/task_post", [
      ...batch.map((entry) => ({
        keyword: entry.keyword,
        location_name: entry.location,
        language_code: "en",
        depth: entry.depth,
        ...(opts?.postbackUrl
          ? { postback_url: opts.postbackUrl, postback_data: "advanced" }
          : {}),
      })),
    ]);

  const tasks: QueuedSerpTask[] = [];
  const downgraded: string[] = [];
  const retry: typeof entries = [];

  const posted = await post(entries);
  entries.forEach((entry, index) => {
    const task = posted[index];
    if (task?.status_code === DFS_TASK_CREATED) {
      tasks.push({ id: task.id, queuedAt: Date.now(), ...entry });
    } else if (entry.location !== FALLBACK_LOCATION) {
      retry.push({ ...entry, location: FALLBACK_LOCATION });
    } else {
      console.error(
        `SERP task post failed for "${entry.keyword}":`,
        task?.status_message,
      );
    }
  });

  if (retry.length > 0) {
    const reposted = await post(retry);
    retry.forEach((entry, index) => {
      const task = reposted[index];
      if (task?.status_code === DFS_TASK_CREATED) {
        tasks.push({ id: task.id, queuedAt: Date.now(), ...entry });
        downgraded.push(entry.keyword);
      } else {
        console.error(
          `SERP task post failed for "${entry.keyword}":`,
          task?.status_message,
        );
      }
    });
  }

  return { tasks, downgraded };
}

export type SerpTaskResult =
  | { status: "pending" }
  | { status: "done"; items: SerpItem[] }
  | { status: "failed"; message: string };

/** Collects one queued task's result; "pending" means poll again later. */
export async function fetchSerpTaskResult(id: string): Promise<SerpTaskResult> {
  const task = (
    await dfsRequest<{ items: SerpItem[] | null }>(
      `/serp/google/organic/task_get/advanced/${id}`,
    )
  )[0];
  if (!task)
    return { status: "failed", message: "DataForSEO returned no task." };
  if (task.status_code === 20000) {
    return { status: "done", items: task.result?.[0]?.items ?? [] };
  }
  if (DFS_PENDING_CODES.has(task.status_code)) return { status: "pending" };
  return { status: "failed", message: task.status_message };
}

// ---------------------------------------------------------------------------
// Position checks
// ---------------------------------------------------------------------------

function normalizeDomain(value: string): string {
  return value.toLowerCase().replace(/^www\./, "");
}

export function findPlacement(
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

export interface CheckOutcome {
  /** Placements to merge into today's snapshot. */
  results?: PositionResult[];
  /** Task ids to drop from the org's pending-check list. */
  removeTaskIds?: string[];
  /** Tasks to add to the pending list (new runs, deep re-checks). */
  addTasks?: QueuedSerpTask[];
}

/**
 * Atomically merges results into today's snapshot and updates the org's
 * pending-check list (`seo.pendingChecks`). Transactional because postbacks
 * arrive concurrently — a plain read-modify-write would drop results.
 */
export async function applyCheckOutcome(
  organizationId: string,
  outcome: CheckOutcome,
): Promise<void> {
  const results = outcome.results ?? [];
  const removeIds = new Set(outcome.removeTaskIds ?? []);
  const addTasks = outcome.addTasks ?? [];
  const touchPending = removeIds.size > 0 || addTasks.length > 0;
  if (results.length === 0 && !touchPending) return;

  const db = getAdminDb();
  const orgRef = db.collection("organizations").doc(organizationId);
  const snapshotRef = orgRef
    .collection("positionSnapshots")
    .doc(easternDateKey());

  await db.runTransaction(async (txn) => {
    const snapshotSnap = results.length > 0 ? await txn.get(snapshotRef) : null;
    const orgSnap = touchPending ? await txn.get(orgRef) : null;

    if (snapshotSnap) {
      const existing = snapshotSnap.data() as PositionSnapshot | undefined;
      const merged = new Map<string, PositionResult>();
      for (const row of existing?.results ?? []) merged.set(row.keyword, row);
      for (const row of results) merged.set(row.keyword, row);
      const snapshot: PositionSnapshot = {
        date: snapshotRef.id,
        results: [...merged.values()],
        createdAt: Date.now(),
      };
      txn.set(snapshotRef, snapshot);
    }
    if (orgSnap) {
      const seo = orgSnap.data()?.seo as
        | { pendingChecks?: QueuedSerpTask[] }
        | undefined;
      const next = [
        ...(seo?.pendingChecks ?? []).filter((task) => !removeIds.has(task.id)),
        ...addTasks,
      ];
      txn.set(orgRef, { seo: { pendingChecks: next } }, { merge: true });
    }
  });
}

/** Merges freshly checked results into today's snapshot (keeps other keywords' rows). */
export async function mergeSnapshot(
  organizationId: string,
  results: PositionResult[],
): Promise<void> {
  await applyCheckOutcome(organizationId, { results });
}

/** The org's queued checks still awaiting results. */
export async function readPendingChecks(
  organizationId: string,
): Promise<QueuedSerpTask[]> {
  const snap = await getAdminDb().doc(`organizations/${organizationId}`).get();
  const seo = snap.data()?.seo as
    | { pendingChecks?: QueuedSerpTask[] }
    | undefined;
  return seo?.pendingChecks ?? [];
}

/**
 * Most recent recorded position per keyword, for choosing the check depth.
 * Scans the newest snapshots only — a keyword absent from all of them is
 * treated as unplaced and gets the deep scan.
 */
export async function latestPositions(
  organizationId: string,
  keywords: Set<string>,
): Promise<Map<string, number | null>> {
  const snapshotDocs = await getAdminDb()
    .collection("organizations")
    .doc(organizationId)
    .collection("positionSnapshots")
    .orderBy("date", "desc")
    .limit(14)
    .get();
  const positions = new Map<string, number | null>();
  for (const doc of snapshotDocs.docs) {
    for (const row of (doc.data() as PositionSnapshot).results) {
      if (keywords.has(row.keyword) && !positions.has(row.keyword)) {
        positions.set(row.keyword, row.position);
      }
    }
  }
  return positions;
}

/**
 * Actively collects finished queue tasks via task_get: the whole pending
 * list when postbacks aren't configured (local dev), otherwise only tasks
 * old enough that their postback looks missed. A shallow check that misses
 * is re-posted at DEEP_SERP_DEPTH instead of recorded; a failed task is
 * dropped. Returns the refreshed pending list.
 */
export async function collectPendingChecks(
  organizationId: string,
  website: string,
  staleMs: number,
): Promise<QueuedSerpTask[]> {
  const pending = await readPendingChecks(organizationId);
  const cutoff = Date.now() - staleMs;
  const collectable = pending.filter((task) => task.queuedAt <= cutoff);
  if (collectable.length === 0) return pending;

  const domain = websiteDomain(website);
  const results: PositionResult[] = [];
  const removeTaskIds: string[] = [];
  const deepRechecks: { keyword: string; location: string; depth: number }[] =
    [];

  const collected = await Promise.all(
    collectable.map(async (task) => ({
      task,
      result: await fetchSerpTaskResult(task.id),
    })),
  );
  for (const { task, result } of collected) {
    if (result.status === "pending") continue;
    removeTaskIds.push(task.id);
    if (result.status === "failed") {
      console.error(
        `Queued check failed for "${task.keyword}":`,
        result.message,
      );
    } else {
      const placement = findPlacement(result.items, domain);
      if (placement.position === null && task.depth < DEEP_SERP_DEPTH) {
        deepRechecks.push({
          keyword: task.keyword,
          location: task.location,
          depth: DEEP_SERP_DEPTH,
        });
      } else {
        results.push({ keyword: task.keyword, ...placement });
      }
    }
  }
  if (removeTaskIds.length === 0) return pending;

  const addTasks =
    deepRechecks.length > 0
      ? (
          await postSerpTasks(deepRechecks, {
            postbackUrl: postbackUrlFor(organizationId),
          })
        ).tasks
      : [];
  await applyCheckOutcome(organizationId, { results, removeTaskIds, addTasks });
  return readPendingChecks(organizationId);
}

/** Task envelope DataForSEO POSTs to the postback route (task_get shape). */
export interface SerpPostbackTask {
  id: string;
  status_code: number;
  status_message?: string;
  data?: { keyword?: string; location_name?: string; depth?: number };
  result?: { items: SerpItem[] | null }[] | null;
}

/**
 * Applies one postback-delivered task result: merges the placement into
 * today's snapshot and clears the pending entry. Same rules as active
 * collection — a shallow miss re-posts at DEEP_SERP_DEPTH, a failed task
 * is dropped without recording.
 */
export async function handleSerpPostback(
  organizationId: string,
  task: SerpPostbackTask,
): Promise<void> {
  const keyword = task.data?.keyword;
  if (!task.id || !keyword) return;
  if (task.status_code !== 20000) {
    console.error(`Queued check failed for "${keyword}":`, task.status_message);
    await applyCheckOutcome(organizationId, { removeTaskIds: [task.id] });
    return;
  }

  const orgSnap = await getAdminDb()
    .doc(`organizations/${organizationId}`)
    .get();
  const { website } = readOrgTracking(orgSnap.data());
  if (!website) {
    await applyCheckOutcome(organizationId, { removeTaskIds: [task.id] });
    return;
  }

  const items = task.result?.[0]?.items ?? [];
  const placement = findPlacement(items, websiteDomain(website));
  const depth =
    typeof task.data?.depth === "number" ? task.data.depth : DEEP_SERP_DEPTH;
  if (placement.position === null && depth < DEEP_SERP_DEPTH) {
    const reposted = await postSerpTasks(
      [
        {
          keyword,
          location: task.data?.location_name ?? FALLBACK_LOCATION,
          depth: DEEP_SERP_DEPTH,
        },
      ],
      { postbackUrl: postbackUrlFor(organizationId) },
    );
    await applyCheckOutcome(organizationId, {
      removeTaskIds: [task.id],
      addTasks: reposted.tasks,
    });
    return;
  }
  await applyCheckOutcome(organizationId, {
    results: [{ keyword, ...placement }],
    removeTaskIds: [task.id],
  });
}

/** Persists location downgrades and refreshes stale metadata after a run. */
async function finalizeKeywordList(
  organizationId: string,
  keywords: TrackedKeyword[],
  downgraded: string[],
): Promise<void> {
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
}

/**
 * Live daily run for one org: check every tracked keyword, snapshot the
 * results, persist location downgrades, and refresh stale metadata. Returns
 * null when the org has nothing to track. Fallback for environments
 * without postbacks — production crons use `queuePositionCheckForOrg`.
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
  await finalizeKeywordList(organizationId, keywords, downgraded);

  return {
    checked: results.length,
    found: results.filter((row) => row.position !== null).length,
  };
}

/**
 * Queue-based daily run for one org: posts a Standard-priority task per
 * keyword at adaptive depth with a postback URL, so results merge
 * themselves as DataForSEO delivers them — the cron just queues and exits.
 * Metadata refresh stays synchronous (cheap batched calls).
 */
export async function queuePositionCheckForOrg(
  organizationId: string,
): Promise<{ queued: number } | null> {
  const orgSnap = await getAdminDb()
    .doc(`organizations/${organizationId}`)
    .get();
  const { website, keywords } = readOrgTracking(orgSnap.data());
  if (!website || keywords.length === 0) return null;

  const positions = await latestPositions(
    organizationId,
    new Set(keywords.map((entry) => entry.keyword)),
  );
  const { tasks, downgraded } = await postSerpTasks(
    keywords.map((entry) => ({
      keyword: entry.keyword,
      location: entry.location,
      depth: adaptiveDepth(positions.get(entry.keyword) ?? null),
    })),
    { postbackUrl: postbackUrlFor(organizationId) },
  );
  await applyCheckOutcome(organizationId, { addTasks: tasks });
  await finalizeKeywordList(organizationId, keywords, downgraded);
  return { queued: tasks.length };
}

/**
 * Cron entry point: daily check for every org with tracked keywords —
 * queued with postbacks when configured, live otherwise.
 */
export async function runPositionChecksForAllOrgs(): Promise<{
  orgs: number;
  checked: number;
}> {
  const orgs = await getAdminDb().collection("organizations").get();
  const queued = postbackConfigured();
  let ran = 0;
  let checked = 0;
  for (const doc of orgs.docs) {
    const { website, keywords } = readOrgTracking(doc.data());
    if (!website || keywords.length === 0) continue;
    try {
      const summary = queued
        ? await queuePositionCheckForOrg(doc.id)
        : await runPositionCheckForOrg(doc.id);
      if (summary) {
        ran += 1;
        checked += "queued" in summary ? summary.queued : summary.checked;
      }
    } catch (error) {
      console.error(`Position check failed for org ${doc.id}:`, error);
    }
  }
  return { orgs: ran, checked };
}
