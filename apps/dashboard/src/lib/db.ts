import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";

import { trace } from "@/lib/db-trace";
import { db, storage } from "@/lib/firebase";

import type {
  Activity,
  ActivityActor,
  Client,
  ClientNote,
  Contract,
  ContractDraftInput,
  DiagnosticRun,
  ItemColumnLayout,
  Lead,
  LibraryItem,
  Organization,
  Project,
  ProjectImagerySet,
  ProjectNote,
  ProjectRoom,
  ProjectRoomItem,
  Proposal,
  Subtask,
  Task,
  Trade,
  UserProfile,
  Vendor,
} from "./types";

// Helper to recursively strip undefined properties, as Firestore throws on undefined.
function cleanUndefined<T>(obj: T): T {
  if (obj === undefined) return null as unknown as T;
  return JSON.parse(JSON.stringify(obj)) as T;
}

// --- CLIENT HELPER HOOKS & FUNCTIONS ---

export async function getClient(uid: string): Promise<Client | null> {
  try {
    return await trace(
      "clients",
      "READ",
      "getClient",
      async () => {
        const docRef = doc(db, "clients", uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          return docSnap.data() as Client;
        }
        return null;
      },
      (c) => (c ? uid : "not found"),
    );
  } catch (error) {
    console.error("Error fetching client:", error);
    return null;
  }
}

export async function getClients(organizationId: string): Promise<Client[]> {
  try {
    return await trace(
      "clients",
      "READ",
      "getClients",
      async () => {
        const collRef = collection(db, "clients");
        const q = query(collRef, where("organizationId", "==", organizationId));
        const filteredSnapshot = await getDocs(q);

        const clients: Client[] = [];
        filteredSnapshot.forEach((doc) => {
          clients.push(doc.data() as Client);
        });

        return clients.sort((a, b) => b.createdAt - a.createdAt);
      },
      (c) => `${c.length} docs`,
    );
  } catch (error) {
    console.error("Error fetching clients:", error);
    return [];
  }
}

// Client creation is server-side (transaction + reference code) in
// `src/server/client-actions.ts` (createClient).

export async function updateClient(
  uid: string,
  client: Partial<Client>,
): Promise<void> {
  return trace(
    "clients",
    "WRITE",
    "updateClient",
    async () => {
      const docRef = doc(db, "clients", uid);
      await updateDoc(docRef, cleanUndefined({ ...client }));
    },
    () => uid,
  );
}

export async function deleteClient(uid: string): Promise<void> {
  return trace(
    "clients",
    "DELETE",
    "deleteClient",
    async () => {
      await deleteDoc(doc(db, "clients", uid));
    },
    () => uid,
  );
}

// --- NOTIFICATIONS ---
// Notifications are created server-only (see src/server/notifications.ts and
// the oshrat lead intake). The only client-SDK mutation rules allow is
// appending your own uid to readBy/dismissedBy — per-user read/dismiss state
// on a shared doc. The bell subscribes with onSnapshot directly (no getter).

export async function markNotificationRead(
  notificationId: string,
  uid: string,
): Promise<void> {
  return trace(
    "notifications",
    "WRITE",
    "markNotificationRead",
    async () => {
      await updateDoc(doc(db, "notifications", notificationId), {
        readBy: arrayUnion(uid),
      });
    },
    () => notificationId,
  );
}

export async function dismissNotification(
  notificationId: string,
  uid: string,
): Promise<void> {
  return trace(
    "notifications",
    "WRITE",
    "dismissNotification",
    async () => {
      await updateDoc(doc(db, "notifications", notificationId), {
        dismissedBy: arrayUnion(uid),
      });
    },
    () => notificationId,
  );
}

// --- ACTIVITY & NOTES ---
// Notes live as parent subcollections (`clients/{clientId}/notes`). Each note
// write is batched with a matching activity in the top-level `activities`
// collection, giving notes an append-only audit trail.

/**
 * Reads a client's notes (`clients/{clientId}/notes`), newest first.
 * Soft-deleted notes are excluded unless `includeDeleted` is set (audit views).
 */
export async function getClientNotes(
  clientId: string,
  options?: { includeDeleted?: boolean },
): Promise<ClientNote[]> {
  try {
    return await trace(
      "clientNotes",
      "READ",
      "getClientNotes",
      async () => {
        const collRef = collection(db, "clients", clientId, "notes");
        const snapshot = await getDocs(collRef);
        const notes: ClientNote[] = [];
        snapshot.forEach((docSnap) => {
          notes.push(docSnap.data() as ClientNote);
        });
        const visible = options?.includeDeleted
          ? notes
          : notes.filter((n) => !n.deletedAt);
        return visible.sort((a, b) => b.createdAt - a.createdAt);
      },
      (n) => `${n.length} docs`,
    );
  } catch (error) {
    console.error("Error fetching client notes:", error);
    return [];
  }
}

/**
 * Creates an append-only client note and writes a matching `note_added`
 * activity in the same atomic batch. Notes are immutable once created.
 */
export async function addClientNote(input: {
  organizationId: string;
  clientId: string;
  body: string;
  author: ActivityActor;
  /** Client display name, denormalized onto the activity's source for the feed. */
  sourceLabel?: string;
}): Promise<ClientNote> {
  return trace(
    "clientNotes",
    "WRITE",
    "addClientNote",
    async () => {
      const { organizationId, clientId, body, author, sourceLabel } = input;
      const now = Date.now();

      const note: ClientNote = {
        id: `note-${Math.random().toString(36).substr(2, 9)}`,
        organizationId,
        clientId,
        body,
        createdBy: author,
        createdAt: now,
      };
      const activity: Activity = {
        id: `act-${Math.random().toString(36).substr(2, 9)}`,
        organizationId,
        type: "note_added",
        actor: author,
        source: { type: "client", id: clientId, label: sourceLabel },
        entity: { type: "note", id: note.id },
        visibility: "internal",
        createdAt: now,
      };

      const batch = writeBatch(db);
      batch.set(
        doc(db, "clients", clientId, "notes", note.id),
        cleanUndefined(note),
      );
      batch.set(doc(db, "activities", activity.id), cleanUndefined(activity));
      await batch.commit();
      return note;
    },
    (n) => n.id,
  );
}

/**
 * Soft-deletes a client note: stamps `deletedAt`/`deletedBy` and writes a
 * matching `note_deleted` activity in the same atomic batch. The note document
 * is never physically removed. Creator-only enforcement is the caller's
 * responsibility (and, ultimately, Firestore security rules).
 */
