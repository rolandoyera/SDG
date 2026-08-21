import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("Instagram KPI comparisons", () => {
  it("marks growth from zero as New while keeping zero-to-zero as no change", async () => {
    const zeroKpis = {
      reach: 0,
      views: 0,
      profileViews: 0,
      accountsEngaged: 0,
      likes: 0,
      comments: 0,
      websiteClicks: 0,
    };
    const fetchAccountKpis = vi
      .fn()
      .mockResolvedValueOnce({ ...zeroKpis, reach: 10 })
      .mockResolvedValueOnce(zeroKpis);

    vi.doMock("next/cache", () => ({
      revalidatePath: vi.fn(),
      unstable_cache: (fn: unknown) => fn,
    }));
    vi.doMock("firebase-admin/firestore", () => ({
      FieldValue: { delete: vi.fn() },
    }));
    vi.doMock("./auth", () => ({
      getActiveOrgId: vi.fn(async () => "org-1"),
    }));
    vi.doMock("./firebase-admin", () => ({ getAdminDb: vi.fn() }));
    vi.doMock("./meta-snapshots", () => ({
      getLatestSnapshot: vi.fn(),
      getSnapshotRange: vi.fn(),
    }));
    vi.doMock("./meta-graph", () => ({
      fetchAccountKpis,
      fetchFollowerCount: vi.fn(),
      fetchFollowerDemographics: vi.fn(),
      fetchFollowerGains: vi.fn(),
      fetchInstagramProfile: vi.fn(),
      fetchPages: vi.fn(),
      fetchReachTrend: vi.fn(),
      fetchRecentMedia: vi.fn(),
      getStoredMetaCreds: vi.fn(async () => ({ token: "token", igId: "ig-1" })),
      storeMetaConnection: vi.fn(),
    }));
    const { fetchInstagramKpis } = await import("./meta-actions");

    const result = await fetchInstagramKpis("last-7-days");

    expect(result.data?.reach.change).toBe("New");
    expect(result.data?.views.change).toBe("0.0%");
  });
});
