import { gzipSync } from "node:zlib";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function encodedState(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function nextRequest(url: string, cookie?: string): NextRequest {
  return new NextRequest(url, cookie ? { headers: { cookie } } : undefined);
}

function required(value: string | null, label: string): string {
  if (!value) throw new Error(`Expected ${label}.`);
  return value;
}

describe("cron API routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("CRON_SECRET", "cron-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("protects and runs the position-tracking cron", async () => {
    const runPositionChecksForAllOrgs = vi.fn(async () => ({
      orgs: 2,
      checked: 7,
    }));
    vi.doMock("@/server/position-tracking", () => ({
      runPositionChecksForAllOrgs,
    }));
    const { GET } = await import("./cron/position-tracking/route");

    const denied = await GET(new Request("https://app.test/api/cron"));
    expect(denied.status).toBe(401);
    expect(runPositionChecksForAllOrgs).not.toHaveBeenCalled();

    const response = await GET(
      new Request("https://app.test/api/cron", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      orgs: 2,
      checked: 7,
    });
  });

  it("protects and runs the Instagram snapshot cron", async () => {
    const snapshotAllConnectedInstagram = vi.fn(async () => ({
      orgs: 3,
      snapshots: 2,
    }));
    vi.doMock("@/server/meta-snapshots", () => ({
      snapshotAllConnectedInstagram,
    }));
    const { GET } = await import("./cron/instagram-snapshots/route");

    const denied = await GET(
      new Request("https://app.test/api/cron", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(denied.status).toBe(401);

    const response = await GET(
      new Request("https://app.test/api/cron", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    await expect(response.json()).resolves.toEqual({
      ok: true,
      orgs: 3,
      snapshots: 2,
    });
  });

  it("protects and runs the form-error alert cron", async () => {
    const runFormErrorAlertsForAllOrgs = vi.fn(async () => ({
      orgs: 4,
      alerts: 1,
    }));
    vi.doMock("@/server/form-error-alert", () => ({
      runFormErrorAlertsForAllOrgs,
    }));
    const { GET } = await import("./cron/form-error-alert/route");

    vi.stubEnv("CRON_SECRET", "");
    const denied = await GET(
      new Request("https://app.test/api/cron", {
        headers: { authorization: "Bearer " },
      }),
    );
    expect(denied.status).toBe(401);

    vi.stubEnv("CRON_SECRET", "cron-secret");
    const response = await GET(
      new Request("https://app.test/api/cron", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    await expect(response.json()).resolves.toEqual({
      ok: true,
      orgs: 4,
      alerts: 1,
    });
  });
});

describe("DataForSEO postback route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("CRON_SECRET", "cron-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("rejects invalid tokens and malformed payloads", async () => {
    const handleSerpPostback = vi.fn();
    vi.doMock("@/server/position-tracking", () => ({
      handleSerpPostback,
      postbackToken: () => "expected-token",
    }));
    const { POST } = await import("./dataforseo/postback/route");

    const denied = await POST(
      new Request(
        "https://app.test/api/dataforseo/postback?org=org-1&token=bad",
        {
          method: "POST",
          body: "{}",
        },
      ),
    );
    expect(denied.status).toBe(401);

    const malformed = await POST(
      new Request(
        "https://app.test/api/dataforseo/postback?org=org-1&token=expected-token",
        { method: "POST", body: "not-json" },
      ),
    );
    expect(malformed.status).toBe(400);
    expect(handleSerpPostback).not.toHaveBeenCalled();
  });

  it("accepts gzipped task batches and isolates a failed task", async () => {
    const handleSerpPostback = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("write failed"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.doMock("@/server/position-tracking", () => ({
      handleSerpPostback,
      postbackToken: () => "expected-token",
    }));
    const { POST } = await import("./dataforseo/postback/route");
    const tasks = [{ id: "task-1" }, { id: "task-2" }];

    const response = await POST(
      new Request(
        "https://app.test/api/dataforseo/postback?org=org-1&token=expected-token",
        {
          method: "POST",
          body: new Uint8Array(gzipSync(JSON.stringify({ tasks }))),
        },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(handleSerpPostback).toHaveBeenNthCalledWith(1, "org-1", tasks[0]);
    expect(handleSerpPostback).toHaveBeenNthCalledWith(2, "org-1", tasks[1]);
  });
});

describe("OAuth login routes", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("starts Meta OAuth only for a verified org and binds state to a cookie", async () => {
    const getActiveOrgId = vi.fn(async () => "org-1");
    vi.doMock("@/server/auth", () => ({ getActiveOrgId }));
    vi.stubEnv("META_APP_ID", "meta-app");
    vi.stubEnv(
      "META_REDIRECT_URI",
      "https://app.test/api/integrations/meta/callback",
    );
    const { GET, META_OAUTH_STATE_COOKIE } =
      await import("./integrations/meta/login/route");

    const response = await GET(
      nextRequest("https://app.test/api/integrations/meta/login"),
    );
    const location = response.headers.get("location");
    expect(response.status).toBe(307);
    expect(location).toContain("https://www.facebook.com/v22.0/dialog/oauth");
    const state = new URL(
      required(location, "OAuth redirect"),
    ).searchParams.get("state");
    const parsed = JSON.parse(
      Buffer.from(required(state, "OAuth state"), "base64url").toString("utf8"),
    );
    expect(parsed).toMatchObject({ organizationId: "org-1" });
    expect(response.cookies.get(META_OAUTH_STATE_COOKIE)?.value).toBe(
      parsed.nonce,
    );
  });

  it("keeps unauthenticated Dropbox OAuth requests inside the app", async () => {
    vi.doMock("@/server/auth", () => ({
      getActiveOrgId: vi.fn(async () => null),
    }));
    const { GET } = await import("./integrations/dropbox/login/route");

    const response = await GET(
      nextRequest(
        "https://app.test/api/integrations/dropbox/login?returnTo=https://evil.test/steal",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://app.test/dashboard/projects?dropbox=no_org",
    );
  });

  it("starts Dropbox OAuth with a safe return path and matching state cookie", async () => {
    vi.doMock("@/server/auth", () => ({
      getActiveOrgId: vi.fn(async () => "org-1"),
    }));
    vi.stubEnv("DROPBOX_APP_KEY", " dropbox-app ");
    const { GET, DROPBOX_OAUTH_STATE_COOKIE } =
      await import("./integrations/dropbox/login/route");

    const response = await GET(
      nextRequest(
        "https://tenant.test/api/integrations/dropbox/login?returnTo=%2Fdashboard%2Fprojects%2Fp-1%3Ftab%3Dsettings",
      ),
    );
    const location = new URL(
      required(response.headers.get("location"), "OAuth redirect"),
    );
    const parsed = JSON.parse(
      Buffer.from(
        required(location.searchParams.get("state"), "OAuth state"),
        "base64url",
      ).toString("utf8"),
    );
    expect(location.origin).toBe("https://www.dropbox.com");
    expect(location.searchParams.get("client_id")).toBe("dropbox-app");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://tenant.test/api/integrations/dropbox/callback",
    );
    expect(parsed).toMatchObject({
      organizationId: "org-1",
      returnTo: "/dashboard/projects/p-1?tab=settings",
    });
    expect(response.cookies.get(DROPBOX_OAUTH_STATE_COOKIE)?.value).toBe(
      parsed.nonce,
    );
  });
});

describe("OAuth callback routes", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("rejects Meta callback state for a different active org", async () => {
    vi.doMock("@/server/auth", () => ({
      getActiveOrgId: vi.fn(async () => "org-2"),
    }));
    vi.doMock("@/server/firebase-admin", () => ({ getAdminDb: vi.fn() }));
    vi.doMock("@/server/meta-graph", () => ({}));
    const { GET } = await import("./integrations/meta/callback/route");
    const state = encodedState({ organizationId: "org-1", nonce: "nonce-1" });

    const response = await GET(
      nextRequest(
        `https://app.test/api/integrations/meta/callback?code=code&state=${state}`,
        "meta_oauth_state=nonce-1",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://app.test/dashboard/instagram?meta=state_error",
    );
  });

  it("completes a single-page Meta connection for the active org", async () => {
    const storeMetaConnection = vi.fn(async () => undefined);
    const deletePending = vi.fn(async () => undefined);
    vi.doMock("@/server/auth", () => ({
      getActiveOrgId: vi.fn(async () => "org-1"),
    }));
    vi.doMock("@/server/firebase-admin", () => ({
      getAdminDb: () => ({
        collection: () => ({
          doc: () => ({
            collection: () => ({ doc: () => ({ delete: deletePending }) }),
          }),
        }),
      }),
    }));
    vi.doMock("@/server/meta-graph", () => ({
      exchangeForLongLivedToken: vi.fn(async () => ({
        token: "long-token",
        expiresAt: 123,
      })),
      fetchPages: vi.fn(async () => [
        { id: "page-1", accessToken: "page-token" },
      ]),
      fetchInstagramProfile: vi.fn(async () => ({
        id: "ig-1",
        username: "studio",
      })),
      storeMetaConnection,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ json: async () => ({ access_token: "short" }) })),
    );
    const { GET } = await import("./integrations/meta/callback/route");
    const state = encodedState({ organizationId: "org-1", nonce: "nonce-1" });

    const response = await GET(
      nextRequest(
        `https://app.test/api/integrations/meta/callback?code=code&state=${state}`,
        "meta_oauth_state=nonce-1",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://app.test/dashboard/instagram?meta=connected",
    );
    expect(storeMetaConnection).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ id: "page-1" }),
      expect.objectContaining({ id: "ig-1" }),
      123,
    );
    expect(deletePending).toHaveBeenCalled();
  });

  it("rejects Dropbox callback state for a different active org", async () => {
    vi.doMock("@/server/auth", () => ({
      getActiveOrgId: vi.fn(async () => "org-2"),
    }));
    vi.doMock("@/server/dropbox", () => ({}));
    const { GET } = await import("./integrations/dropbox/callback/route");
    const state = encodedState({
      organizationId: "org-1",
      nonce: "nonce-1",
      returnTo: "/dashboard/projects/p-1",
    });

    const response = await GET(
      nextRequest(
        `https://app.test/api/integrations/dropbox/callback?code=code&state=${state}`,
        "dropbox_oauth_state=nonce-1",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://app.test/dashboard/projects/p-1?dropbox=state_error",
    );
  });

  it("exchanges and stores Dropbox tokens for the active org", async () => {
    const storeDropboxConnection = vi.fn(async () => undefined);
    vi.doMock("@/server/auth", () => ({
      getActiveOrgId: vi.fn(async () => "org-1"),
    }));
    vi.doMock("@/server/dropbox", () => ({
      fetchDropboxAccount: vi.fn(async () => ({
        accountId: "account-1",
        name: "Studio",
      })),
      storeDropboxConnection,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({
          access_token: "access",
          refresh_token: "refresh",
          account_id: "account-1",
          expires_in: 3600,
        }),
      })),
    );
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));
    const { GET } = await import("./integrations/dropbox/callback/route");
    const state = encodedState({
      organizationId: "org-1",
      nonce: "nonce-1",
      returnTo: "/dashboard/projects/p-1?tab=settings",
    });

    const response = await GET(
      nextRequest(
        `https://tenant.test/api/integrations/dropbox/callback?code=code&state=${state}`,
        "dropbox_oauth_state=nonce-1",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://tenant.test/dashboard/projects/p-1?tab=settings&dropbox=connected",
    );
    expect(storeDropboxConnection).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        accessToken: "access",
        refreshToken: "refresh",
        accountId: "account-1",
        expiresAt: Date.now() + 3_600_000,
      }),
      expect.objectContaining({ accountId: "account-1" }),
    );
    vi.useRealTimers();
  });
});