export async function softDeleteClientNote(input: {
  clientId: string;
  noteId: string;
  organizationId: string;
  actor: ActivityActor;
  /** Client display name, denormalized onto the activity's source for the feed. */
  sourceLabel?: string;
}): Promise<void> {
  return trace(
    "clientNotes",
    "WRITE",
    "softDeleteClientNote",
    async () => {
      const { clientId, noteId, organizationId, actor, sourceLabel } = input;
      const now = Date.now();

      const activity: Activity = {
        id: `act-${Math.random().toString(36).substr(2, 9)}`,
        organizationId,
        type: "note_deleted",
        actor,
        source: { type: "client", id: clientId, label: sourceLabel },
        entity: { type: "note", id: noteId },
        visibility: "internal",
        createdAt: now,
      };

      const batch = writeBatch(db);
      batch.update(
        doc(db, "clients", clientId, "notes", noteId),
        cleanUndefined({
          deletedAt: now,
          deletedBy: actor,
        }),
      );
      batch.set(doc(db, "activities", activity.id), cleanUndefined(activity));
      await batch.commit();
    },
    () => input.noteId,
  );
}

// --- PROJECT NOTES ---
// Editable working notes living at `projects/{projectId}/notes`. Unlike client
// notes these are mutable (the author can edit the body) and hard-deleted. A
// `note_added` activity is written on create only — edits and deletes are silent.

/** Reads a project's notes (`projects/{projectId}/notes`), newest first. */
export async function getProjectNotes(
  projectId: string,
): Promise<ProjectNote[]> {
  try {
    return await trace(
      "projectNotes",
      "READ",
      "getProjectNotes",
      async () => {
        const snapshot = await getDocs(
          collection(db, "projects", projectId, "notes"),
        );
        const notes: ProjectNote[] = [];
        snapshot.forEach((docSnap) => {
          notes.push(docSnap.data() as ProjectNote);
        });
        return notes.sort((a, b) => b.createdAt - a.createdAt);
      },
      (n) => `${n.length} docs`,
    );
  } catch (error) {
    console.error("Error fetching project notes:", error);
    return [];
  }
}

/**
 * Creates a project note and writes a matching `note_added` activity in the same
 * atomic batch (add is the only note action that emits an activity).
 */
export async function addProjectNote(input: {
  organizationId: string;
  projectId: string;
  body: string;
  author: ActivityActor;
  /** Project name, denormalized onto the activity's source for the feed. */
  sourceLabel?: string;
}): Promise<ProjectNote> {
  return trace(
    "projectNotes",
    "WRITE",
    "addProjectNote",
    async () => {
      const { organizationId, projectId, body, author, sourceLabel } = input;
      const now = Date.now();

      const note: ProjectNote = {
        id: `note-${Math.random().toString(36).substr(2, 9)}`,
        organizationId,
        projectId,
        body,
        createdBy: author,
        createdAt: now,
      };
      const activity: Activity = {
        id: `act-${Math.random().toString(36).substr(2, 9)}`,
        organizationId,
        type: "note_added",
        actor: author,
        source: { type: "project", id: projectId, label: sourceLabel },
        entity: { type: "note", id: note.id },
        visibility: "internal",
        createdAt: now,
      };

      const batch = writeBatch(db);
      batch.set(
        doc(db, "projects", projectId, "notes", note.id),
        cleanUndefined(note),
      );
      batch.set(doc(db, "activities", activity.id), cleanUndefined(activity));
      await batch.commit();
      return note;
    },
    (n) => n.id,
  );
}

/** Edits a project note's body in place, stamping `updatedAt`/`updatedBy`. */
export async function updateProjectNote(input: {
  projectId: string;
  noteId: string;
  body: string;
  editor: ActivityActor;
}): Promise<{ updatedAt: number; updatedBy: ActivityActor }> {
  return trace(
    "projectNotes",
    "WRITE",
    "updateProjectNote",
    async () => {
      const { projectId, noteId, body, editor } = input;
      const now = Date.now();
      await updateDoc(
        doc(db, "projects", projectId, "notes", noteId),
        cleanUndefined({ body, updatedAt: now, updatedBy: editor }),
      );
      return { updatedAt: now, updatedBy: editor };
    },
    () => input.noteId,
  );
}

/** Hard-deletes a project note — the document is physically removed. */
export async function deleteProjectNote(
  projectId: string,
  noteId: string,
): Promise<void> {
  return trace(
    "projectNotes",
    "DELETE",
    "deleteProjectNote",
    async () => {
      await deleteDoc(doc(db, "projects", projectId, "notes", noteId));
    },
    () => noteId,
  );
}

// --- LEAD HELPER HOOKS & FUNCTIONS ---

export async function getLead(uid: string): Promise<Lead | null> {
  try {
    return await trace(
      "leads",
      "READ",
      "getLead",
      async () => {
        const docRef = doc(db, "leads", uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          return docSnap.data() as Lead;
        }
        return null;
      },
      (l) => (l ? uid : "not found"),
    );
  } catch (error) {
    console.error("Error fetching lead:", error);
    return null;
  }
}

export async function getLeads(organizationId: string): Promise<Lead[]> {
  try {
    return await trace(
      "leads",
      "READ",
      "getLeads",
      async () => {
        const collRef = collection(db, "leads");
        const q = query(collRef, where("organizationId", "==", organizationId));
        const filteredSnapshot = await getDocs(q);

        const leads: Lead[] = [];
        filteredSnapshot.forEach((doc) => {
          leads.push(doc.data() as Lead);
        });

        return leads.sort((a, b) => b.updatedAt - a.updatedAt);
      },
      (l) => `${l.length} docs`,
    );
  } catch (error) {
    console.error("Error fetching leads:", error);
    return [];
  }
}

export async function addLead(
  lead: Omit<Lead, "uid" | "createdAt" | "updatedAt" | "lastActivityAt">,
): Promise<Lead> {
  return trace(
    "leads",
    "WRITE",
    "addLead",
    async () => {
      const uid = `lead-${Math.random().toString(36).substr(2, 9)}`;
      const now = Date.now();
      const newLead: Lead = {
        ...lead,
        uid,
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
      };
      await setDoc(doc(db, "leads", uid), cleanUndefined(newLead));
      return newLead;
    },
    (l) => l.uid,
  );
}

