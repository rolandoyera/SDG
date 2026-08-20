import { readFileSync } from "node:fs";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

// Storage rules coverage. storage.rules is org-scoped through a cross-service
// firestore.get of users/{uid}.organizationId, so this suite needs BOTH
// emulators: run it via `npm run test:rules:emulator` (firestore + storage),
// not `npm run test:rules` alone. User profiles are seeded into the Firestore
// emulator; uploads then exercise the path-org-vs-profile-org match.

const PROJECT_ID = "sdg-rules-test";

let testEnv: RulesTestEnvironment | undefined;

function emulatorHost(
  envValue: string | undefined,
  fallbackPort: number,
): { host: string; port: number } {
  const value = envValue ?? `127.0.0.1:${fallbackPort}`;
  const [host, port] = value.split(":");
  return { host, port: Number(port) };
}

function storageFor(uid: string) {
  if (!testEnv) throw new Error("Rules test environment is not initialized.");
  return testEnv
    .authenticatedContext(uid, { email: `${uid}@example.com` })
    .storage();
}

function anonStorage() {
  if (!testEnv) throw new Error("Rules test environment is not initialized.");
  return testEnv.unauthenticatedContext().storage();
}

async function seedUser(
  uid: string,
  organizationId: string,
  role: "SuperAdmin" | "Admin" | "Contributor" = "Contributor",
) {
  if (!testEnv) throw new Error("Rules test environment is not initialized.");
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `users/${uid}`), {
      email: `${uid}@example.com`,
      fullName: uid,
      organizationId,
      role,
      status: "Active",
    });
  });
}

async function seedFile(path: string) {
  if (!testEnv) throw new Error("Rules test environment is not initialized.");
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(ref(context.storage(), path), SMALL_IMAGE, PNG);
  });
}

const SMALL_IMAGE = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const PNG = { contentType: "image/png" };
// The rule is `size < 15 * 1024 * 1024`, so exactly 15 MiB must be denied.
const CAP_BYTES = 15 * 1024 * 1024;

