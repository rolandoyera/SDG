import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const AUTH_COOKIE = "auth-token";
const ACTIVE_ORG_COOKIE = "active-org";

function mockRequest(options?: {
  token?: string;
  activeOrg?: string;
  host?: string;
  hostOrgs?: Record<string, string>;
  decoded?: { uid: string; email?: string };
  verifyError?: Error;
  profile?: Record<string, unknown>;
}) {
  const values = new Map<string, string>();
  if (options?.token) values.set(AUTH_COOKIE, options.token);
  if (options?.activeOrg) values.set(ACTIVE_ORG_COOKIE, options.activeOrg);

  const cookies = vi.fn(async () => ({
    get: vi.fn((name: string) => {
      const value = values.get(name);
      return value ? { value } : undefined;
    }),
  }));
  const headers = vi.fn(async () => ({
    get: vi.fn((name: string) =>
      name === "host" ? (options?.host ?? null) : null,
    ),
  }));
  const verifyIdToken = options?.verifyError
    ? vi.fn(async () => {
        throw options.verifyError;
      })
    : vi.fn(async () => options?.decoded ?? { uid: "user-1" });
  const get = vi.fn(async () => ({
    data: () => options?.profile,
  }));
  const doc = vi.fn(() => ({ get }));

  vi.doMock("react", async () => {
    const actual = await vi.importActual<typeof import("react")>("react");
    return { ...actual, cache: <T>(fn: T) => fn };
  });
  vi.doMock("next/headers", () => ({ cookies, headers }));
  vi.doMock("@/lib/auth-cookie", () => ({ AUTH_TOKEN_COOKIE: AUTH_COOKIE }));
  vi.doMock("@/lib/org-cookie", () => ({ ACTIVE_ORG_COOKIE }));
  vi.doMock("@/config/app-config", () => ({
    resolveHostOrg: (host?: string | null) =>
      (host ? options?.hostOrgs?.[host] : null) ?? null,
  }));
  vi.doMock("./firebase-admin", () => ({
    getAdminAuth: () => ({ verifyIdToken }),
    getAdminDb: () => ({ doc }),
  }));

  return { cookies, verifyIdToken, doc, get };
}

describe("verified caller resolution", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns null without a token and never reads Firebase", async () => {
    const mocks = mockRequest();
    const { getVerifiedCaller } = await import("./auth");

    await expect(getVerifiedCaller()).resolves.toBeNull();
    expect(mocks.verifyIdToken).not.toHaveBeenCalled();
    expect(mocks.doc).not.toHaveBeenCalled();
  });

  it("treats an unverifiable token as signed out", async () => {
    const mocks = mockRequest({
      token: "expired",
      verifyError: new Error("expired"),
    });
    const { getVerifiedCaller } = await import("./auth");

    await expect(getVerifiedCaller()).resolves.toBeNull();
    expect(mocks.verifyIdToken).toHaveBeenCalledWith("expired");
    expect(mocks.doc).not.toHaveBeenCalled();
  });

  it.each([
    ["missing profile", undefined],
    ["profile without an organization", { status: "Active" }],
    [
      "pending profile",
      { organizationId: "org-home", status: "Pending", role: "Admin" },
    ],
  ])("rejects a %s", async (_label, profile) => {
    mockRequest({ token: "valid", profile });
    const { getVerifiedCaller } = await import("./auth");

    await expect(getVerifiedCaller()).resolves.toBeNull();
  });

  it("pins a contributor to their profile org despite a forged selector", async () => {
    const mocks = mockRequest({
      token: "valid",
      activeOrg: "org-forged",
      decoded: { uid: "user-1", email: "member@example.com" },
      profile: {
        organizationId: "org-home",
        fullName: "Member Name",
        role: "Contributor",
        status: "Active",
      },
    });
    const { getActiveOrgId, getVerifiedCaller } = await import("./auth");

    await expect(getVerifiedCaller()).resolves.toEqual({
      uid: "user-1",
      email: "member@example.com",
      role: "Contributor",
      fullName: "Member Name",
      homeOrganizationId: "org-home",
      organizationId: "org-home",
    });
    await expect(getActiveOrgId()).resolves.toBe("org-home");
    expect(mocks.doc).toHaveBeenCalledWith("users/user-1");
  });

  it("honors a SuperAdmin active-org selector and falls back to verified email for the name", async () => {
    mockRequest({
      token: "valid",
      activeOrg: "org-selected",
      decoded: { uid: "super-1", email: "super@example.com" },
      profile: {
        organizationId: "org-home",
        role: "SuperAdmin",
        status: "Active",
      },
    });
    const { getVerifiedCaller } = await import("./auth");

    await expect(getVerifiedCaller()).resolves.toMatchObject({
      uid: "super-1",
      role: "SuperAdmin",
      fullName: "super@example.com",
      homeOrganizationId: "org-home",
      organizationId: "org-selected",
    });
  });

  it("pins a SuperAdmin to the white-label host org over the cookie selector", async () => {
    mockRequest({
      token: "valid",
      activeOrg: "org-selected",
      host: "studio.white-label.test",
      hostOrgs: { "studio.white-label.test": "org-host" },
      decoded: { uid: "super-1", email: "super@example.com" },
      profile: {
        organizationId: "org-home",
        role: "SuperAdmin",
        status: "Active",
      },
    });
    const { getVerifiedCaller } = await import("./auth");

    await expect(getVerifiedCaller()).resolves.toMatchObject({
      homeOrganizationId: "org-home",
      organizationId: "org-host",
    });
  });

  it("leaves non-SuperAdmins on their profile org even on a white-label host", async () => {
    mockRequest({
      token: "valid",
      host: "studio.white-label.test",
      hostOrgs: { "studio.white-label.test": "org-host" },
      decoded: { uid: "user-1", email: "member@example.com" },
      profile: {
        organizationId: "org-home",
        role: "Admin",
        status: "Active",
      },
    });
    const { getVerifiedCaller } = await import("./auth");

    await expect(getVerifiedCaller()).resolves.toMatchObject({
      organizationId: "org-home",
    });
  });
});