/**
 * Persists a partial lead update and stamps `updatedAt`/`lastActivityAt`. Callers must pass
 * `updatedBy` (and `assignedAt` when changing `assignedTo`); the returned partial mirrors what
 * was written so the UI can apply an optimistic update.
 */
export async function updateLead(
  uid: string,
  lead: Partial<Lead>,
): Promise<Partial<Lead>> {
  return trace(
    "leads",
    "WRITE",
    "updateLead",
    async () => {
      const now = Date.now();
      const updatedLead: Partial<Lead> = {
        ...lead,
        updatedAt: now,
        lastActivityAt: now,
      };
      await updateDoc(doc(db, "leads", uid), cleanUndefined(updatedLead));
      return updatedLead;
    },
    () => uid,
  );
}

/**
 * Stamps the first time anyone in the org opened the lead's detail page.
 * Deliberately a bare write — not `updateLead` — so viewing a lead doesn't
 * bump `updatedAt`/`lastActivityAt` and reorder the pipeline.
 */
export async function markLeadViewed(uid: string): Promise<void> {
  return trace(
    "leads",
    "WRITE",
    "markLeadViewed",
    async () => {
      await updateDoc(doc(db, "leads", uid), { firstViewedAt: Date.now() });
    },
    () => uid,
  );
}

export async function deleteLead(uid: string): Promise<void> {
  return trace(
    "leads",
    "DELETE",
    "deleteLead",
    async () => {
      await deleteDoc(doc(db, "leads", uid));
    },
    () => uid,
  );
}

// Lead → Client conversion is server-side (transaction + reference code) in
// `src/server/lead-actions.ts` (convertLeadToClient).

// --- VENDOR HELPER HOOKS & FUNCTIONS ---

export async function getVendor(vendorId: string): Promise<Vendor | null> {
  try {
    return await trace(
      "vendors",
      "READ",
      "getVendor",
      async () => {
        const docRef = doc(db, "vendors", vendorId);
        const snapshot = await getDoc(docRef);
        if (!snapshot.exists()) return null;
        return snapshot.data() as Vendor;
      },
      (v) => (v ? vendorId : "not found"),
    );
  } catch (error) {
    console.error("Error fetching vendor:", error);
    return null;
  }
}

export async function getVendors(organizationId: string): Promise<Vendor[]> {
  try {
    return await trace(
      "vendors",
      "READ",
      "getVendors",
      async () => {
        const collRef = collection(db, "vendors");
        const q = query(collRef, where("organizationId", "==", organizationId));
        const filteredSnapshot = await getDocs(q);

        const vendors: Vendor[] = [];
        filteredSnapshot.forEach((doc) => {
          vendors.push(doc.data() as Vendor);
        });

        return vendors.sort((a, b) => b.createdAt - a.createdAt);
      },
      (v) => `${v.length} docs`,
    );
  } catch (error) {
    console.error("Error fetching vendors:", error);
    return [];
  }
}

export async function addVendor(
  vendor: Omit<Vendor, "vendorId" | "createdAt">,
  customVendorId?: string,
): Promise<Vendor> {
  return trace(
    "vendors",
    "WRITE",
    "addVendor",
    async () => {
      const vendorId =
        customVendorId ?? `vendor-${Math.random().toString(36).substr(2, 9)}`;
      const newVendor: Vendor = {
        ...vendor,
        vendorId,
        createdAt: Date.now(),
      };
      await setDoc(doc(db, "vendors", vendorId), cleanUndefined(newVendor));
      return newVendor;
    },
    (v) => v.vendorId,
  );
}

export async function updateVendor(
  vendorId: string,
  vendor: Partial<Vendor>,
): Promise<void> {
  return trace(
    "vendors",
    "WRITE",
    "updateVendor",
    async () => {
      const docRef = doc(db, "vendors", vendorId);
      await updateDoc(docRef, cleanUndefined({ ...vendor }));
    },
    () => vendorId,
  );
}

export async function deleteStorageFileByPath(path: string): Promise<void> {
  if (!path || path.trim() === "") return;
  try {
    const fileRef = ref(storage, path);
    await deleteObject(fileRef);
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "storage/object-not-found"
    ) {
      console.warn(`File not found in storage (ignored): ${path}`);
      return;
    }
    console.error(`Failed to delete storage object at ${path}:`, error);
    throw error;
  }
}

function compactStoragePaths(
  paths: Array<string | null | undefined>,
): string[] {
  return [
    ...new Set(
      paths.filter(
        (path): path is string =>
          typeof path === "string" && path.trim().length > 0,
      ),
    ),
  ];
}

export async function deleteStorageFilesByPath(
  paths: Array<string | null | undefined>,
): Promise<void> {
  const storagePaths = compactStoragePaths(paths);
  if (storagePaths.length === 0) return;

  const results = await Promise.allSettled(
    storagePaths.map(deleteStorageFileByPath),
  );
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    const error = (failures[0] as PromiseRejectedResult).reason;
    throw new Error(error.message || String(error));
  }
}

export async function deleteReplacedStorageFiles(
  previousPaths: Array<string | null | undefined>,
  nextPaths: Array<string | null | undefined>,
): Promise<void> {
  const nextPathSet = new Set(compactStoragePaths(nextPaths));
  const pathsToDelete = compactStoragePaths(previousPaths).filter(
    (path) => !nextPathSet.has(path),
  );
  await deleteStorageFilesByPath(pathsToDelete);
}

export async function deleteVendor(vendorOrId: Vendor | string): Promise<void> {
  return trace(
    "vendors",
    "DELETE",
    "deleteVendor",
    async () => {
      let vendor: Vendor | null = null;
      if (typeof vendorOrId === "string") {
        vendor = await getVendor(vendorOrId);
      } else {
        vendor = vendorOrId;
      }
      if (!vendor) return;

      const paths = [vendor.logoPath, vendor.heroImagePath].filter(
        (p): p is string => typeof p === "string" && p.trim().length > 0,
      );

      const results = await Promise.allSettled(
        paths.map((p) => deleteStorageFileByPath(p)),
      );

      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        const error = (failures[0] as PromiseRejectedResult).reason;
        throw new Error(
          `Failed to clean up storage files: ${error.message || error}`,
        );
      }

      await deleteDoc(doc(db, "vendors", vendor.vendorId));
    },
    () => (typeof vendorOrId === "string" ? vendorOrId : vendorOrId.vendorId),
  );
}

