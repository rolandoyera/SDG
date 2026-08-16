import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Contract, ContractSnapshot, PortalAccess } from "@/lib/types";

const activeOrgCookie = { value: "org-1" };

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`,
    )
    .join(",")}}`;
}

function hashSnapshot(snapshot: Contract["lockedSnapshot"]): string {
  return createHash("sha256").update(stableStringify(snapshot)).digest("hex");
}

function mockRequestContext(
  orgCookie: { value: string } | null = activeOrgCookie,
) {
  // The verified-caller module replaces the old raw org-cookie read; the org
  // still comes from `orgCookie` so existing cases keep their shape.
  vi.doMock("./auth", () => ({
    getActiveOrgId: vi.fn(async () => orgCookie?.value ?? null),
    getVerifiedCaller: vi.fn(async () =>
      orgCookie
        ? {
            uid: "user-1",
            role: "Admin",
            homeOrganizationId: orgCookie.value,
            organizationId: orgCookie.value,
          }
        : null,
    ),
  }));
  vi.doMock("next/headers", () => ({
    headers: vi.fn(async () => ({
      get: vi.fn((name: string) => {
        const values: Record<string, string> = {
          host: "dashboard.example.com",
          "x-forwarded-proto": "https",
          "x-forwarded-for": "203.0.113.9",
          "user-agent": "Vitest",
        };
        return values[name] ?? null;
      }),
    })),
  }));
}

function snapshot(): ContractSnapshot {
  return {
    templateKey: "interior-design-agreement",
    templateVersion: 1,
    values: { CLIENT_NAME: "Jane Client" },
    scopeItems: [],
    resolved: { CLIENT_NAME: "Jane Client" },
    pages: [{ page: 1, heading: "Agreement", body: "Hello" }],
    parties: {
      clientName: "Jane Client",
      clientEmail: "jane@example.com",
      clientAddress: "1 Main St",
      companyLegalName: "Studio LLC",
      companyEmail: "studio@example.com",
      companyAddress: "2 Main St",
    },
    projectSnapshot: { name: "Project", address: "1 Main St" },
  };
}

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    contractId: "contract-1",
    organizationId: "org-1",
    contractCode: "ORG-CN-0001",
    title: "Contract",
    status: "draft",
    projectId: "project-1",
    clientId: "client-1",
    clientName: "Jane Client",
    projectName: "Project",
    templateKey: "interior-design-agreement",
    templateVersion: 1,
    values: {},
    scopeItems: [],
    lockedSnapshot: null,
    createdBy: "user-1",
    createdAt: 1,
    updatedBy: "user-1",
    updatedAt: 1,
    ...overrides,
  };
}

function org(overrides: Record<string, unknown> = {}) {
  return {
    settings: {
      contractExpirationDays: 14,
      contractSigner: {
        name: "Design Signer",
        title: "Principal",
        email: "signer@example.com",
      },
    },
    companyProfile: {
      legalName: "Studio LLC",
      phone: "(954) 555-0000",
      phoneCountry: "US",
    },
    branding: { logoDarkUrl: "https://example.com/logo.png" },
    ...overrides,
  };
}

