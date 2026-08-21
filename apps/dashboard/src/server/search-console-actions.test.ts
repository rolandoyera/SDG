import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Search Console action authorization gate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("GSC_SITE_URL", "sc-domain:legacy-global.example");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("does not use the legacy env site or call GSC without a verified org", async () => {
    const getGSCClient = vi.fn();
    vi.doMock("./gsc", () => ({
      getGSCClient,
      hasGSCCredentials: vi.fn(() => true),
    }));
    vi.doMock("./org-config", () => ({
      getActiveOrgConfig: vi.fn(async () => null),
    }));
    const { fetchSearchTotals } = await import("./search-console-actions");

    await expect(fetchSearchTotals()).resolves.toEqual({
      success: false,
      error:
        "Google Search Console is not configured for this organization yet.",
    });
    expect(getGSCClient).not.toHaveBeenCalled();
  });
});