// --- PROJECT HELPER HOOKS & FUNCTIONS ---

export async function getProject(projectId: string): Promise<Project | null> {
  try {
    return await trace(
      "projects",
      "READ",
      "getProject",
      async () => {
        const docRef = doc(db, "projects", projectId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          return docSnap.data() as Project;
        }
        return null;
      },
      (p) => (p ? projectId : "not found"),
    );
  } catch (error) {
    console.error("Error fetching project:", error);
    return null;
  }
}

export async function getProjects(organizationId: string): Promise<Project[]> {
  try {
    return await trace(
      "projects",
      "READ",
      "getProjects",
      async () => {
        const collRef = collection(db, "projects");
        const q = query(collRef, where("organizationId", "==", organizationId));
        const filteredSnapshot = await getDocs(q);

        const projects: Project[] = [];
        filteredSnapshot.forEach((doc) => {
          projects.push(doc.data() as Project);
        });

        return projects.sort((a, b) => b.createdAt - a.createdAt);
      },
      (p) => `${p.length} docs`,
    );
  } catch (error) {
    console.error("Error fetching projects:", error);
    return [];
  }
}

/** Build the denormalized single-line `address` from the discrete street/city/state/zip parts. */
export function formatProjectAddress(
  parts: Pick<Project, "street" | "city" | "state" | "zip">,
): string {
  return [
    parts.street,
    [parts.city, parts.state].filter(Boolean).join(", "),
    parts.zip,
  ]
    .filter(Boolean)
    .join(" ");
}

// Project creation is server-side (transaction + reference code) in
// `src/server/project-actions.ts` (createProject).

/**
 * Persists a partial project update and stamps `updatedAt`/`lastActivityAt`. Callers must pass
 * `updatedBy`; the returned partial mirrors what was written so the UI can apply an optimistic update.
 */
export async function updateProject(
  projectId: string,
  project: Partial<Project>,
): Promise<Partial<Project>> {
  return trace(
    "projects",
    "WRITE",
    "updateProject",
    async () => {
      const now = Date.now();
      const updatedProject: Partial<Project> = {
        ...project,
        updatedAt: now,
        lastActivityAt: now,
      };

      await updateDoc(
        doc(db, "projects", projectId),
        cleanUndefined(updatedProject),
      );
      return updatedProject;
    },
    () => projectId,
  );
}

// Persists the shared items-grid column layout. Kept separate from
// `updateProject` so a column toggle/resize doesn't bump `lastActivityAt` (it's
// a presentation tweak, not project activity).
export async function updateProjectItemsLayout(
  projectId: string,
  itemColumnLayout: ItemColumnLayout,
): Promise<void> {
  return trace(
    "projects",
    "WRITE",
    "updateProjectItemsLayout",
    async () => {
      await updateDoc(
        doc(db, "projects", projectId),
        cleanUndefined({ itemColumnLayout, updatedAt: Date.now() }),
      );
    },
    () => projectId,
  );
}

// Persists the Dropbox folders linked to a project's image sets (Settings tab).
// Kept separate from `updateProject` so linking a folder doesn't bump
// `lastActivityAt` (it's a settings tweak, not project activity).
export async function updateProjectImagerySets(
  projectId: string,
  imagerySets: Record<string, ProjectImagerySet>,
): Promise<void> {
  return trace(
    "projects",
    "WRITE",
    "updateProjectImagerySets",
    async () => {
      await updateDoc(
        doc(db, "projects", projectId),
        cleanUndefined({ imagerySets, updatedAt: Date.now() }),
      );
    },
    () => projectId,
  );
}

export async function deleteProject(projectId: string): Promise<void> {
  return trace(
    "projects",
    "DELETE",
    "deleteProject",
    async () => {
      await deleteDoc(doc(db, "projects", projectId));
    },
    () => projectId,
  );
}

// --- LIBRARY HELPER HOOKS & FUNCTIONS ---

export async function getLibraryItem(
  itemId: string,
): Promise<LibraryItem | null> {
  try {
    return await trace(
      "library",
      "READ",
      "getLibraryItem",
      async () => {
        const docRef = doc(db, "library", itemId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          return docSnap.data() as LibraryItem;
        }
        return null;
      },
      (i) => (i ? itemId : "not found"),
    );
  } catch (error) {
    console.error("Error fetching library item:", error);
    return null;
  }
}

export async function getLibraryItems(
  organizationId: string,
): Promise<LibraryItem[]> {
  try {
    return await trace(
      "library",
      "READ",
      "getLibraryItems",
      async () => {
        const collRef = collection(db, "library");
        const q = query(collRef, where("organizationId", "==", organizationId));
        const filteredSnapshot = await getDocs(q);

        const items: LibraryItem[] = [];
        filteredSnapshot.forEach((doc) => {
          items.push(doc.data() as LibraryItem);
        });

        return items.sort((a, b) => b.updatedAt - a.updatedAt);
      },
      (i) => `${i.length} docs`,
    );
  } catch (error) {
    console.error("Error fetching library items:", error);
    return [];
  }
}

export async function getVendorLibraryItems(
  organizationId: string,
  vendorId: string,
): Promise<LibraryItem[]> {
  try {
    return await trace(
      "library",
      "READ",
      "getVendorLibraryItems",
      async () => {
        const collRef = collection(db, "library");
        const q = query(
          collRef,
          where("organizationId", "==", organizationId),
          where("vendorId", "==", vendorId),
        );
        const snapshot = await getDocs(q);
        const items: LibraryItem[] = [];
        snapshot.forEach((docSnap) => {
          items.push(docSnap.data() as LibraryItem);
        });
        return items.sort((a, b) => b.updatedAt - a.updatedAt);
      },
      (i) => `${i.length} docs`,
    );
  } catch (error) {
    console.error("Error fetching vendor library items:", error);
    return [];
  }
}

export async function addLibraryItem(
  item: Omit<LibraryItem, "itemId" | "updatedAt">,
  customItemId?: string,
): Promise<LibraryItem> {
  return trace(
    "library",
    "WRITE",
    "addLibraryItem",
    async () => {
      const itemId =
        customItemId ?? `item-${Math.random().toString(36).substr(2, 9)}`;
      const newItem: LibraryItem = {
        ...item,
        itemId,
        updatedAt: Date.now(),
      };
      await setDoc(doc(db, "library", itemId), cleanUndefined(newItem));
      return newItem;
    },
    (i) => i.itemId,
  );
}