describe("storage rules", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync("firestore.rules", "utf8"),
        ...emulatorHost(process.env.FIRESTORE_EMULATOR_HOST, 8080),
      },
      storage: {
        rules: readFileSync("storage.rules", "utf8"),
        ...emulatorHost(process.env.FIREBASE_STORAGE_EMULATOR_HOST, 9199),
      },
    });
  });

  beforeEach(async () => {
    await testEnv?.clearStorage();
    await testEnv?.clearFirestore();
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  it("allows org members to upload images into their own org's paths", async () => {
    await seedUser("user-a", "org-a");
    const storage = storageFor("user-a");

    await assertSucceeds(
      uploadBytes(
        ref(storage, "organizations/org-a/branding/logo.png"),
        SMALL_IMAGE,
        PNG,
      ),
    );
    await assertSucceeds(
      uploadBytes(
        ref(storage, "library/org-a/item-1/images/img-1.png"),
        SMALL_IMAGE,
        PNG,
      ),
    );
    await assertSucceeds(
      uploadBytes(
        ref(storage, "vendors/org-a/vendor-1/logo.png"),
        SMALL_IMAGE,
        PNG,
      ),
    );
  });

  it("denies writes into another org's paths on every root", async () => {
    await seedUser("user-a", "org-a");
    const storage = storageFor("user-a");

    await assertFails(
      uploadBytes(
        ref(storage, "organizations/org-b/branding/logo.png"),
        SMALL_IMAGE,
        PNG,
      ),
    );
    await assertFails(
      uploadBytes(
        ref(storage, "library/org-b/item-1/images/img-1.png"),
        SMALL_IMAGE,
        PNG,
      ),
    );
    await assertFails(
      uploadBytes(
        ref(storage, "vendors/org-b/vendor-1/logo.png"),
        SMALL_IMAGE,
        PNG,
      ),
    );
  });

  it("lets SuperAdmins write into any org's paths", async () => {
    await seedUser("super-a", "org-a", "SuperAdmin");
    const storage = storageFor("super-a");

    await assertSucceeds(
      uploadBytes(
        ref(storage, "library/org-b/item-1/images/img-1.png"),
        SMALL_IMAGE,
        PNG,
      ),
    );
    // Upload constraints still apply cross-org.
    await assertFails(
      uploadBytes(
        ref(storage, "library/org-b/item-1/images/file.pdf"),
        SMALL_IMAGE,
        { contentType: "application/pdf" },
      ),
    );
  });

  it("denies unauthenticated writes", async () => {
    await assertFails(
      uploadBytes(
        ref(anonStorage(), "library/org-a/item-1/images/img-1.png"),
        SMALL_IMAGE,
        PNG,
      ),
    );
  });

  it("denies non-image uploads even into the user's own org", async () => {
    await seedUser("user-a", "org-a");

    await assertFails(
      uploadBytes(
        ref(storageFor("user-a"), "library/org-a/item-1/images/file.pdf"),
        SMALL_IMAGE,
        { contentType: "application/pdf" },
      ),
    );
  });

  it("allows PDF spec sheets only in the library docs/ segment, own org only", async () => {
    await seedUser("user-a", "org-a");
    const storage = storageFor("user-a");
    const PDF = { contentType: "application/pdf" };

    await assertSucceeds(
      uploadBytes(
        ref(storage, "library/org-a/item-1/docs/doc-1.pdf"),
        SMALL_IMAGE,
        PDF,
      ),
    );
    // Cross-org docs uploads stay denied.
    await assertFails(
      uploadBytes(
        ref(storage, "library/org-b/item-1/docs/doc-1.pdf"),
        SMALL_IMAGE,
        PDF,
      ),
    );
    // PDFs outside docs/ (images segment, vendors root) stay denied.
    await assertFails(
      uploadBytes(
        ref(storage, "library/org-a/item-1/images/doc-1.pdf"),
        SMALL_IMAGE,
        PDF,
      ),
    );
    await assertFails(
      uploadBytes(
        ref(storage, "vendors/org-a/vendor-1/docs/doc-1.pdf"),
        SMALL_IMAGE,
        PDF,
      ),
    );
    // Non-PDF content types don't sneak into docs/ under a .pdf name — though
    // images are still fine there via the general library image rule.
    await assertFails(
      uploadBytes(
        ref(storage, "library/org-a/item-1/docs/doc-1.pdf"),
        SMALL_IMAGE,
        {
          contentType: "application/zip",
        },
      ),
    );
    // Docs obey the same 15 MiB cap.
    await assertFails(
      uploadBytes(
        ref(storage, "library/org-a/item-1/docs/too-big.pdf"),
        new Uint8Array(CAP_BYTES),
        PDF,
      ),
    );
    // Own-org delete of a doc succeeds.
    await seedFile("library/org-a/item-1/docs/doc-2.pdf");
    await assertSucceeds(
      deleteObject(ref(storage, "library/org-a/item-1/docs/doc-2.pdf")),
    );
  });

  it("denies uploads at the 15 MiB cap and allows just under it", async () => {
    await seedUser("user-a", "org-a");
    const storage = storageFor("user-a");

    await assertFails(
      uploadBytes(
        ref(storage, "library/org-a/item-1/images/too-big.png"),
        new Uint8Array(CAP_BYTES),
        PNG,
      ),
    );
    await assertSucceeds(
      uploadBytes(
        ref(storage, "library/org-a/item-1/images/just-under.png"),
        new Uint8Array(CAP_BYTES - 1),
        PNG,
      ),
    );
  });

  it("allows any signed-in user to read org files, denies unauthenticated reads", async () => {
    await seedUser("user-a", "org-a");
    await seedFile("library/org-b/item-1/images/img-1.png");

    // Reads only require sign-in (image display uses tokened URLs anyway);
    // org isolation is enforced on writes.
    await assertSucceeds(
      getBytes(
        ref(storageFor("user-a"), "library/org-b/item-1/images/img-1.png"),
      ),
    );
    await assertFails(
      getBytes(ref(anonStorage(), "library/org-b/item-1/images/img-1.png")),
    );
  });

  it("allows deletes in the user's own org and denies cross-org deletes", async () => {
    await seedUser("user-a", "org-a");
    await seedFile("library/org-a/item-1/images/img-1.png");
    await seedFile("library/org-b/item-1/images/img-1.png");
    const storage = storageFor("user-a");

    await assertSucceeds(
      deleteObject(ref(storage, "library/org-a/item-1/images/img-1.png")),
    );
    await assertFails(
      deleteObject(ref(storage, "library/org-b/item-1/images/img-1.png")),
    );
  });

  it("denies everything outside the three known roots by default", async () => {
    await seedUser("user-a", "org-a");
    const storage = storageFor("user-a");

    await assertFails(
      uploadBytes(ref(storage, "uploads/img-1.png"), SMALL_IMAGE, PNG),
    );
    await assertFails(
      uploadBytes(ref(storage, "contracts/org-a/final.png"), SMALL_IMAGE, PNG),
    );
    await seedFile("uploads/img-1.png");
    await assertFails(getBytes(ref(storage, "uploads/img-1.png")));
  });
});
