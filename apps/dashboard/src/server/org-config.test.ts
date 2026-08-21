import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function mockOrg(options?: {
  organizationId?: string | null;
  exists?: boolean;
  data?: Record<string, unknown>;
  error?: Error;
}) {
  const getActiveOrgId = vi.fn(async () => options?.organizationId ?? null);
  const get = options?.error
    ? vi.fn(async () => {
        throw options.error;
      })
    : vi.fn(async () => ({
        exists: options?.exists ?? true,
        data: () => options?.data,
      }));
  const doc = vi.fn(() => ({ get }));
  const collection = vi.fn(() => ({ doc }));

  vi.doMock("react", async () => {
    const actual = await vi.importActual<typeof import("react")>("react");
    return { ...actual, cache: <T>(fn: T) => fn };
  });
  vi.doMock("./auth", () => ({ getActiveOrgId }));
  vi.doMock("./firebase-admin", () => ({
    getAdminDb: () => ({ collection }),
  }));

  return { getActiveOrgId, collection, doc, get };
}

describe("active organization configuration", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns null without a verified active org and does not read Firestore", async () => {
    const mocks = mockOrg({ organizationId: null });
    const { getActiveOrgConfig } = await import("./org-config");

    await expect(getActiveOrgConfig()).resolves.toBeNull();
    expect(mocks.collection).not.toHaveBeenCalled();
  });

  it.each([
    ["missing document", { exists: false }],
    ["failed read", { error: new Error("unavailable") }],
  ])(
    "returns an empty config for an active org with a %s",
    async (_label, state) => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      mockOrg({ organizationId: "org-1", ...state });
      const { getActiveOrgConfig } = await import("./org-config");

      await expect(getActiveOrgConfig()).resolves.toEqual({});
    },
  );

  it("reads config and normalized company fields only from the active org", async () => {
    const mocks = mockOrg({
      organizationId: "org-selected",
      data: {
        config: {
          gaPropertyId: "ga-1",
          gscSiteUrl: "https://example.com",
          googleAdsCustomerId: "123-456",
        },
        companyProfile: {
          displayName: "  Example Studio  ",
          website: "  https://example.com  ",
          address: { state: " FL ", country: " US " },
        },
        seo: {
          competitors: [
            { name: "One", url: "https://one.example" },
            { name: "Missing URL" },
            null,
          ],
        },
      },
    });
    const {
      getActiveOrgCompanyAddress,
      getActiveOrgCompanyName,
      getActiveOrgConfig,
      getActiveOrgSeoCompetitors,
      getActiveOrgWebsite,
    } = await import("./org-config");

    await expect(getActiveOrgConfig()).resolves.toEqual({
      gaPropertyId: "ga-1",
      gscSiteUrl: "https://example.com",
      googleAdsCustomerId: "123-456",
    });
    await expect(getActiveOrgWebsite()).resolves.toBe("https://example.com");
    await expect(getActiveOrgCompanyName()).resolves.toBe("Example Studio");
    await expect(getActiveOrgCompanyAddress()).resolves.toEqual({
      state: "FL",
      country: "US",
    });
    await expect(getActiveOrgSeoCompetitors()).resolves.toEqual([
      { name: "One", url: "https://one.example" },
    ]);
    expect(mocks.doc).toHaveBeenCalledWith("org-selected");
  });
});
