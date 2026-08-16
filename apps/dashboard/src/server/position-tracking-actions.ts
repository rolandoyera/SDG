"use server";

import { getActiveOrgId } from "./auth";
import { getAdminDb } from "./firebase-admin";
import { getActiveOrgCompanyAddress, getActiveOrgWebsite } from "./org-config";
import {
  adaptiveDepth,
  applyCheckOutcome,
  checkKeywords,
  collectPendingChecks,
  composeLocation,
  FALLBACK_LOCATION,
  fetchKeywordMetadata,
  latestPositions,
  MAX_TRACKED_KEYWORDS,
  mergeSnapshot,
  type PositionSnapshot,
  postbackConfigured,
  postbackUrlFor,
  postSerpTasks,
  type QueuedSerpTask,
  readPendingChecks,
  saveTrackedKeywords,
  searchSerpLocations,
  type SerpLocationSuggestion,
  type TrackedKeyword,
  websiteDomain,
} from "./position-tracking";

export type {
  PositionResult,
  PositionSnapshot,
  QueuedSerpTask,
  SerpLocationSuggestion,
  TrackedKeyword,
} from "./position-tracking";

interface TrackingResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function readTrackedKeywords(
  organizationId: string,
): Promise<TrackedKeyword[]> {
  const snap = await getAdminDb().doc(`organizations/${organizationId}`).get();
  const seo = snap.data()?.seo as
    | { trackedKeywords?: TrackedKeyword[] }
    | undefined;
  return seo?.trackedKeywords ?? [];
}

export interface PositionTrackingData {
  keywords: TrackedKeyword[];
  snapshots: PositionSnapshot[];
}

/** The org's tracked keywords plus every daily snapshot, oldest first. */
export async function fetchPositionTracking(): Promise<
  TrackingResult<PositionTrackingData>
> {
  const organizationId = await getActiveOrgId();
  if (!organizationId) {
    return { success: false, error: "No active organization." };
  }
  try {
    const [keywords, snapshotDocs] = await Promise.all([
      readTrackedKeywords(organizationId),
      getAdminDb()
        .collection("organizations")
        .doc(organizationId)
        .collection("positionSnapshots")
        .orderBy("date", "asc")
        .get(),
    ]);
    return {
      success: true,
      data: {
        keywords,
        snapshots: snapshotDocs.docs.map(
          (doc) => doc.data() as PositionSnapshot,
        ),
      },
    };
  } catch (error) {
    console.error("fetchPositionTracking failed:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Could not load position tracking."),
    };
  }
}

/**
 * Typeahead for the add-keywords city field: matches against DataForSEO's
 * location registry for the company's country, so a picked suggestion is a
 * location_name the SERP API is guaranteed to accept (free-typed cities
 * still work via composeLocation, with its country-wide downgrade risk).
 */
export async function searchKeywordLocations(
  query: string,
): Promise<SerpLocationSuggestion[]> {
  const organizationId = await getActiveOrgId();
  if (!organizationId) return [];
  try {
    const { state, country } = await getActiveOrgCompanyAddress();
    return await searchSerpLocations(country ?? "US", state, query);
  } catch (error) {
    console.error("searchKeywordLocations failed:", error);
    return [];
  }
}

/**
 * Adds keywords and immediately runs their first live check + a metadata
 * fetch, so new rows show data without waiting for the nightly cron. Each
 * entry's `city` is composed into a full location with the company
 * profile's state/country ("Aventura" → "Aventura,Florida,United States");
 * blank tracks country-wide.
 */
export async function addTrackedKeywords(
  entries: { keyword: string; city: string }[],
): Promise<TrackingResult<PositionTrackingData>> {
  const organizationId = await getActiveOrgId();
  if (!organizationId) {
    return { success: false, error: "No active organization." };
  }
  const website = await getActiveOrgWebsite();
  if (!website) {
    return {
      success: false,
      error: "Set your website on the Company page first.",
    };
  }
  const { state, country } = await getActiveOrgCompanyAddress();

  const existing = await readTrackedKeywords(organizationId);
  const seen = new Set(existing.map((entry) => entry.keyword));
  const added: TrackedKeyword[] = [];
  for (const entry of entries) {
    const keyword = entry.keyword.trim().toLowerCase();
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    added.push({
      keyword,
      location: composeLocation(entry.city, state, country),
      addedAt: Date.now(),
      volume: null,
      cpc: null,
      difficulty: null,
      intent: null,
      metadataUpdatedAt: null,
    });
  }
  if (added.length === 0) {
    return { success: false, error: "Nothing new to add." };
  }
  if (existing.length + added.length > MAX_TRACKED_KEYWORDS) {
    return {
      success: false,
      error: `Up to ${MAX_TRACKED_KEYWORDS} keywords are supported.`,
    };
  }

  try {
    let keywords = [...existing, ...added];
    await saveTrackedKeywords(organizationId, keywords);

    // First check + metadata for the new entries; failures leave the
    // keywords saved for the nightly cron to pick up.
    try {
      const [{ results, downgraded }, metadata] = await Promise.all([
        checkKeywords(websiteDomain(website), added),
        fetchKeywordMetadata(added.map((entry) => entry.keyword)),
      ]);
      await mergeSnapshot(organizationId, results);
      keywords = keywords.map((entry) => {
        if (!added.some((row) => row.keyword === entry.keyword)) return entry;
        return {
          ...entry,
          ...(downgraded.includes(entry.keyword)
            ? { location: FALLBACK_LOCATION }
            : {}),
          ...(metadata.get(entry.keyword) ?? {}),
          metadataUpdatedAt: Date.now(),
        };
      });
      await saveTrackedKeywords(organizationId, keywords);
    } catch (error) {
      console.error("First check for added keywords failed:", error);
    }

    return await fetchPositionTracking();
  } catch (error) {
    console.error("addTrackedKeywords failed:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Could not add keywords."),
    };
  }
}

