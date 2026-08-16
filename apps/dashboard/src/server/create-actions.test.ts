import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActivityActor, ContractDraftInput, Lead } from "@/lib/types";

/** Mocks the verified-caller module (the real one verifies a Firebase ID token). */
function mockActiveOrg(orgId: string | null = "org-1") {
  vi.doMock("./auth", () => ({
    getActiveOrgId: vi.fn(async () => orgId),
    getVerifiedCaller: vi.fn(async () =>
      orgId
        ? {
            uid: "user-1",
            role: "Admin",
            homeOrganizationId: orgId,
            organizationId: orgId,
          }
        : null,
    ),
  }));
}

function mockReferenceCode(code: string, number: number) {
  const allocateReferenceCode = vi.fn(async () => ({ code, number }));
  vi.doMock("./reference-codes", () => ({ allocateReferenceCode }));
  return { allocateReferenceCode };
}

function mockAdminDb() {
  const tx = {
    get: vi.fn(async () => ({ get: vi.fn(() => "CLI-0001") })),
    set: vi.fn(),
    update: vi.fn(),
  };
  const db = {
    doc: vi.fn((path: string) => ({ path })),
    collection: vi.fn((name: string) => ({
      name,
      doc: vi.fn(() => ({ id: "generated-contract-id" })),
    })),
    runTransaction: vi.fn(async (callback: (txArg: typeof tx) => unknown) =>
      callback(tx),
    ),
  };

  vi.doMock("./firebase-admin", () => ({ getAdminDb: () => db }));
  return { db, tx };
}

