import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function mockConfiguredGA4(runReport: ReturnType<typeof vi.fn>) {
  vi.doMock("./ga4", () => ({
    getGA4Client: vi.fn(() => ({ runReport })),
    hasGA4Credentials: vi.fn(() => true),
  }));
  vi.doMock("./org-config", () => ({
    getActiveOrgConfig: vi.fn(async () => ({ gaPropertyId: "property-123" })),
  }));
}

describe("GA4 action authorization gate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("GA_PROPERTY_ID", "legacy-global-property");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("does not use the legacy env property or call GA4 without a verified org", async () => {
    const getGA4Client = vi.fn();
    vi.doMock("./ga4", () => ({
      getGA4Client,
      hasGA4Credentials: vi.fn(() => true),
    }));
    vi.doMock("./org-config", () => ({
      getActiveOrgConfig: vi.fn(async () => null),
    }));
    const { fetchRealtimeData } = await import("./analytics-actions");

    await expect(fetchRealtimeData()).resolves.toEqual({
      success: false,
      error: "Google Analytics 4 is not configured for this organization yet.",
    });
    expect(getGA4Client).not.toHaveBeenCalled();
  });

  it("marks growth from zero as New while keeping zero-to-zero as no change", async () => {
    const runReport = vi.fn().mockResolvedValue([
      {
        rows: [
          {
            dimensionValues: [{ value: "current" }],
            metricValues: [
              { value: "12" },
              { value: "0" },
              { value: "0" },
              { value: "0" },
              { value: "0" },
            ],
          },
          {
            dimensionValues: [{ value: "previous" }],
            metricValues: Array.from({ length: 5 }, () => ({ value: "0" })),
          },
        ],
      },
    ]);
    mockConfiguredGA4(runReport);
    const { fetchKpiData } = await import("./analytics-actions");

    const result = await fetchKpiData("today");

    expect(result.data?.uniqueVisitors.change).toBe("New");
    expect(result.data?.visits.change).toBe("0.0%");
  });

  it("uses the New sentinel for the home-page visits comparison", async () => {
    const runReport = vi.fn().mockResolvedValue([
      {
        rows: [
          {
            dimensionValues: [{ value: "current" }],
            metricValues: [{ value: "8" }],
          },
          {
            dimensionValues: [{ value: "previous" }],
            metricValues: [{ value: "0" }],
          },
        ],
      },
    ]);
    mockConfiguredGA4(runReport);
    const { fetchWebsiteVisits } = await import("./analytics-actions");

    const result = await fetchWebsiteVisits();

    expect(result.data?.comparison.change).toBe("New");
  });

  it.each(["not-a-range", "2026-99-99_2026-12-01", "2026-08-20_2026-08-19"])(
    "falls back safely for invalid custom range %s",
    async (range) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));
      const runReport = vi.fn().mockResolvedValue([{ rows: [] }]);
      mockConfiguredGA4(runReport);
      const { fetchKpiData } = await import("./analytics-actions");

      await expect(fetchKpiData(range)).resolves.toMatchObject({
        success: true,
        label: "last 4 weeks",
        comparisonLabel: "previous 4 weeks",
      });
      expect(runReport).toHaveBeenCalledWith(
        expect.objectContaining({
          dateRanges: [
            { startDate: "2026-07-24", endDate: "2026-08-20", name: "current" },
            {
              startDate: "2026-06-26",
              endDate: "2026-07-23",
              name: "previous",
            },
          ],
        }),
      );
    },
  );

  it("deduplicates identical Top Pages calls through React cache", async () => {
    vi.doMock("react", async () => {
      const actual = await vi.importActual<typeof import("react")>("react");
      return {
        ...actual,
        cache: <Args extends unknown[], Result>(
          fn: (...args: Args) => Result,
        ) => {
          const results = new Map<string, Result>();
          return (...args: Args) => {
            const key = JSON.stringify(args);
            if (!results.has(key)) results.set(key, fn(...args));
            return results.get(key) as Result;
          };
        },
      };
    });
    const runReport = vi.fn().mockResolvedValue([{ rows: [] }]);
    mockConfiguredGA4(runReport);
    const { fetchTopPagesData } = await import("./analytics-actions");

    await Promise.all([
      fetchTopPagesData("today", "Campaign A"),
      fetchTopPagesData("today", "Campaign A"),
    ]);

    expect(runReport).toHaveBeenCalledTimes(1);
  });
});
