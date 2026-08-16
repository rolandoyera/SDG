import { readFileSync } from "node:fs";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
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
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const PROJECT_ID = "sdg-rules-test";

let testEnv: RulesTestEnvironment | undefined;

function firestoreEmulatorHost(): { host: string; port: number } {
  const value = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
  const [host, port] = value.split(":");
  return { host, port: Number(port) };
}

function dbFor(uid: string, email = `${uid}@example.com`) {
  if (!testEnv) throw new Error("Rules test environment is not initialized.");
  return testEnv.authenticatedContext(uid, { email }).firestore();
}

async function seed(path: string, data: Record<string, unknown>) {
  if (!testEnv) throw new Error("Rules test environment is not initialized.");
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

async function seedUser(
  uid: string,
  organizationId: string,
  role: "SuperAdmin" | "Admin" | "Contributor" = "Contributor",
  email = `${uid}@example.com`,
) {
  await seed(`users/${uid}`, {
    email,
    fullName: uid,
    organizationId,
    role,
    status: "Active",
  });
}

async function seedDraftContract(
  contractId: string,
  organizationId: string,
  updatedBy: string,
) {
  await seed(`contracts/${contractId}`, {
    contractId,
    organizationId,
    title: "Draft",
    status: "draft",
    projectId: "project-1",
    clientId: "client-1",
    clientName: "Client",
    projectName: "Project",
    templateKey: "interior-design-agreement",
    templateVersion: 1,
    values: {},
    scopeItems: [],
    lockedSnapshot: null,
    createdBy: updatedBy,
    createdAt: 1,
    updatedBy,
    updatedAt: 1,
  });
}

describe("firestore rules", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync("firestore.rules", "utf8"),
        ...firestoreEmulatorHost(),
      },
    });
  });

  beforeEach(async () => {
    await testEnv?.clearFirestore();
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it("allows org members to read their org records and blocks other org records", async () => {
    await seedUser("user-a", "org-a");
    await seedUser("user-b", "org-b");
    await seed("clients/client-a", {
      uid: "client-a",
      organizationId: "org-a",
      createdAt: 1,
    });
    await seed("clients/client-b", {
      uid: "client-b",
      organizationId: "org-b",
      createdAt: 1,
    });

    const userDb = dbFor("user-a");

    await assertSucceeds(getDoc(doc(userDb, "clients/client-a")));
    await assertFails(getDoc(doc(userDb, "clients/client-b")));
  });

  it("scopes editable project notes to the author within the parent project's org", async () => {
    await seedUser("user-a", "org-a");
    await seedUser("user-b", "org-a"); // same org, different user
    await seedUser("user-c", "org-b"); // other org
    await seed("projects/project-a", {
      projectId: "project-a",
      organizationId: "org-a",
      createdAt: 1,
    });
    await seed("projects/project-a/notes/note-1", {
      id: "note-1",
      organizationId: "org-a",
      projectId: "project-a",
      body: "Original",
      createdBy: { type: "user", id: "user-a", name: "user-a" },
      createdAt: 1,
    });

    const aDb = dbFor("user-a");
    const bDb = dbFor("user-b");
    const cDb = dbFor("user-c");

    // Read: same-org members can read; another org cannot.
    await assertSucceeds(getDoc(doc(aDb, "projects/project-a/notes/note-1")));
    await assertSucceeds(getDoc(doc(bDb, "projects/project-a/notes/note-1")));
    await assertFails(getDoc(doc(cDb, "projects/project-a/notes/note-1")));

    // Create: must self-attribute and match the parent project's org.
    await assertSucceeds(
      setDoc(doc(aDb, "projects/project-a/notes/note-2"), {
        id: "note-2",
        organizationId: "org-a",
        projectId: "project-a",
        body: "New",
        createdBy: { type: "user", id: "user-a", name: "user-a" },
        createdAt: 2,
      }),
    );
    // Forging another user's authorship is denied.
    await assertFails(
      setDoc(doc(bDb, "projects/project-a/notes/note-3"), {
        id: "note-3",
        organizationId: "org-a",
        projectId: "project-a",
        body: "Spoof",
        createdBy: { type: "user", id: "user-a", name: "user-a" },
        createdAt: 2,
      }),
    );
    // An other-org user can't create under this project at all.
    await assertFails(
      setDoc(doc(cDb, "projects/project-a/notes/note-4"), {
        id: "note-4",
        organizationId: "org-b",
        projectId: "project-a",
        body: "Cross",
        createdBy: { type: "user", id: "user-c", name: "user-c" },
        createdAt: 2,
      }),
    );

    // Update: the author may edit the body (+ stamps); non-authors can't, and
    // fields outside the allowlist are rejected.
    await assertSucceeds(
      updateDoc(doc(aDb, "projects/project-a/notes/note-1"), {
        body: "Edited",
        updatedAt: 3,
        updatedBy: { type: "user", id: "user-a", name: "user-a" },
      }),
    );
    await assertFails(
      updateDoc(doc(bDb, "projects/project-a/notes/note-1"), {
        body: "Hijack",
        updatedAt: 3,
        updatedBy: { type: "user", id: "user-b", name: "user-b" },
      }),
    );
    await assertFails(
      updateDoc(doc(aDb, "projects/project-a/notes/note-1"), {
        createdBy: { type: "user", id: "user-b", name: "user-b" },
        updatedAt: 3,
      }),
    );

    // Delete: the author hard-deletes their own; a non-author can't.
    await assertFails(deleteDoc(doc(bDb, "projects/project-a/notes/note-1")));
    await assertSucceeds(
      deleteDoc(doc(aDb, "projects/project-a/notes/note-1")),
    );
  });

  it("keeps contracts draft-only for client updates and deletes", async () => {
    await seedUser("user-a", "org-a");
    await seedDraftContract("draft-1", "org-a", "user-a");
    await seed("contracts/sent-1", {
      contractId: "sent-1",
      organizationId: "org-a",
      title: "Sent",
      status: "sent",
      projectId: "project-1",
      clientId: "client-1",
      clientName: "Client",
      projectName: "Project",
      templateKey: "interior-design-agreement",
      templateVersion: 1,
      values: {},
      scopeItems: [],
      lockedSnapshot: { lockedAt: 2, lockedBy: "user-a" },
      createdBy: "user-a",
      createdAt: 1,
      updatedBy: "user-a",
      updatedAt: 2,
    });

    const userDb = dbFor("user-a");

    await assertSucceeds(
      updateDoc(doc(userDb, "contracts/draft-1"), {
        title: "Updated draft",
        updatedBy: "user-a",
        updatedAt: 3,
      }),
    );
    await assertFails(
      updateDoc(doc(userDb, "contracts/draft-1"), {
        status: "sent",
        updatedBy: "user-a",
        updatedAt: 4,
      }),
    );
    await assertFails(
      updateDoc(doc(userDb, "contracts/draft-1"), {
        lockedSnapshot: { lockedAt: 4, lockedBy: "user-a" },
        updatedBy: "user-a",
        updatedAt: 4,
      }),
    );
    await assertFails(deleteDoc(doc(userDb, "contracts/sent-1")));
    await assertSucceeds(deleteDoc(doc(userDb, "contracts/draft-1")));
  });

  it("denies client updates to server-owned contract fields even while draft", async () => {
    await seedUser("user-a", "org-a");
    await seedDraftContract("draft-1", "org-a", "user-a");

    const userDb = dbFor("user-a");
    const draftRef = doc(userDb, "contracts/draft-1");

    await assertFails(
      updateDoc(draftRef, {
        contractCode: "SDG-CN-9999",
        updatedBy: "user-a",
        updatedAt: 2,
      }),
    );
    await assertFails(
      updateDoc(draftRef, {
        contractNumber: 9999,
        updatedBy: "user-a",
        updatedAt: 2,
      }),
    );
    await assertFails(
      updateDoc(draftRef, {
        sentAt: 2,
        sentBy: "user-a",
        updatedBy: "user-a",
        updatedAt: 2,
      }),
    );
    await assertFails(
      updateDoc(draftRef, {
        contractHash: "hash",
        contractVersionId: "version",
        updatedBy: "user-a",
        updatedAt: 2,
      }),
    );
    await assertFails(
      updateDoc(draftRef, {
        clientSignature: { signerName: "Client", signedAt: 2 },
        companySignatureAuthorization: { signerName: "Signer" },
        updatedBy: "user-a",
        updatedAt: 2,
      }),
    );
    await assertFails(
      updateDoc(draftRef, {
        voidedAt: 2,
        voidedBy: "user-a",
        updatedBy: "user-a",
        updatedAt: 2,
      }),
    );
  });

  it("denies client access to server-only contract and portal collections", async () => {
    await seedUser("user-a", "org-a");
    await seed("contracts/contract-1", {
      contractId: "contract-1",
      organizationId: "org-a",
      status: "sent",
    });
    await seed("projectDocuments/doc-1", {
      documentId: "doc-1",
      organizationId: "org-a",
    });
    await seed("portalAccess/access-1", {
      portalAccessId: "access-1",
      organizationId: "org-a",
    });
    await seed("contracts/contract-1/audit/event-1", {
      auditEventId: "event-1",
      type: "contract_sent",
      organizationId: "org-a",
    });

    const userDb = dbFor("user-a");

    await assertFails(
      setDoc(doc(userDb, "contracts/new-contract"), {
        contractId: "new-contract",
        organizationId: "org-a",
        status: "draft",
      }),
    );
    await assertFails(
      setDoc(doc(userDb, "projectDocuments/doc-2"), {
        documentId: "doc-2",
        organizationId: "org-a",
      }),
    );
    await assertFails(
      setDoc(doc(userDb, "portalAccess/access-2"), {
        portalAccessId: "access-2",
        organizationId: "org-a",
      }),
    );
    await assertFails(
      getDoc(doc(userDb, "contracts/contract-1/audit/event-1")),
    );
    await assertFails(
      setDoc(doc(userDb, "contracts/contract-1/audit/event-2"), {
        auditEventId: "event-2",
      }),
    );
  });

  it("enforces user invite and self-profile rules", async () => {
    await seedUser("admin-a", "org-a", "Admin");
    await seedUser("contributor-a", "org-a", "Contributor");

    const adminDb = dbFor("admin-a");
    const contributorDb = dbFor("contributor-a");

    await assertSucceeds(
      setDoc(doc(adminDb, "users/invitee@example.com"), {
        fullName: "Invitee User",
        email: "invitee@example.com",
        role: "Contributor",
        organizationId: "org-a",
        status: "Pending",
      }),
    );
    await assertFails(
      setDoc(doc(contributorDb, "users/other@example.com"), {
        fullName: "Other User",
        email: "other@example.com",
        role: "Contributor",
        organizationId: "org-a",
        status: "Pending",
      }),
    );

    const inviteeDb = dbFor("invitee-uid", "invitee@example.com");
    await assertSucceeds(
      setDoc(doc(inviteeDb, "users/invitee-uid"), {
        fullName: "Invitee User",
        email: "invitee@example.com",
        role: "Contributor",
        organizationId: "org-a",
        status: "Active",
      }),
    );
    await assertFails(
      updateDoc(doc(inviteeDb, "users/invitee-uid"), {
        role: "Admin",
      }),
    );
  });

  it("prevents invite acceptance from escalating role or changing org", async () => {
    await seed("users/invitee@example.com", {
      fullName: "Invitee User",
      email: "invitee@example.com",
      role: "Contributor",
      organizationId: "org-a",
      status: "Pending",
    });

    const inviteeDb = dbFor("invitee-uid", "invitee@example.com");

    await assertFails(
      setDoc(doc(inviteeDb, "users/invitee-uid"), {
        fullName: "Invitee User",
        email: "invitee@example.com",
        role: "Admin",
        organizationId: "org-a",
        status: "Active",
      }),
    );
    await assertFails(
      setDoc(doc(inviteeDb, "users/invitee-uid"), {
        fullName: "Invitee User",
        email: "invitee@example.com",
        role: "Contributor",
        organizationId: "org-b",
        status: "Active",
      }),
    );
  });

  it("prevents active users from changing their own role or organization", async () => {
    await seedUser("user-a", "org-a", "Contributor");

    const userDb = dbFor("user-a");

    await assertSucceeds(
      updateDoc(doc(userDb, "users/user-a"), {
        displayName: "Updated User",
      }),
    );
    await assertFails(
      updateDoc(doc(userDb, "users/user-a"), {
        role: "Admin",
      }),
    );
    await assertFails(
      updateDoc(doc(userDb, "users/user-a"), {
        organizationId: "org-b",
      }),
    );
  });

  it("allows org members to read but not write portal access records", async () => {
    await seedUser("user-a", "org-a");
    await seed("portalAccess/access-1", {
      portalAccessId: "access-1",
      organizationId: "org-a",
      status: "active",
    });

    const userDb = dbFor("user-a");

    await assertSucceeds(getDoc(doc(userDb, "portalAccess/access-1")));
    await assertFails(
      updateDoc(doc(userDb, "portalAccess/access-1"), {
        status: "revoked",
      }),
    );
  });

  it("enforces project document org isolation and server-only writes", async () => {
    await seedUser("user-a", "org-a");
    await seedUser("user-b", "org-b");
    await seed("projectDocuments/doc-a", {
      documentId: "doc-a",
      organizationId: "org-a",
      projectId: "project-a",
    });
    await seed("projectDocuments/doc-b", {
      documentId: "doc-b",
      organizationId: "org-b",
      projectId: "project-b",
    });

    const userDb = dbFor("user-a");

    await assertSucceeds(getDoc(doc(userDb, "projectDocuments/doc-a")));
    await assertFails(getDoc(doc(userDb, "projectDocuments/doc-b")));
    await assertFails(
      updateDoc(doc(userDb, "projectDocuments/doc-a"), {
        title: "Changed",
      }),
    );
    await assertFails(deleteDoc(doc(userDb, "projectDocuments/doc-a")));
  });

  it("does not allow unauthenticated portal reads through Firestore client SDK", async () => {
    await seed("portalAccess/access-1", {
      portalAccessId: "access-1",
      organizationId: "org-a",
      status: "active",
    });

    if (!testEnv) throw new Error("Rules test environment is not initialized.");
    const anonDb = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(anonDb, "portalAccess/access-1")));
  });

  it("keeps organization secrets and reference counters server-only", async () => {
    await seedUser("admin-a", "org-a", "Admin");
    await seed("organizations/org-a", {
      organizationId: "org-a",
      name: "Org A",
      companyProfile: { legalName: "Org A LLC" },
      settings: { contractExpirationDays: 30 },
      config: { billingStatus: "active" },
    });
    await seed("organizations/org-a/secrets/meta", {
      accessToken: "secret",
    });
    await seed("organizations/org-a/counters/contractCodes", {
      nextNumber: 12,
    });

    const adminDb = dbFor("admin-a");

    await assertSucceeds(getDoc(doc(adminDb, "organizations/org-a")));
    await assertSucceeds(
      updateDoc(doc(adminDb, "organizations/org-a"), {
        companyProfile: { legalName: "Updated Org A LLC" },
      }),
    );
    await assertFails(
      updateDoc(doc(adminDb, "organizations/org-a"), {
        config: { billingStatus: "suspended" },
      }),
    );
    await assertFails(getDoc(doc(adminDb, "organizations/org-a/secrets/meta")));
    await assertFails(
      setDoc(doc(adminDb, "organizations/org-a/secrets/meta"), {
        accessToken: "changed",
      }),
    );
    await assertFails(
      getDoc(doc(adminDb, "organizations/org-a/counters/contractCodes")),
    );
    await assertFails(
      updateDoc(doc(adminDb, "organizations/org-a/counters/contractCodes"), {
        nextNumber: 99,
      }),
    );
  });

  it("scopes notifications to org + audience and allows only own-uid read/dismiss appends", async () => {
    await seedUser("user-a", "org-a");
    await seedUser("user-b", "org-a");
    await seedUser("user-c", "org-b");
    await seed("notifications/n-org", {
      notificationId: "n-org",
      organizationId: "org-a",
      type: "lead_created",
      audience: "org",
      title: "New website lead",
      actor: { type: "system", id: "website", name: "website" },
      readBy: [],
      dismissedBy: [],
      createdAt: 1,
    });
    await seed("notifications/n-b", {
      notificationId: "n-b",
      organizationId: "org-a",
      type: "lead_created",
      audience: "user-b",
      title: "Targeted",
      actor: { type: "user", id: "user-a", name: "user-a" },
      readBy: [],
      dismissedBy: [],
      createdAt: 2,
    });

    const aDb = dbFor("user-a");
    const bDb = dbFor("user-b");
    const cDb = dbFor("user-c");

    // Read: org-wide docs for org members only; targeted docs only for the recipient.
    await assertSucceeds(getDoc(doc(aDb, "notifications/n-org")));
    await assertFails(getDoc(doc(cDb, "notifications/n-org")));
    await assertFails(getDoc(doc(aDb, "notifications/n-b")));
    await assertSucceeds(getDoc(doc(bDb, "notifications/n-b")));

    // The bell's list query must constrain audience or the list is rejected.
    await assertSucceeds(
      getDocs(
        query(
          collection(aDb, "notifications"),
          where("organizationId", "==", "org-a"),
          where("audience", "in", ["org", "user-a"]),
        ),
      ),
    );
    await assertFails(
      getDocs(
        query(
          collection(aDb, "notifications"),
          where("organizationId", "==", "org-a"),
        ),
      ),
    );

    // Create and delete are server-only.
    await assertFails(
      setDoc(doc(aDb, "notifications/n-new"), {
        notificationId: "n-new",
        organizationId: "org-a",
        type: "lead_created",
        audience: "org",
        title: "Forged",
        actor: { type: "user", id: "user-a", name: "user-a" },
        readBy: [],
        dismissedBy: [],
        createdAt: 3,
      }),
    );
    await assertFails(deleteDoc(doc(aDb, "notifications/n-org")));

    // Update: appending your own uid to readBy/dismissedBy is the only mutation.
    await assertSucceeds(
      updateDoc(doc(aDb, "notifications/n-org"), {
        readBy: arrayUnion("user-a"),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(aDb, "notifications/n-org"), {
        dismissedBy: arrayUnion("user-a"),
      }),
    );
    // Appending someone else's uid is denied.
    await assertFails(
      updateDoc(doc(aDb, "notifications/n-org"), {
        readBy: arrayUnion("user-b"),
      }),
    );
    // Removing an existing entry is denied (user-a is in readBy after the append).
    await assertFails(
      updateDoc(doc(bDb, "notifications/n-org"), { readBy: [] }),
    );
    // Touching any other field is denied, even alongside a valid append.
    await assertFails(
      updateDoc(doc(aDb, "notifications/n-org"), {
        title: "Changed",
        readBy: arrayUnion("user-a"),
      }),
    );
    // A non-recipient can't mark someone else's targeted notification.
    await assertFails(
      updateDoc(doc(aDb, "notifications/n-b"), {
        readBy: arrayUnion("user-a"),
      }),
    );
  });

  it("lets SuperAdmins work across orgs but never move a doc between orgs", async () => {
    await seedUser("super-a", "org-a", "SuperAdmin");
    await seedUser("user-a", "org-a", "Admin");
    await seed("clients/client-b", {
      uid: "client-b",
      organizationId: "org-b",
      createdAt: 1,
    });
    await seed("leads/lead-b", {
      uid: "lead-b",
      organizationId: "org-b",
      stage: "new",
      createdAt: 1,
    });
    await seed("projects/project-b", {
      projectId: "project-b",
      organizationId: "org-b",
      createdAt: 1,
    });

    const superDb = dbFor("super-a");

    // Cross-org read: single get and an org-filtered list.
    await assertSucceeds(getDoc(doc(superDb, "clients/client-b")));
    await assertSucceeds(
      getDocs(
        query(
          collection(superDb, "clients"),
          where("organizationId", "==", "org-b"),
        ),
      ),
    );

    // Cross-org create into the other org.
    await assertSucceeds(
      setDoc(doc(superDb, "leads/lead-new"), {
        uid: "lead-new",
        organizationId: "org-b",
        stage: "new",
        createdAt: 2,
      }),
    );

    // Cross-org update is allowed, but re-homing a doc to another org is not.
    await assertSucceeds(
      updateDoc(doc(superDb, "leads/lead-b"), { stage: "qualified" }),
    );
    await assertFails(
      updateDoc(doc(superDb, "leads/lead-b"), { organizationId: "org-a" }),
    );

    // Parent-org collections (project notes) inherit the cross-org access; the
    // note doc must still carry the PARENT project's org.
    await assertSucceeds(
      setDoc(doc(superDb, "projects/project-b/notes/note-1"), {
        id: "note-1",
        organizationId: "org-b",
        projectId: "project-b",
        body: "From HQ",
        createdBy: { type: "user", id: "super-a", name: "super-a" },
        createdAt: 2,
      }),
    );
    await assertFails(
      setDoc(doc(superDb, "projects/project-b/notes/note-2"), {
        id: "note-2",
        organizationId: "org-a",
        projectId: "project-b",
        body: "Wrong org stamp",
        createdBy: { type: "user", id: "super-a", name: "super-a" },
        createdAt: 2,
      }),
    );

    // An ordinary Admin of another org still can't reach org-b.
    await assertFails(getDoc(doc(dbFor("user-a"), "clients/client-b")));
  });

  it("keeps the mail outbox server-only", async () => {
    await seedUser("admin-a", "org-a", "Admin");
    await seedUser("contributor-a", "org-a", "Contributor");

    const adminDb = dbFor("admin-a");
    const contributorDb = dbFor("contributor-a");
    if (!testEnv) throw new Error("Rules test environment is not initialized.");
    const anonDb = testEnv.unauthenticatedContext().firestore();

    const mailDoc = {
      to: "invitee@example.com",
      message: {
        subject: "Invite",
        html: "<p>Invite</p>",
      },
    };

    await assertFails(addDoc(collection(adminDb, "mail"), mailDoc));
    await assertFails(addDoc(collection(contributorDb, "mail"), mailDoc));
    await assertFails(addDoc(collection(anonDb, "mail"), mailDoc));
  });
});