export async function updateLibraryItem(
  itemId: string,
  item: Partial<LibraryItem>,
): Promise<void> {
  return trace(
    "library",
    "WRITE",
    "updateLibraryItem",
    async () => {
      const docRef = doc(db, "library", itemId);
      await updateDoc(
        docRef,
        cleanUndefined({ ...item, updatedAt: Date.now() }),
      );
    },
    () => itemId,
  );
}

export async function deleteLibraryItem(
  itemOrId: LibraryItem | string,
): Promise<void> {
  return trace(
    "library",
    "DELETE",
    "deleteLibraryItem",
    async () => {
      let item: LibraryItem | null = null;
      if (typeof itemOrId === "string") {
        item = await getLibraryItem(itemOrId);
      } else {
        item = itemOrId;
      }
      if (!item) return;

      const paths = [
        item.coverImagePath,
        ...(item.images || []).map((img) => img.path),
      ].filter(
        (p): p is string => typeof p === "string" && p.trim().length > 0,
      );

      const results = await Promise.allSettled(
        paths.map((p) => deleteStorageFileByPath(p)),
      );

      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        const error = (failures[0] as PromiseRejectedResult).reason;
        throw new Error(
          `Failed to clean up storage files: ${error.message || error}`,
        );
      }

      await deleteDoc(doc(db, "library", item.itemId));
    },
    () => (typeof itemOrId === "string" ? itemOrId : itemOrId.itemId),
  );
}

// --- PROPOSAL HELPER HOOKS & FUNCTIONS ---

export async function getProposals(
  organizationId: string,
): Promise<Proposal[]> {
  try {
    return await trace(
      "proposals",
      "READ",
      "getProposals",
      async () => {
        const collRef = collection(db, "proposals");
        const q = query(collRef, where("organizationId", "==", organizationId));
        const snapshot = await getDocs(q);

        const proposals: Proposal[] = [];
        snapshot.forEach((doc) => {
          proposals.push(doc.data() as Proposal);
        });

        return proposals.sort((a, b) => b.createdAt - a.createdAt);
      },
      (p) => `${p.length} docs`,
    );
  } catch (error) {
    console.error("Error fetching proposals:", error);
    return [];
  }
}

export async function addProposal(
  proposal: Omit<Proposal, "proposalId" | "createdAt">,
): Promise<Proposal> {
  return trace(
    "proposals",
    "WRITE",
    "addProposal",
    async () => {
      const proposalId = `proposal-${Math.random().toString(36).substr(2, 9)}`;
      const newProposal: Proposal = {
        ...proposal,
        proposalId,
        createdAt: Date.now(),
      };
      await setDoc(
        doc(db, "proposals", proposalId),
        cleanUndefined(newProposal),
      );
      return newProposal;
    },
    (p) => p.proposalId,
  );
}

export async function updateProposal(
  proposalId: string,
  proposal: Partial<Proposal>,
): Promise<void> {
  return trace(
    "proposals",
    "WRITE",
    "updateProposal",
    async () => {
      const docRef = doc(db, "proposals", proposalId);
      await updateDoc(docRef, cleanUndefined({ ...proposal }));
    },
    () => proposalId,
  );
}

export async function deleteProposal(proposalId: string): Promise<void> {
  return trace(
    "proposals",
    "DELETE",
    "deleteProposal",
    async () => {
      await deleteDoc(doc(db, "proposals", proposalId));
    },
    () => proposalId,
  );
}

// --- STORAGE HELPER FUNCTIONS ---

/**
 * Cache header for uploaded media. Safe to cache "forever" because every upload
 * (a new random-id path, or an overwrite — which mints a fresh download token)
 * produces a NEW download URL. A changed image is therefore always a new cache
 * key, so browsers, next/image's optimizer, and any CDN never serve a stale image
 * and never need to revalidate. This is the fix for image freshness — not a TTL.
 */
const IMMUTABLE_MEDIA_CACHE = "public, max-age=31536000, immutable";

export async function uploadLibraryImage(
  organizationId: string,
  file: File,
  itemId?: string,
  imageId?: string,
): Promise<{ url: string; path: string }> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const id = imageId ?? `img-${Math.random().toString(36).substr(2, 9)}`;
  const resolvedItemId =
    itemId ?? `temp-${Math.random().toString(36).substr(2, 9)}`;
  const storagePath = `library/${organizationId}/${resolvedItemId}/images/${id}.${ext}`;
  const storageRef = ref(storage, storagePath);

  // Upload raw file bytes
  const snapshot = await uploadBytes(storageRef, file, {
    cacheControl: IMMUTABLE_MEDIA_CACHE,
  });

  // Get public CDN download URL
  const url = await getDownloadURL(snapshot.ref);
  return { url, path: storagePath };
}

export async function uploadVendorImage(
  organizationId: string,
  file: File,
  type: "logo" | "hero",
  vendorId?: string,
): Promise<{ url: string; path: string }> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const resolvedVendorId =
    vendorId ?? `temp-${Math.random().toString(36).substr(2, 9)}`;
  const storagePath = `vendors/${organizationId}/${resolvedVendorId}/${type}.${ext}`;
  const storageRef = ref(storage, storagePath);
  const snapshot = await uploadBytes(storageRef, file, {
    cacheControl: IMMUTABLE_MEDIA_CACHE,
  });
  const url = await getDownloadURL(snapshot.ref);
  return { url, path: storagePath };
}

/**
 * Uploads a raw image Blob (e.g. an external product image fetched server-side and
 * rebuilt on the client) to Firebase Storage and returns its public download URL.
 * Used when mirroring AI-sourced vendor images so library items self-host their images.
 */
export async function uploadLibraryImageBlob(
  organizationId: string,
  blob: Blob,
  itemId: string,
  imageId?: string,
  extension = "jpg",
): Promise<{ url: string; path: string }> {
  const id = imageId ?? `img-${Math.random().toString(36).substr(2, 9)}`;
  const storagePath = `library/${organizationId}/${itemId}/images/${id}.${extension}`;
  const storageRef = ref(storage, storagePath);

  const snapshot = await uploadBytes(storageRef, blob, {
    contentType: blob.type || `image/${extension}`,
    cacheControl: IMMUTABLE_MEDIA_CACHE,
  });
  const url = await getDownloadURL(snapshot.ref);
  return { url, path: storagePath };
}

