import { getAdminDb } from "./firebase-admin";
import {
  fetchAccountKpis,
  fetchProfileDisplay,
  getStoredMetaCreds,
} from "./meta-graph";

/** One day's Instagram metrics, stored at organizations/{org}/instagramSnapshots/{date}. */
export interface InstagramSnapshot {
  /** UTC day measured, `YYYY-MM-DD`. Also the document id. */
  date: string;
  followersCount: number;
  reach: number;
  views: number;
  profileViews: number;
  accountsEngaged: number;
  likes: number;
  comments: number;
  websiteClicks: number;
  /** Epoch ms the snapshot was written. */
  createdAt: number;
}

/** UTC `YYYY-MM-DD` for a Date. */
function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Stored snapshots between two UTC date keys (inclusive), oldest first. */
export async function getSnapshotRange(
  organizationId: string,
  sinceDate: string,
  untilDate: string,
): Promise<InstagramSnapshot[]> {
  const snap = await getAdminDb()
    .collection("organizations")
    .doc(organizationId)
    .collection("instagramSnapshots")
    .where("date", ">=", sinceDate)
    .where("date", "<=", untilDate)
    .orderBy("date")
    .get();
  return snap.docs.map((doc) => doc.data() as InstagramSnapshot);
}

/** Most recent stored snapshot for an org, or null if none exist yet. */
export async function getLatestSnapshot(
  organizationId: string,
): Promise<InstagramSnapshot | null> {
  const snap = await getAdminDb()
    .collection("organizations")
    .doc(organizationId)
    .collection("instagramSnapshots")
    .orderBy("date", "desc")
    .limit(1)
    .get();
  return snap.empty ? null : (snap.docs[0].data() as InstagramSnapshot);
}

/**
 * Captures one daily snapshot for a single org: pulls the live profile and
 * the just-completed UTC day's account KPIs, writes them to Firestore, and
 * refreshes the display cache on the org config. Returns the snapshot, or null
 * when the org has no stored Meta creds. Throws on Graph API failure so
 * callers can isolate per-org.
 */
export async function snapshotInstagramForOrg(
  organizationId: string,
): Promise<InstagramSnapshot | null> {
  const creds = await getStoredMetaCreds(organizationId);
  if (!creds) return null;

  // Measure the just-completed 24h window.
  const until = Math.floor(Date.now() / 1000);
  const since = until - 24 * 60 * 60;
  const [profile, kpis] = await Promise.all([
    fetchProfileDisplay(creds),
    fetchAccountKpis(creds, since, until),
  ]);

  const date = utcDateKey(new Date(since * 1000));
  const snapshot: InstagramSnapshot = {
    date,
    followersCount: profile.followersCount,
    reach: kpis.reach,
    views: kpis.views,
    profileViews: kpis.profileViews,
    accountsEngaged: kpis.accountsEngaged,
    likes: kpis.likes,
    comments: kpis.comments,
    websiteClicks: kpis.websiteClicks,
    createdAt: Date.now(),
  };

  const orgRef = getAdminDb().collection("organizations").doc(organizationId);
  await orgRef.collection("instagramSnapshots").doc(date).set(snapshot);
  // Snapshots are the only writer of the cached profile display fields. The
  // picture URL matters most: it's a signed, expiring CDN URL, and the copy
  // stored at connect time eventually 403s (the avatar falls back to
  // initials) unless something re-fetches it — this daily write is that
  // something.
  await orgRef.update({
    "config.metaIntegration.followersCount": profile.followersCount,
    "config.metaIntegration.mediaCount": profile.mediaCount,
    "config.metaIntegration.instagramUsername": profile.username,
    "config.metaIntegration.instagramName": profile.name,
    "config.metaIntegration.instagramProfilePictureUrl":
      profile.profilePictureUrl,
    "config.metaIntegration.updatedAt": Date.now(),
  });

  return snapshot;
}

export interface SnapshotRunResult {
  total: number;
  succeeded: number;
  failed: number;
  errors: { organizationId: string; error: string }[];
}

/** Snapshots every org with a connected Meta integration. One org's failure never blocks the rest. */
export async function snapshotAllConnectedInstagram(): Promise<SnapshotRunResult> {
  const orgs = await getAdminDb()
    .collection("organizations")
    .where("config.metaIntegration.connected", "==", true)
    .get();

  const result: SnapshotRunResult = {
    total: orgs.size,
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  await Promise.all(
    orgs.docs.map(async (doc) => {
      try {
        await snapshotInstagramForOrg(doc.id);
        result.succeeded += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push({
          organizationId: doc.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }),
  );

  return result;
}