describe("create server actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("creates clients in the active org with a server-allocated reference code", async () => {
    mockActiveOrg();
    const { allocateReferenceCode } = mockReferenceCode("SDG-CLI-0001", 1);
    const { tx } = mockAdminDb();
    vi.spyOn(Math, "random").mockReturnValue(0.123456789);

    const { createClient } = await import("./client-actions");
    const client = await createClient({
      isCompany: false,
      firstName: "Jane",
      lastName: "Client",
      email: "jane@example.com",
      phone: "",
    });

    expect(client).toMatchObject({
      uid: "client-4fzzzxjyl",
      organizationId: "org-1",
      clientCode: "SDG-CLI-0001",
      clientNumber: 1,
      createdAt: Date.now(),
    });
    expect(tx.set).toHaveBeenCalledWith(
      { path: `clients/${client.uid}` },
      client,
    );
    expect(allocateReferenceCode).toHaveBeenCalledWith(
      tx,
      expect.anything(),
      "org-1",
      "client",
    );
  });

  it("creates projects with active-org ownership and copied client code", async () => {
    mockActiveOrg();
    const { allocateReferenceCode } = mockReferenceCode("SDG-PRO-0001", 1);
    const { tx } = mockAdminDb();
    vi.spyOn(Math, "random").mockReturnValue(0.123456789);

    const { createProject } = await import("./project-actions");
    const project = await createProject({
      clientId: "client-1",
      name: "Project",
      status: "in_progress",
      createdBy: "user-1",
      updatedBy: "user-1",
    });

    expect(project).toMatchObject({
      projectId: "project-4fzzzxjyl",
      organizationId: "org-1",
      clientCode: "CLI-0001",
      projectCode: "SDG-PRO-0001",
      projectNumber: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastActivityAt: Date.now(),
    });
    expect(tx.set).toHaveBeenCalledWith(
      { path: `projects/${project.projectId}` },
      project,
    );
    expect(tx.get).toHaveBeenCalledWith({ path: "clients/client-1" });
    expect(allocateReferenceCode).toHaveBeenCalledWith(
      tx,
      expect.anything(),
      "org-1",
      "project",
    );
  });

  it("creates draft contracts with active-org ownership and server lifecycle fields", async () => {
    mockActiveOrg();
    const { allocateReferenceCode } = mockReferenceCode("SDG-CN-0001", 1);
    const { tx } = mockAdminDb();
    const draft: ContractDraftInput = {
      title: "Contract",
      projectId: "project-1",
      clientId: "client-1",
      clientName: "Jane Client",
      projectName: "Project",
      templateKey: "interior-design-agreement",
      templateVersion: 1,
      values: {},
      scopeItems: [],
    };

    const { createContract } = await import("./contract-actions");
    const contractId = await createContract("user-1", draft);

    expect(contractId).toBe("generated-contract-id");
    expect(tx.set).toHaveBeenCalledWith(
      { path: "contracts/generated-contract-id" },
      expect.objectContaining({
        ...draft,
        contractId: "generated-contract-id",
        organizationId: "org-1",
        contractCode: "SDG-CN-0001",
        contractNumber: 1,
        status: "draft",
        lockedSnapshot: null,
        createdBy: "user-1",
        updatedBy: "user-1",
      }),
    );
    expect(allocateReferenceCode).toHaveBeenCalledWith(
      tx,
      expect.anything(),
      "org-1",
      "contract",
    );
  });

  it("converts leads into clients and marks the lead won in one transaction", async () => {
    mockActiveOrg();
    mockReferenceCode("SDG-CLI-0002", 2);
    const { tx } = mockAdminDb();
    vi.spyOn(Math, "random").mockReturnValue(0.123456789);
    const actor: ActivityActor = { type: "user", id: "user-1", name: "User" };
    const lead: Lead = {
      uid: "lead-1",
      organizationId: "org-1",
      isCompany: false,
      firstName: "Jane",
      lastName: "Lead",
      email: "lead@example.com",
      phone: "(954) 555-1212",
      stage: "qualified",
      createdBy: actor,
      updatedBy: actor,
      createdAt: 1,
      updatedAt: 1,
    };

    const { convertLeadToClient } = await import("./lead-actions");
    const client = await convertLeadToClient(lead, "user-1", actor);

    expect(client).toMatchObject({
      uid: "client-4fzzzxjyl",
      organizationId: "org-1",
      sourceLeadId: "lead-1",
      clientCode: "SDG-CLI-0002",
      clientNumber: 2,
    });
    expect(tx.set).toHaveBeenCalledWith(
      { path: `clients/${client.uid}` },
      client,
    );
    expect(tx.update).toHaveBeenCalledWith(
      { path: "leads/lead-1" },
      expect.objectContaining({
        stage: "won",
        convertedClientId: client.uid,
        convertedBy: "user-1",
        updatedBy: actor,
      }),
    );
  });

  it("rejects client creation without an active organization", async () => {
    mockActiveOrg(null);
    mockReferenceCode("SDG-CLI-0001", 1);
    mockAdminDb();

    const { createClient } = await import("./client-actions");

    await expect(
      createClient({
        isCompany: false,
        firstName: "Jane",
        lastName: "Client",
        email: "jane@example.com",
        phone: "",
      }),
    ).rejects.toThrow("No active organization.");
  });

  it("rejects project creation without an active organization", async () => {
    mockActiveOrg(null);
    mockReferenceCode("SDG-PRO-0001", 1);
    mockAdminDb();

    const { createProject } = await import("./project-actions");

    await expect(
      createProject({
        clientId: "client-1",
        name: "Project",
        status: "in_progress",
        createdBy: "user-1",
        updatedBy: "user-1",
      }),
    ).rejects.toThrow("No active organization.");
  });

  it("rejects draft contract creation without an active organization", async () => {
    mockActiveOrg(null);
    mockReferenceCode("SDG-CN-0001", 1);
    mockAdminDb();

    const { createContract } = await import("./contract-actions");

    await expect(
      createContract("user-1", {
        title: "Contract",
        projectId: "project-1",
        clientId: "client-1",
        clientName: "Jane Client",
        projectName: "Project",
        templateKey: "interior-design-agreement",
        templateVersion: 1,
        values: {},
        scopeItems: [],
      }),
    ).rejects.toThrow("No active organization.");
  });

  it("rejects lead conversion without an active organization", async () => {
    mockActiveOrg(null);
    mockReferenceCode("SDG-CLI-0002", 2);
    mockAdminDb();
    const actor: ActivityActor = { type: "user", id: "user-1", name: "User" };

    const { convertLeadToClient } = await import("./lead-actions");

    await expect(
      convertLeadToClient(
        {
          uid: "lead-1",
          organizationId: "org-1",
          isCompany: false,
          stage: "qualified",
          createdBy: actor,
          updatedBy: actor,
          createdAt: 1,
          updatedAt: 1,
        },
        "user-1",
        actor,
      ),
    ).rejects.toThrow("No active organization.");
  });
});
