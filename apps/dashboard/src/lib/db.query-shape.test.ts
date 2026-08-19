import { beforeEach, describe, expect, it, vi } from "vitest";

// Query-shape guardrail: each list getter in db.ts must issue exactly one
// Firestore query (getDocs) and zero per-document fetches (getDoc). The mock
// returns MULTIPLE docs on purpose — an N+1 regression (fetching a doc per
// result row) only shows up when the query result is non-empty. We assert
// call counts, not document counts: docs read scale with data, calls issued
// scale with code, and only the latter is a stable contract.

vi.mock("@/lib/firebase", () => ({ db: {}, storage: {} }));
vi.mock("@/lib/db-trace", () => ({
  trace: (_section: string, _op: string, _fn: string, work: () => unknown) =>
    work(),
}));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({
    _path: path.join("/"),
  })),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ _path: path.join("/") })),
  query: vi.fn((ref: unknown) => ref),
  where: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
}));
vi.mock("firebase/storage", () => ({
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
}));

import { collection, getDoc, getDocs } from "firebase/firestore";

import {
  getClientNotes,
  getClients,
  getContracts,
  getLeads,
  getLibraryItems,
  getOrganizationUsers,
  getProjectNotes,
  getProjectRoomItems,
  getProjectRooms,
  getProjects,
  getProposals,
  getTasks,
  getTrades,
  getVendorLibraryItems,
  getVendors,
} from "@/lib/db";

/** A fake doc with every numeric field the getters' in-memory sorts touch. */
function fakeDoc(id: number) {
  const data = {
    createdAt: id,
    updatedAt: id,
    lastActive: id,
    sortOrder: id,
  };
  return { id: `doc-${id}`, data: () => data, exists: () => true };
}

function fakeSnapshot(count: number) {
  const docs = Array.from({ length: count }, (_, i) => fakeDoc(i + 1));
  return {
    docs,
    forEach: (cb: (d: (typeof docs)[number]) => void) => docs.forEach(cb),
  };
}

const listGetters: Array<{
  name: string;
  run: () => Promise<unknown[]>;
  collectionPath: string;
}> = [
  {
    name: "getClients",
    run: () => getClients("org1"),
    collectionPath: "clients",
  },
  { name: "getLeads", run: () => getLeads("org1"), collectionPath: "leads" },
  {
    name: "getVendors",
    run: () => getVendors("org1"),
    collectionPath: "vendors",
  },
  {
    name: "getProjects",
    run: () => getProjects("org1"),
    collectionPath: "projects",
  },
  {
    name: "getLibraryItems",
    run: () => getLibraryItems("org1"),
    collectionPath: "library",
  },
  {
    name: "getVendorLibraryItems",
    run: () => getVendorLibraryItems("org1", "vendor1"),
    collectionPath: "library",
  },
  {
    name: "getProposals",
    run: () => getProposals("org1"),
    collectionPath: "proposals",
  },
  {
    name: "getContracts",
    run: () => getContracts("org1"),
    collectionPath: "contracts",
  },
  { name: "getTrades", run: () => getTrades("org1"), collectionPath: "trades" },
  {
    // Participant-scoped: the uid arg is a query constraint, not a second read.
    name: "getTasks",
    run: () => getTasks("org1", "user1"),
    collectionPath: "tasks",
  },
  {
    name: "getOrganizationUsers",
    run: () => getOrganizationUsers("org1"),
    collectionPath: "users",
  },
  {
    name: "getProjectRooms",
    run: () => getProjectRooms("proj1"),
    collectionPath: "projectRooms",
  },
  {
    name: "getProjectRoomItems",
    run: () => getProjectRoomItems("proj1"),
    collectionPath: "projectRoomItems",
  },
  {
    name: "getClientNotes",
    run: () => getClientNotes("client1"),
    collectionPath: "clients/client1/notes",
  },
  {
    name: "getProjectNotes",
    run: () => getProjectNotes("proj1"),
    collectionPath: "projects/proj1/notes",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDocs).mockResolvedValue(
    fakeSnapshot(3) as unknown as Awaited<ReturnType<typeof getDocs>>,
  );
});

describe("list getters issue exactly one query and no per-doc reads", () => {
  it.each(listGetters)("$name", async ({ run, collectionPath }) => {
    const result = await run();

    expect(getDocs).toHaveBeenCalledTimes(1);
    expect(getDoc).not.toHaveBeenCalled();
    // Errors inside the getter are swallowed (catch → []); a wrong mock or a
    // broken sort would silently pass the call-count checks without this.
    expect(result).toHaveLength(3);

    const queried = vi
      .mocked(collection)
      .mock.calls.map((call) => call.slice(1).join("/"));
    expect(queried).toEqual([collectionPath]);
  });
});