function mockAdminDb(input: {
  contract?: Contract | null;
  organization?: Record<string, unknown> | null;
  client?: Record<string, unknown> | null;
  access?: PortalAccess | null;
  /** Docs returned by the org-scoped contracts list query (lazy-expiry sweep). */
  contractList?: Contract[];
}) {
  const txUpdate = vi.fn();
  const contractUpdate = vi.fn();
  const portalAccessUpdate = vi.fn();

  function docRef(collectionName: string, id: string) {
    return {
      id,
      get: vi.fn(async () => {
        const byCollection: Record<string, unknown | null | undefined> = {
          contracts: input.contract,
          organizations: input.organization,
          clients: input.client,
        };
        const data = byCollection[collectionName];
        return {
          exists: data !== null && data !== undefined,
          data: () => data,
        };
      }),
      update:
        collectionName === "contracts"
          ? contractUpdate
          : collectionName === "portalAccess"
            ? portalAccessUpdate
            : vi.fn(),
    };
  }

  const collection = vi.fn((name: string) => ({
    doc: vi.fn((id: string) => docRef(name, id)),
    where: vi.fn(() => ({
      // Token lookups use `.where(...).limit(1).get()`.
      limit: vi.fn(() => ({
        get: vi.fn(async () => ({
          empty: !input.access,
          docs: input.access ? [{ data: () => input.access }] : [],
        })),
      })),
      // The lazy-expiry sweep uses `.where(...).get()` (no limit).
      get: vi.fn(async () => ({
        docs: (input.contractList ?? []).map((c) => ({ data: () => c })),
      })),
    })),
  }));
  const db = {
    collection,
    runTransaction: vi.fn(
      async (
        callback: (tx: {
          get: (ref: { get: () => Promise<unknown> }) => Promise<unknown>;
          update: typeof txUpdate;
        }) => Promise<unknown>,
      ) =>
        callback({
          get: (ref) => ref.get(),
          update: txUpdate,
        }),
    ),
  };

  vi.doMock("./firebase-admin", () => ({ getAdminDb: () => db }));
  return { db, txUpdate, contractUpdate, portalAccessUpdate };
}

function mockSideEffects() {
  const sendContractEmail = vi.fn(async () => ({ ok: true }));
  const writeContractAuditEvent = vi.fn(async () => undefined);
  const createContractPortalAccess = vi.fn(async () => ({
    portalAccessId: "portal-access-1",
    accessToken: "raw-token",
    expiresAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
  }));
  const generateAndStoreFinalContractPdf = vi.fn(async () => ({
    path: "organizations/org-1/contracts/contract-1/executed.pdf",
    fileName: "contract-1-executed.pdf",
    buffer: Buffer.from("pdf"),
  }));
  const attachExecutedContractToProject = vi.fn(async () => ({
    documentId: "contract-contract-1",
    fileUrl: "/api/project-documents/contract-contract-1/download",
  }));
  const writeNotification = vi.fn(async () => "notification-1");

  vi.doMock("./brevo", () => ({ sendContractEmail }));
  vi.doMock("./notifications", () => ({ writeNotification }));
  vi.doMock("./contract-audit", () => ({
    hasRecentPortalOpen: vi.fn(async () => false),
    writeContractAuditEvent,
  }));
  vi.doMock("./contract-pdf", () => ({ generateAndStoreFinalContractPdf }));
  vi.doMock("./project-documents", () => ({
    attachExecutedContractToProject,
  }));
  vi.doMock("./portal", async () => {
    const actual = await vi.importActual<typeof import("./portal")>("./portal");
    return {
      ...actual,
      createContractPortalAccess,
    };
  });

  return {
    sendContractEmail,
    writeContractAuditEvent,
    createContractPortalAccess,
    generateAndStoreFinalContractPdf,
    attachExecutedContractToProject,
    writeNotification,
  };
}

function expectNoSideEffects(effects: ReturnType<typeof mockSideEffects>) {
  expect(effects.sendContractEmail).not.toHaveBeenCalled();
  expect(effects.writeContractAuditEvent).not.toHaveBeenCalled();
  expect(effects.createContractPortalAccess).not.toHaveBeenCalled();
  expect(effects.generateAndStoreFinalContractPdf).not.toHaveBeenCalled();
  expect(effects.attachExecutedContractToProject).not.toHaveBeenCalled();
  expect(effects.writeNotification).not.toHaveBeenCalled();
}

