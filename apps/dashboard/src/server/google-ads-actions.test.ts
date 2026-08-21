import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Google Ads action authorization gate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("GOOGLE_ADS_CUSTOMER_ID", "999-888-7777");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("does not use the legacy env customer or mutate Ads without a verified org", async () => {
    const mutateGoogleAds = vi.fn();
    const searchGoogleAds = vi.fn();
    vi.doMock("./google-ads", () => ({
      hasGoogleAdsCredentials: vi.fn(() => true),
      mutateGoogleAds,
      searchGoogleAds,
    }));
    vi.doMock("./org-config", () => ({
      getActiveOrgConfig: vi.fn(async () => null),
    }));
    const { excludeSearchTerm } = await import("./google-ads-actions");

    await expect(
      excludeSearchTerm({ term: "free consultation", campaignId: "123-456" }),
    ).resolves.toEqual({
      success: false,
      error: "Google Ads is not configured for this organization yet.",
    });
    expect(searchGoogleAds).not.toHaveBeenCalled();
    expect(mutateGoogleAds).not.toHaveBeenCalled();
  });

  it("marks growth from zero as New while keeping zero-to-zero as no change", async () => {
    const searchGoogleAds = vi.fn().mockResolvedValue([
      {
        segments: { date: "2026-08-10" },
        metrics: {
          costMicros: "0",
          clicks: "5",
          impressions: "0",
          conversions: 0,
        },
      },
    ]);
    vi.doMock("./google-ads", () => ({
      hasGoogleAdsCredentials: vi.fn(() => true),
      mutateGoogleAds: vi.fn(),
      searchGoogleAds,
    }));
    vi.doMock("./org-config", () => ({
      getActiveOrgConfig: vi.fn(async () => ({
        googleAdsCustomerId: "123-456-7890",
      })),
    }));
    const { fetchAdsKpis } = await import("./google-ads-actions");

    const result = await fetchAdsKpis("2026-08-10_2026-08-11");

    expect(result.data?.clicks.change).toBe("New");
    expect(result.data?.spend.change).toBe("0.0%");
  });
});