/** Removes keywords from tracking. Snapshot history is left in place. */
export async function removeTrackedKeywords(
  keywords: string[],
): Promise<TrackingResult<TrackedKeyword[]>> {
  const organizationId = await getActiveOrgId();
  if (!organizationId) {
    return { success: false, error: "No active organization." };
  }
  try {
    const existing = await readTrackedKeywords(organizationId);
    const remove = new Set(keywords);
    const remaining = existing.filter((entry) => !remove.has(entry.keyword));
    await saveTrackedKeywords(organizationId, remaining);
    return { success: true, data: remaining };
  } catch (error) {
    console.error("removeTrackedKeywords failed:", error);
    return {
      success: false,
      error: getErrorMessage(error, "Could not remove keywords."),
    };
  }
}

// ---------------------------------------------------------------------------
// "Check Selected" — Standard-queue checks for a chosen subset of keywords
// ---------------------------------------------------------------------------

/**
 * In postback mode a task whose postback hasn't arrived after this long is
 * assumed missed and swept via task_get on the next poll.
 */
const POSTBACK_SWEEP_AFTER_MS = 10 * 60 * 1000;

/**
 * Queues a Standard-priority SERP task for each selected keyword at its
 * adaptive depth, stores them on the org's pending list, and returns them
 * so the client can seed its spinners. Results merge server-side —
 * postbacks in production, `pollChecks` task_get sweeps otherwise.
 * Location downgrades are persisted here, same as the live flow.
 */
export async function postSelectedChecks(
  keywords: string[],
): Promise<TrackingResult<QueuedSerpTask[]>> {
  const organizationId = await getActiveOrgId();
  if (!organizationId) {
    return { success: false, error: "No active organization." };
  }
  const website = await getActiveOrgWebsite();
  if (!website) {
    return {
      success: false,
      error: "Set your website on the Company page first.",
    };
  }
  try {
    const tracked = await readTrackedKeywords(organizationId);
    const wanted = new Set(keywords);
    const entries = tracked.filter((entry) => wanted.has(entry.keyword));
    if (entries.length === 0) {
      return { success: false, error: "No tracked keywords selected." };
    }

    const positions = await latestPositions(
      organizationId,
      new Set(entries.map((entry) => entry.keyword)),
    );
    const { tasks, downgraded } = await postSerpTasks(
      entries.map((entry) => ({
        keyword: entry.keyword,
        location: entry.location,
        depth: adaptiveDepth(positions.get(entry.keyword) ?? null),
      })),
      { postbackUrl: postbackUrlFor(organizationId) },
    );

    if (downgraded.length > 0) {
      await saveTrackedKeywords(
        organizationId,
        tracked.map((entry) =>
          downgraded.includes(entry.keyword)
            ? { ...entry, location: FALLBACK_LOCATION }
            : entry,
        ),
      );
    }
    if (tasks.length === 0) {
      return { success: false, error: "The checks could not be queued." };
    }
    await applyCheckOutcome(organizationId, { addTasks: tasks });
    return { success: true, data: tasks };
  } catch (error) {
    console.error("postSelectedChecks failed:", error);
    return {
      success: false,
      error: getErrorMessage(error, "The position check failed."),
    };
  }
}

export interface CheckProgress {
  /** Tasks still in the queue (including any deep re-checks). */
  pending: QueuedSerpTask[];
  /** Refreshed page data, included when the pending count changed. */
  tracking?: PositionTrackingData;
}

/**
 * Reports queued-check progress for the active org. With postbacks
 * configured, results merge server-side as DataForSEO delivers them and
 * this mostly reads the pending list (sweeping tasks whose postback looks
 * missed); without them (local dev), it actively collects finished tasks
 * via task_get. Pass the previously seen pending count so the tracking
 * payload is only refetched when something changed.
 */
export async function pollChecks(
  prevPending: number,
): Promise<TrackingResult<CheckProgress>> {
  const organizationId = await getActiveOrgId();
  if (!organizationId) {
    return { success: false, error: "No active organization." };
  }
  try {
    const website = await getActiveOrgWebsite();
    const pending = website
      ? await collectPendingChecks(
          organizationId,
          website,
          postbackConfigured() ? POSTBACK_SWEEP_AFTER_MS : 0,
        )
      : await readPendingChecks(organizationId);

    let tracking: PositionTrackingData | undefined;
    if (pending.length !== prevPending) {
      const refreshed = await fetchPositionTracking();
      if (refreshed.success) tracking = refreshed.data;
    }
    return { success: true, data: { pending, tracking } };
  } catch (error) {
    console.error("pollChecks failed:", error);
    return {
      success: false,
      error: getErrorMessage(error, "The position check failed."),
    };
  }
}