export async function uploadOrgBrandingImage(
  file: File,
  type: "logo" | "logo-light" | "logo-dark" | "icon-light" | "icon-dark",
  organizationId: string,
): Promise<{ url: string; path: string }> {
  const ext = file.name.split(".").pop() ?? "png";
  const storagePath = `organizations/${organizationId}/branding/${type}.${ext}`;
  const storageRef = ref(storage, storagePath);
  const snapshot = await uploadBytes(storageRef, file, {
    cacheControl: IMMUTABLE_MEDIA_CACHE,
  });
  const url = await getDownloadURL(snapshot.ref);
  return { url, path: storagePath };
}

/**
 * Uploads a raw image Blob to Firebase Storage under the vendors folder
 * and returns its public download URL.
 */
export async function uploadVendorImageBlob(
  organizationId: string,
  blob: Blob,
  type: "logo" | "hero",
  vendorId: string,
  extension = "jpg",
): Promise<{ url: string; path: string }> {
  const storagePath = `vendors/${organizationId}/${vendorId}/${type}.${extension}`;
  const storageRef = ref(storage, storagePath);

  const snapshot = await uploadBytes(storageRef, blob, {
    contentType: blob.type || `image/${extension}`,
    cacheControl: IMMUTABLE_MEDIA_CACHE,
  });
  const url = await getDownloadURL(snapshot.ref);
  return { url, path: storagePath };
}

// --- DIAGNOSTICS HELPER FUNCTIONS ---