describe("authenticated file proxy routes", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("hides cross-org project documents and streams an authorized PDF", async () => {
    const download = vi.fn(async () => [Buffer.from("pdf-bytes")]);
    const getActiveOrgId = vi.fn(async () => "org-1");
    const documentData = {
      organizationId: "org-2",
      filePath: "contracts/file.pdf",
      fileName: "Signed Contract.pdf",
    };
    vi.doMock("@/server/auth", () => ({ getActiveOrgId }));
    vi.doMock("@/server/firebase-admin", () => ({
      getAdminDb: () => ({
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: true, data: () => documentData }),
          }),
        }),
      }),
      getAdminBucket: () => ({ file: () => ({ download }) }),
    }));
    const { GET } =
      await import("./project-documents/[documentId]/download/route");

    const hidden = await GET(nextRequest("https://app.test/api/download"), {
      params: Promise.resolve({ documentId: "doc-1" }),
    });
    expect(hidden.status).toBe(404);
    expect(download).not.toHaveBeenCalled();

    documentData.organizationId = "org-1";
    const response = await GET(
      nextRequest("https://app.test/api/download?inline=1"),
      {
        params: Promise.resolve({ documentId: "doc-1" }),
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="Signed Contract.pdf"',
    );
    expect(await response.text()).toBe("pdf-bytes");
  });

  it("confines Dropbox thumbnails to the linked project folder", async () => {
    const fetchDropboxThumbnail = vi.fn(async () => Buffer.from("jpeg"));
    const project = {
      organizationId: "org-1",
      imagerySets: { set1: { path: "/Project/Set 1" } },
    };
    vi.doMock("sharp", () => ({ default: vi.fn() }));
    vi.doMock("@/server/auth", () => ({
      getActiveOrgId: vi.fn(async () => "org-1"),
    }));
    vi.doMock("@/server/firebase-admin", () => ({
      getAdminDb: () => ({
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: true, data: () => project }),
          }),
        }),
      }),
    }));
    vi.doMock("@/server/dropbox", () => ({
      ALPHA_CAPABLE: new Set(["png"]),
      getValidDropboxAccessToken: vi.fn(async () => "token"),
      fetchDropboxOriginal: vi.fn(),
      fetchDropboxThumbnail,
    }));
    const { GET } =
      await import("./projects/[projectId]/imagery/[setId]/thumb/route");

    const escaped = await GET(
      nextRequest(
        "https://app.test/api/thumb?path=%2FProject%2FSecret%2Fimage.jpg",
      ),
      { params: Promise.resolve({ projectId: "p1", setId: "set1" }) },
    );
    expect(escaped.status).toBe(404);

    const response = await GET(
      nextRequest(
        "https://app.test/api/thumb?path=%2FProject%2FSet%201%2Fimage.jpg&size=full",
      ),
      { params: Promise.resolve({ projectId: "p1", setId: "set1" }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(fetchDropboxThumbnail).toHaveBeenCalledWith(
      "token",
      "/Project/Set 1/image.jpg",
      "w2048h1536",
    );
  });
});