describe("contract signing server actions", () => {
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

  it("freezes and sends a draft with server-derived signer, recipient, and portal access", async () => {
    mockRequestContext();
    const effects = mockSideEffects();
    const { txUpdate } = mockAdminDb({
      contract: contract(),
      organization: org(),
      client: { email: " jane@example.com ", phone: "(954) 555-1212" },
    });

    const { sendContractForSignature } = await import("./contract-signing");
    const result = await sendContractForSignature({
      contractId: "contract-1",
      snapshot: snapshot(),
    });

    expect(result).toEqual({
      ok: true,
      portalAccessId: "portal-access-1",
      portalUrl: "https://dashboard.example.com/portal/raw-token",
      emailSent: true,
    });
    expect(txUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "sent",
        sentToEmail: "jane@example.com",
        sentBy: "user-1",
        sentAt: Date.now(),
        updatedBy: "user-1",
        updatedAt: Date.now(),
        companySignatureAuthorization: expect.objectContaining({
          authorizedBy: "user-1",
          signerName: "Design Signer",
          signerTitle: "Principal",
          signerEmail: "signer@example.com",
          signatureType: "authorized_on_send",
        }),
      }),
    );
    expect(effects.createContractPortalAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        sentToEmail: "jane@example.com",
        phoneLast4: "1212",
        ttlDays: 14,
      }),
    );
    expect(effects.writeContractAuditEvent).toHaveBeenCalledWith(
      "contract-1",
      expect.objectContaining({ type: "contract_sent" }),
    );
    expect(effects.sendContractEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: { email: "jane@example.com", name: "Jane Client" },
        sender: { email: "signer@example.com", name: "Studio LLC" },
      }),
    );
  });

  it("refuses to send non-draft contracts", async () => {
    mockRequestContext();
    const effects = mockSideEffects();
    const { txUpdate, contractUpdate } = mockAdminDb({
      contract: contract({
        status: "sent",
        lockedSnapshot: {
          ...snapshot(),
          lockedAt: 1,
          lockedBy: "user-1",
        },
      }),
      organization: org(),
      client: { email: "jane@example.com", phone: "(954) 555-1212" },
    });

    const { sendContractForSignature } = await import("./contract-signing");

    await expect(
      sendContractForSignature({
        contractId: "contract-1",
        snapshot: snapshot(),
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Only draft contracts can be sent.",
    });
    expect(txUpdate).not.toHaveBeenCalled();
    expect(contractUpdate).not.toHaveBeenCalled();
    expectNoSideEffects(effects);
  });

  it("refuses to send when the server-side client phone cannot verify identity", async () => {
    mockRequestContext();
    const effects = mockSideEffects();
    const { txUpdate, contractUpdate } = mockAdminDb({
      contract: contract(),
      organization: org(),
      client: { email: "jane@example.com", phone: "12" },
    });

    const { sendContractForSignature } = await import("./contract-signing");

    await expect(
      sendContractForSignature({
        contractId: "contract-1",
        snapshot: snapshot(),
      }),
    ).resolves.toEqual({
      ok: false,
      error:
        "The client needs a phone number on file — it's used to verify their identity before signing.",
    });
    expect(txUpdate).not.toHaveBeenCalled();
    expect(contractUpdate).not.toHaveBeenCalled();
    expectNoSideEffects(effects);
  });

  it("rejects signing when consent is missing or identity is unverified", async () => {
    mockRequestContext();
    const effects = mockSideEffects();
    const { txUpdate, contractUpdate } = mockAdminDb({
      contract: contract(),
      organization: org(),
      client: { email: "jane@example.com", phone: "(954) 555-1212" },
      access: {
        portalAccessId: "portal-access-1",
        type: "contract_signature",
        organizationId: "org-1",
        clientId: "client-1",
        projectId: "project-1",
        contractId: "contract-1",
        tokenHash: "hash",
        status: "active",
        createdAt: 1,
        expiresAt: Date.now() + 1000,
        sentToEmail: "jane@example.com",
      },
    });

    const { signContract } = await import("./contract-signing");

    await expect(
      signContract({
        accessToken: "raw-token",
        contractId: "contract-1",
        signerName: "Jane Client",
        consentAccepted: false,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "You must accept the consent to sign.",
    });
    expect(txUpdate).not.toHaveBeenCalled();
    expect(contractUpdate).not.toHaveBeenCalled();
    expectNoSideEffects(effects);

    await expect(
      signContract({
        accessToken: "raw-token",
        contractId: "contract-1",
        signerName: "Jane Client",
        consentAccepted: true,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Please verify your identity before signing.",
    });
    expect(txUpdate).not.toHaveBeenCalled();
    expect(contractUpdate).not.toHaveBeenCalled();
    expectNoSideEffects(effects);
  });

  it("executes a valid signature and records the artifact pipeline", async () => {
    mockRequestContext();
    const effects = mockSideEffects();
    const lockedSnapshot = {
      ...snapshot(),
      lockedAt: 1,
      lockedBy: "user-1",
    };
    const signableContract = contract({
      status: "viewed",
      lockedSnapshot,
      contractVersionId: "version-1",
      contractHash: hashSnapshot(lockedSnapshot),
      companySignatureAuthorization: {
        authorizedAt: 1,
        authorizedBy: "user-1",
        signerName: "Design Signer",
        signerTitle: "Principal",
        signerEmail: "signer@example.com",
        signatureType: "authorized_on_send",
      },
      sentToEmail: "jane@example.com",
    });
    const { txUpdate, contractUpdate } = mockAdminDb({
      contract: signableContract,
      organization: org(),
      client: { email: "jane@example.com", phone: "(954) 555-1212" },
      access: {
        portalAccessId: "portal-access-1",
        type: "contract_signature",
        organizationId: "org-1",
        clientId: "client-1",
        projectId: "project-1",
        contractId: "contract-1",
        tokenHash: "hash",
        status: "active",
        createdAt: 1,
        expiresAt: Date.now() + 1000,
        sentToEmail: "jane@example.com",
        verifiedAt: 2,
      },
    });

    const { signContract } = await import("./contract-signing");
    const result = await signContract({
      accessToken: "raw-token",
      contractId: "contract-1",
      signerName: " Jane Client ",
      consentAccepted: true,
    });

    expect(result).toEqual({ ok: true });
    expect(txUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "fully_executed",
        executedAt: Date.now(),
        updatedAt: Date.now(),
        clientSignature: expect.objectContaining({
          signerName: "Jane Client",
          signerEmail: "jane@example.com",
          signedAt: Date.now(),
          ipAddress: "203.0.113.9",
          userAgent: "Vitest",
        }),
      }),
    );
    expect(txUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "completed",
        consentAcceptedAt: Date.now(),
        completedAt: Date.now(),
      }),
    );
    expect(effects.generateAndStoreFinalContractPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        contract: expect.objectContaining({
          status: "fully_executed",
          clientSignature: expect.objectContaining({
            signerName: "Jane Client",
          }),
        }),
      }),
    );
    expect(effects.attachExecutedContractToProject).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        projectId: "project-1",
        clientId: "client-1",
        contractId: "contract-1",
        contractCode: "ORG-CN-0001",
      }),
    );
    expect(contractUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        executedFilePath:
          "organizations/org-1/contracts/contract-1/executed.pdf",
        finalPdfPath: "organizations/org-1/contracts/contract-1/executed.pdf",
      }),
    );
    expect(effects.writeContractAuditEvent).toHaveBeenCalledWith(
      "contract-1",
      expect.objectContaining({ type: "contract_fully_executed" }),
    );
    expect(effects.writeNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        type: "contract_executed",
        audience: "org",
        href: "/dashboard/contracts/contract-1",
        body: "Signed by Jane Client",
      }),
    );
  });

  it("resends a fresh link: revokes the old access, re-emails, and resets to sent", async () => {
    mockRequestContext();
    const effects = mockSideEffects();
    const { contractUpdate, portalAccessUpdate } = mockAdminDb({
      contract: contract({
        status: "expired",
        activeAccessTokenId: "old-access",
        sentAt: 1,
        viewedAt: 5,
        contractVersionId: "version-1",
        lockedSnapshot: { ...snapshot(), lockedAt: 1, lockedBy: "user-1" },
      }),
      organization: org(),
      client: { email: "jane@example.com", phone: "(954) 555-1212" },
    });

    const { resendContractSigningLink } = await import("./contract-signing");
    const result = await resendContractSigningLink({
      contractId: "contract-1",
    });

    expect(result).toEqual({
      ok: true,
      portalAccessId: "portal-access-1",
      portalUrl: "https://dashboard.example.com/portal/raw-token",
      emailSent: true,
    });
    // Old link revoked.
    expect(portalAccessUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "revoked",
        revokedReason: "replaced_by_resend",
      }),
    );
    expect(effects.writeContractAuditEvent).toHaveBeenCalledWith(
      "contract-1",
      expect.objectContaining({
        type: "portal_access_revoked",
        accessTokenId: "old-access",
        reason: "replaced_by_resend",
      }),
    );
    // Fresh link minted + emailed.
    expect(effects.createContractPortalAccess).toHaveBeenCalled();
    expect(effects.sendContractEmail).toHaveBeenCalled();
    // Contract reset to a fresh sent cycle, pointing at the new link.
    expect(contractUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "sent",
        activeAccessTokenId: "portal-access-1",
        sentAt: Date.now(),
      }),
    );
    expect(effects.writeContractAuditEvent).toHaveBeenCalledWith(
      "contract-1",
      expect.objectContaining({
        type: "contract_resent",
        accessTokenId: "portal-access-1",
        previousAccessTokenId: "old-access",
      }),
    );
  });

  it("refuses to resend an executed contract", async () => {
    mockRequestContext();
    const effects = mockSideEffects();
    const { contractUpdate } = mockAdminDb({
      contract: contract({
        status: "fully_executed",
        executedAt: 10,
        lockedSnapshot: { ...snapshot(), lockedAt: 1, lockedBy: "user-1" },
      }),
      organization: org(),
      client: { email: "jane@example.com", phone: "(954) 555-1212" },
    });

    const { resendContractSigningLink } = await import("./contract-signing");
    const result = await resendContractSigningLink({
      contractId: "contract-1",
    });

    expect(result.ok).toBe(false);
    expect(contractUpdate).not.toHaveBeenCalled();
    expectNoSideEffects(effects);
  });

  it("lazily expires only lapsed, unsigned, non-terminal contracts", async () => {
    mockRequestContext();
    const effects = mockSideEffects();
    const past = Date.now() - 1000;
    const future = Date.now() + 1000;
    const { contractUpdate } = mockAdminDb({
      contractList: [
        // Lapsed + unsigned → expired.
        contract({
          contractId: "lapsed",
          status: "sent",
          sentAt: 1,
          signingLinkExpiresAt: past,
          activeAccessTokenId: "lapsed-access",
        }),
        // Still valid → untouched.
        contract({
          contractId: "valid",
          status: "sent",
          sentAt: 1,
          signingLinkExpiresAt: future,
        }),
        // Already executed → untouched.
        contract({
          contractId: "done",
          status: "fully_executed",
          sentAt: 1,
          executedAt: 5,
          signingLinkExpiresAt: past,
        }),
        // Delivery failed → left for the user to resend.
        contract({
          contractId: "bounced",
          status: "sent",
          sentAt: 1,
          signingLinkExpiresAt: past,
          contractDisplay: {
            stage: "delivery_failed",
            statusText: "Sent → Delivery Failed",
            delivered: false,
            updatedAt: 1,
          },
        }),
      ],
    });

    const { expireLapsedContractLinks } = await import("./contract-signing");
    await expireLapsedContractLinks("org-1");

    // Exactly one contract flipped to expired.
    expect(contractUpdate).toHaveBeenCalledTimes(1);
    expect(contractUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "expired" }),
    );
    expect(effects.writeContractAuditEvent).toHaveBeenCalledTimes(1);
    expect(effects.writeContractAuditEvent).toHaveBeenCalledWith(
      "lapsed",
      expect.objectContaining({
        type: "contract_link_expired",
        accessTokenId: "lapsed-access",
      }),
    );
  });
});