export async function saveDiagnosticRun(
  run: Omit<DiagnosticRun, "runId" | "createdAt">,
): Promise<DiagnosticRun> {
  return trace(
    "diagnostics",
    "WRITE",
    "saveDiagnosticRun",
    async () => {
      const runId = `run-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const newRun: DiagnosticRun = {
        ...run,
        runId,
        createdAt: Date.now(),
      };
      await setDoc(doc(db, "code", runId), cleanUndefined(newRun));
      return newRun;
    },
    (r) => r.runId,
  );
}

export async function getDiagnosticRuns(): Promise<DiagnosticRun[]> {
  try {
    return await trace(
      "diagnostics",
      "READ",
      "getDiagnosticRuns",
      async () => {
        const collRef = collection(db, "code");
        const snapshot = await getDocs(collRef);
        const runs: DiagnosticRun[] = [];
        snapshot.forEach((docSnap) => {
          runs.push(docSnap.data() as DiagnosticRun);
        });
        return runs.sort((a, b) => b.createdAt - a.createdAt);
      },
      (r) => `${r.length} docs`,
    );
  } catch (error) {
    console.error("Error fetching diagnostic runs:", error);
    return [];
  }
}

export async function clearDiagnosticRuns(): Promise<void> {
  try {
    await trace("diagnostics", "DELETE", "clearDiagnosticRuns", async () => {
      const collRef = collection(db, "code");
      const snapshot = await getDocs(collRef);
      for (const docSnap of snapshot.docs) {
        await deleteDoc(doc(db, "code", docSnap.id));
      }
    });
  } catch (error) {
    console.error("Error clearing diagnostic runs:", error);
  }
}

// --- ORGANIZATION / TENANT HELPER FUNCTIONS ---

export async function getOrganizations(): Promise<Organization[]> {
  try {
    return await trace(
      "organizations",
      "READ",
      "getOrganizations",
      async () => {
        const collRef = collection(db, "organizations");
        const snapshot = await getDocs(collRef);
        const organizations: Organization[] = [];
        snapshot.forEach((docSnap) => {
          organizations.push(docSnap.data() as Organization);
        });
        return organizations.sort((a, b) => b.createdAt - a.createdAt);
      },
      (o) => `${o.length} docs`,
    );
  } catch (error) {
    console.error("Error fetching organizations:", error);
    return [];
  }
}

export async function updateOrganization(
  orgId: string,
  org: Partial<Organization>,
): Promise<void> {
  return trace(
    "organizations",
    "WRITE",
    "updateOrganization",
    async () => {
      const docRef = doc(db, "organizations", orgId);
      await updateDoc(docRef, cleanUndefined({ ...org }));
    },
    () => orgId,
  );
}

export async function getOrganization(
  orgId: string,
): Promise<Organization | null> {
  try {
    return await trace(
      "organizations",
      "READ",
      "getOrganization",
      async () => {
        const docRef = doc(db, "organizations", orgId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          return docSnap.data() as Organization;
        }
        return null;
      },
      (o) => (o ? orgId : "not found"),
    );
  } catch (error) {
    console.error("Error fetching organization:", error);
    return null;
  }
}

export async function getOrganizationUsers(
  orgId: string,
): Promise<UserProfile[]> {
  try {
    return await trace(
      "users",
      "READ",
      "getOrganizationUsers",
      async () => {
        const collRef = collection(db, "users");
        const q = query(collRef, where("organizationId", "==", orgId));
        const snapshot = await getDocs(q);
        const users: UserProfile[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          users.push({
            uid: docSnap.id,
            fullName: data.fullName || "User",
            displayName: data.displayName,
            email: data.email || "",
            role: data.role || "Contributor",
            organizationId: data.organizationId || "",
            status: data.status || "Active",
            joinedDate: data.joinedDate || "",
            lastActive: data.lastActive || 0,
            location: data.location,
            phone: data.phone,
          } as UserProfile);
        });
        return users.sort((a, b) => b.lastActive - a.lastActive);
      },
      (u) => `${u.length} docs`,
    );
  } catch (error) {
    console.error("Error fetching organization users:", error);
    return [];
  }
}

// --- PROJECT SELECTIONS TAB (ROOMS & ITEMS) HELPER FUNCTIONS ---

export async function addProjectRoom(
  room: Omit<ProjectRoom, "roomId" | "createdAt" | "updatedAt">,
  customRoomId?: string,
): Promise<ProjectRoom> {
  return trace(
    "projectRooms",
    "WRITE",
    "addProjectRoom",
    async () => {
      const roomId =
        customRoomId ?? `room-${Math.random().toString(36).substr(2, 9)}`;
      const newRoom: ProjectRoom = {
        ...room,
        roomId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await setDoc(doc(db, "projectRooms", roomId), cleanUndefined(newRoom));
      return newRoom;
    },
    (r) => r.roomId,
  );
}

export async function updateProjectRoom(
  roomId: string,
  room: Partial<Pick<ProjectRoom, "name" | "description">>,
): Promise<void> {
  return trace(
    "projectRooms",
    "WRITE",
    "updateProjectRoom",
    async () => {
      await updateDoc(
        doc(db, "projectRooms", roomId),
        cleanUndefined({ ...room, updatedAt: Date.now() }),
      );
    },
    () => roomId,
  );
}

// Deletes an empty section. Callers must move or delete the section's items
// first; this only removes the room document.
export async function deleteProjectRoom(roomId: string): Promise<void> {
  return trace(
    "projectRooms",
    "DELETE",
    "deleteProjectRoom",
    async () => {
      await deleteDoc(doc(db, "projectRooms", roomId));
    },
    () => roomId,
  );
}

export async function getProjectRooms(
  projectId: string,
): Promise<ProjectRoom[]> {
  try {
    return await trace(
      "projectRooms",
      "READ",
      "getProjectRooms",
      async () => {
        const collRef = collection(db, "projectRooms");
        const q = query(collRef, where("projectId", "==", projectId));
        const snapshot = await getDocs(q);
        const rooms: ProjectRoom[] = [];
        snapshot.forEach((docSnap) => {
          rooms.push(docSnap.data() as ProjectRoom);
        });

        return rooms.sort((a, b) => a.createdAt - b.createdAt);
      },
      (r) => `${r.length} docs`,
    );
  } catch (error) {
    console.error("Error fetching project rooms:", error);
    return [];
  }
}

export async function getProjectRoomItems(
  projectId: string,
): Promise<ProjectRoomItem[]> {
  try {
    return await trace(
      "projectRoomItems",
      "READ",
      "getProjectRoomItems",
      async () => {
        const collRef = collection(db, "projectRoomItems");
        const q = query(collRef, where("projectId", "==", projectId));
        const snapshot = await getDocs(q);
        const items: ProjectRoomItem[] = [];
        snapshot.forEach((docSnap) => {
          items.push(docSnap.data() as ProjectRoomItem);
        });
        return items.sort(
          (a, b) => (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt),
        );
      },
      (i) => `${i.length} docs`,
    );
  } catch (error) {
    console.error("Error fetching project room items:", error);
    return [];
  }
}

export async function addProjectRoomItem(
  item: Omit<ProjectRoomItem, "roomItemId" | "createdAt" | "updatedAt">,
  customRoomItemId?: string,
): Promise<ProjectRoomItem> {
  return trace(
    "projectRoomItems",
    "WRITE",
    "addProjectRoomItem",
    async () => {
      const roomItemId =
        customRoomItemId ??
        `roomitem-${Math.random().toString(36).substr(2, 9)}`;
      const newRoomItem: ProjectRoomItem = {
        ...item,
        roomItemId,
        // New items append to the end of their section until manually reordered.
        sortOrder: item.sortOrder ?? Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await setDoc(
        doc(db, "projectRoomItems", roomItemId),
        cleanUndefined(newRoomItem),
      );
      return newRoomItem;
    },
    (i) => i.roomItemId,
  );
}

export async function updateProjectRoomItem(
  roomItemId: string,
  item: Partial<
    Omit<
      ProjectRoomItem,
      "roomItemId" | "projectId" | "roomId" | "organizationId" | "createdAt"
    >
  >,
): Promise<void> {
  return trace(
    "projectRoomItems",
    "WRITE",
    "updateProjectRoomItem",
    async () => {
      await updateDoc(
        doc(db, "projectRoomItems", roomItemId),
        cleanUndefined({ ...item, updatedAt: Date.now() }),
      );
    },
    () => roomItemId,
  );
}

/**
 * Persist a manual drag-sort order for a section's items in one batch. Each
 * entry's `sortOrder` becomes its new position (lower sorts first). Pass
 * `roomId` for an item that was dragged in from another section to re-home it.
 */
export async function reorderProjectRoomItems(
  updates: { roomItemId: string; sortOrder: number; roomId?: string }[],
): Promise<void> {
  return trace(
    "projectRoomItems",
    "WRITE",
    "reorderProjectRoomItems",
    async () => {
      const batch = writeBatch(db);
      for (const { roomItemId, sortOrder, roomId } of updates) {
        batch.update(
          doc(db, "projectRoomItems", roomItemId),
          roomId ? { sortOrder, roomId } : { sortOrder },
        );
      }
      await batch.commit();
    },
    () => `${updates.length} items`,
  );
}

export async function deleteProjectRoomItem(roomItemId: string): Promise<void> {
  return trace(
    "projectRoomItems",
    "WRITE",
    "deleteProjectRoomItem",
    async () => {
      await deleteDoc(doc(db, "projectRoomItems", roomItemId));
    },
    () => roomItemId,
  );
}

// --- TRADES & SERVICES DATA HELPERS ---

export async function getTrade(tradeId: string): Promise<Trade | null> {
  try {
    return await trace(
      "trades",
      "READ",
      "getTrade",
      async () => {
        const docSnap = await getDoc(doc(db, "trades", tradeId));
        if (!docSnap.exists()) return null;
        return docSnap.data() as Trade;
      },
      (t) => (t ? tradeId : "not found"),
    );
  } catch (error) {
    console.error("Error fetching trade:", error);
    return null;
  }
}

export async function getTrades(organizationId: string): Promise<Trade[]> {
  try {
    return await trace(
      "trades",
      "READ",
      "getTrades",
      async () => {
        const collRef = collection(db, "trades");
        const q = query(collRef, where("organizationId", "==", organizationId));
        const snapshot = await getDocs(q);
        const trades: Trade[] = [];
        snapshot.forEach((docSnap) => {
          trades.push(docSnap.data() as Trade);
        });
        return trades.sort((a, b) => b.createdAt - a.createdAt);
      },
      (t) => `${t.length} docs`,
    );
  } catch (error) {
    console.error("Error fetching trades:", error);
    return [];
  }
}

export async function addTrade(
  trade: Omit<Trade, "tradeId" | "createdAt">,
  customTradeId?: string,
): Promise<Trade> {
  return trace(
    "trades",
    "WRITE",
    "addTrade",
    async () => {
      const tradeId =
        customTradeId ?? `trade-${Math.random().toString(36).substr(2, 9)}`;
      const newTrade: Trade = {
        ...trade,
        tradeId,
        createdAt: Date.now(),
      };
      await setDoc(doc(db, "trades", tradeId), cleanUndefined(newTrade));
      return newTrade;
    },
    (t) => t.tradeId,
  );
}

export async function updateTrade(
  tradeId: string,
  trade: Partial<Trade>,
): Promise<void> {
  return trace(
    "trades",
    "WRITE",
    "updateTrade",
    async () => {
      const docRef = doc(db, "trades", tradeId);
      await updateDoc(docRef, cleanUndefined({ ...trade }));
    },
    () => tradeId,
  );
}

export async function deleteTrade(tradeId: string): Promise<void> {
  return trace(
    "trades",
    "DELETE",
    "deleteTrade",
    async () => {
      await deleteDoc(doc(db, "trades", tradeId));
    },
    () => tradeId,
  );
}

// --- CONTRACT HELPER FUNCTIONS ---
// Flat `contracts` collection, org-scoped. Drafts persist only editable inputs;
// `sendContract` freezes the rendered document into `lockedSnapshot` (the future
// client portal reads that, never the live draft fields). Numeric epoch-ms
// timestamps throughout, matching the rest of the app (so `cleanUndefined`'s
// JSON round-trip stays safe — no Firestore sentinels are written).

// Draft contract creation is server-side (transaction + reference code) in
// `src/server/contract-actions.ts` (createContract).

/**
 * Update a draft contract's editable fields. Preserves organizationId, createdBy,
 * createdAt, and lockedSnapshot (never passed here). Callers must not invoke this
 * for sent/signed/void contracts — those are locked.
 */
export async function updateContract(
  contractId: string,
  userId: string,
  data: Partial<ContractDraftInput>,
): Promise<void> {
  return trace(
    "contracts",
    "WRITE",
    "updateContract",
    async () => {
      const docRef = doc(db, "contracts", contractId);
      await updateDoc(
        docRef,
        cleanUndefined({ ...data, updatedBy: userId, updatedAt: Date.now() }),
      );
    },
    () => contractId,
  );
}

export async function getContract(
  contractId: string,
): Promise<Contract | null> {
  try {
    return await trace(
      "contracts",
      "READ",
      "getContract",
      async () => {
        const docRef = doc(db, "contracts", contractId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          return docSnap.data() as Contract;
        }
        return null;
      },
      (c) => (c ? contractId : "not found"),
    );
  } catch (error) {
    console.error("Error fetching contract:", error);
    return null;
  }
}

export async function getContracts(
  organizationId: string,
): Promise<Contract[]> {
  try {
    return await trace(
      "contracts",
      "READ",
      "getContracts",
      async () => {
        const collRef = collection(db, "contracts");
        const q = query(collRef, where("organizationId", "==", organizationId));
        const filteredSnapshot = await getDocs(q);

        const contracts: Contract[] = [];
        filteredSnapshot.forEach((d) => {
          contracts.push(d.data() as Contract);
        });

        // Sort in memory (newest first) to avoid a composite index, matching
        // the clients/projects pattern.
        return contracts.sort((a, b) => b.updatedAt - a.updatedAt);
      },
      (c) => `${c.length} docs`,
    );
  } catch (error) {
    console.error("Error fetching contracts:", error);
    return [];
  }
}

// --- TASKS ---
// Reads are participant-scoped by firestore.rules: unless you're an Admin, the
// query MUST constrain on participantIds or Firestore rejects the whole list.
// Creates and assignee edits go through src/server/task-actions.ts (admin SDK)
// because participantIds is the read gate and must be derived, not trusted.
// The writes below are the hot path rules already allow: ticking a checkbox and
// marking a task complete.

/**
 * Open tasks for one org. Pass the viewer's uid to scope to tasks they're on;
 * pass null only for Admins/SuperAdmins, who read the whole org (All Tasks).
 * Completed tasks are filtered server-side — they leave every view on
 * completion and would otherwise accumulate forever in the payload.
 */
export async function getTasks(
  organizationId: string,
  participantUid: string | null,
): Promise<Task[]> {
  try {
    return await trace(
      "tasks",
      "READ",
      "getTasks",
      async () => {
        const collRef = collection(db, "tasks");
        const constraints = [
          where("organizationId", "==", organizationId),
          where("completed", "==", false),
        ];
        if (participantUid)
          constraints.push(
            where("participantIds", "array-contains", participantUid),
          );
        const snapshot = await getDocs(query(collRef, ...constraints));

        const tasks: Task[] = [];
        snapshot.forEach((docSnap) => {
          tasks.push(docSnap.data() as Task);
        });
        return sortTasksByDue(tasks);
      },
      (t) => `${t.length} docs`,
    );
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return [];
  }
}

/** Soonest first, undated last — the order both task views render in. */
export function sortTasksByDue(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.dueAt == null && b.dueAt == null) return b.createdAt - a.createdAt;
    if (a.dueAt == null) return 1;
    if (b.dueAt == null) return -1;
    return a.dueAt - b.dueAt;
  });
}

/**
 * Complete / un-complete. Completed tasks disappear from every view, so the
 * caller pairs this with an Undo toast that calls it again with `false`.
 */
export async function setTaskCompleted(
  taskId: string,
  completed: boolean,
  actor: ActivityActor,
): Promise<void> {
  return trace(
    "tasks",
    "WRITE",
    "setTaskCompleted",
    async () => {
      await updateDoc(doc(db, "tasks", taskId), {
        completed,
        completedAt: completed ? Date.now() : null,
        completedBy: completed ? actor : null,
        updatedBy: actor,
        updatedAt: Date.now(),
      });
    },
    () => taskId,
  );
}

/**
 * Tick a subtask. Subtasks are an embedded array, so the caller sends the whole
 * next array — one write, and no way for two rows to race into a half-applied
 * state. Never touches participantIds: assignee changes go through the server
 * action, this is only the done flag.
 */
export async function setTaskSubtasks(
  taskId: string,
  subtasks: Subtask[],
  actor: ActivityActor,
): Promise<void> {
  return trace(
    "tasks",
    "WRITE",
    "setTaskSubtasks",
    async () => {
      await updateDoc(doc(db, "tasks", taskId), {
        subtasks,
        updatedBy: actor,
        updatedAt: Date.now(),
      });
    },
    () => taskId,
  );
}

/** Permanent by design — any participant may delete, and nothing is retained. */
export async function deleteTask(taskId: string): Promise<void> {
  return trace(
    "tasks",
    "DELETE",
    "deleteTask",
    async () => {
      await deleteDoc(doc(db, "tasks", taskId));
    },
    () => taskId,
  );
}