describe("Brevo webhook route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("BREVO_WEBHOOK_SECRET", "webhook-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("requires the configured secret and records normalized delivery evidence", async () => {
    const writeContractAuditEvent = vi.fn(async () => undefined);
    const applyContractDisplay = vi.fn(async () => undefined);
    vi.doMock("@/server/brevo", () => ({
      normalizeBrevoWebhookEvent: vi.fn(() => ({
        type: "email_delivered",
        recipientEmail: "client@example.com",
        providerMessageId: "message-1",
        brevoEventId: "event-1",
        metadata: { contractId: "contract-1", organizationId: "org-1" },
      })),
    }));
    vi.doMock("@/server/contract-audit", () => ({ writeContractAuditEvent }));
    vi.doMock("@/server/contract-display", () => ({ applyContractDisplay }));
    const { POST } = await import("./webhooks/brevo/route");

    const denied = await POST(
      new NextRequest("https://app.test/api/webhooks/brevo", {
        method: "POST",
        body: JSON.stringify({ event: "delivered" }),
      }),
    );
    expect(denied.status).toBe(403);

    const response = await POST(
      new NextRequest("https://app.test/api/webhooks/brevo", {
        method: "POST",
        headers: {
          authorization: "Bearer webhook-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ event: "delivered" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(writeContractAuditEvent).toHaveBeenCalledWith(
      "contract-1",
      expect.objectContaining({
        type: "email_delivered",
        provider: "brevo",
        recipientEmail: "client@example.com",
      }),
      "brevo-email_delivered-event-1",
    );
    expect(applyContractDisplay).toHaveBeenCalledWith(
      "contract-1",
      "delivered",
      expect.any(Number),
    );
  });
});
