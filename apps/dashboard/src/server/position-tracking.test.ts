import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("position tracking helpers", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("composes canonical US locations and safely falls back country-wide", async () => {
    vi.doMock("./firebase-admin", () => ({ getAdminDb: vi.fn() }));
    const { composeLocation, FALLBACK_LOCATION } =
      await import("./position-tracking");

    expect(composeLocation("  boca raton ", "fl", "us")).toBe(
      "Boca Raton,Florida,United States",
    );
    expect(composeLocation("Miami,Florida,United States", "FL", "US")).toBe(
      "Miami,Florida,United States",
    );
    expect(composeLocation("Paris", null, "FR")).toBe(FALLBACK_LOCATION);
    expect(composeLocation("", "FL", "US")).toBe(FALLBACK_LOCATION);
  });

  it("uses the America/New_York calendar day", async () => {
    vi.doMock("./firebase-admin", () => ({ getAdminDb: vi.fn() }));
    const { easternDateKey } = await import("./position-tracking");

    expect(easternDateKey(new Date("2026-01-01T04:59:59Z"))).toBe("2025-12-31");
    expect(easternDateKey(new Date("2026-01-01T05:00:00Z"))).toBe("2026-01-01");
  });

  it("chooses one page of adaptive slack without exceeding the deep cap", async () => {
    vi.doMock("./firebase-admin", () => ({ getAdminDb: vi.fn() }));
    const { adaptiveDepth, DEEP_SERP_DEPTH } =
      await import("./position-tracking");

    expect(adaptiveDepth(null)).toBe(DEEP_SERP_DEPTH);
    expect(adaptiveDepth(1)).toBe(20);
    expect(adaptiveDepth(10)).toBe(20);
    expect(adaptiveDepth(11)).toBe(30);
    expect(adaptiveDepth(79)).toBe(DEEP_SERP_DEPTH);
  });

  it("normalizes website domains and finds only organic exact-domain placements", async () => {
    vi.doMock("./firebase-admin", () => ({ getAdminDb: vi.fn() }));
    const { findPlacement, websiteDomain } =
      await import("./position-tracking");
    const domain = websiteDomain("https://www.Example.com/work?ref=1");

    expect(domain).toBe("example.com");
    expect(
      findPlacement(
        [
          {
            type: "paid",
            rank_absolute: 1,
            domain: "example.com",
            url: "paid",
          },
          {
            type: "organic",
            rank_absolute: 2,
            domain: "other.example",
            url: "other",
          },
          {
            type: "organic",
            rank_absolute: 7,
            domain: "www.EXAMPLE.com",
            url: "https://example.com/service",
          },
        ],
        domain,
      ),
    ).toEqual({ position: 7, url: "https://example.com/service" });
    expect(findPlacement([], domain)).toEqual({ position: null, url: null });
  });

  it("creates per-org HMAC postback URLs only when fully configured", async () => {
    vi.doMock("./firebase-admin", () => ({ getAdminDb: vi.fn() }));
    vi.stubEnv("CRON_SECRET", "cron-secret");
    vi.stubEnv("DATAFORSEO_POSTBACK_URL", "https://hooks.example.test");
    const { postbackConfigured, postbackToken, postbackUrlFor } =
      await import("./position-tracking");
    const expected = createHmac("sha256", "cron-secret")
      .update("org/one")
      .digest("hex");

    expect(postbackConfigured()).toBe(true);
    expect(postbackToken("org/one")).toBe(expected);
    expect(postbackUrlFor("org/one")).toBe(
      `https://hooks.example.test/api/dataforseo/postback?org=org%2Fone&token=${expected}`,
    );
  });
});

describe("DataForSEO position-tracking client behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATAFORSEO_LOGIN", "login");
    vi.stubEnv("DATAFORSEO_PASSWORD", "password");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("ranks location prefix matches by home state, then name length", async () => {
    vi.doMock("./firebase-admin", () => ({ getAdminDb: vi.fn() }));
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        tasks: [
          {
            status_code: 20000,
            result: [
              {
                location_name: "Miami,Texas,United States",
                location_type: "City",
              },
              {
                location_name: "Tamiami,Florida,United States",
                location_type: "City",
              },
              {
                location_name: "Miami Gardens,Florida,United States",
                location_type: "City",
              },
              {
                location_name: "Miami,Florida,United States",
                location_type: "City",
              },
            ],
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { searchSerpLocations } = await import("./position-tracking");

    await expect(searchSerpLocations("US", "FL", "mia")).resolves.toEqual([
      { name: "Miami,Florida,United States", type: "City" },
      { name: "Miami Gardens,Florida,United States", type: "City" },
      { name: "Miami,Texas,United States", type: "City" },
      { name: "Tamiami,Florida,United States", type: "City" },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.dataforseo.com/v3/serp/google/locations/us",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("retries rejected task locations country-wide and reports downgrades", async () => {
    vi.doMock("./firebase-admin", () => ({ getAdminDb: vi.fn() }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tasks: [
            { id: "task-1", status_code: 20100, status_message: "created" },
            {
              id: "rejected",
              status_code: 40501,
              status_message: "bad location",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tasks: [
            { id: "task-2", status_code: 20100, status_message: "created" },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Date, "now").mockReturnValue(1_234);
    const { postSerpTasks, FALLBACK_LOCATION } =
      await import("./position-tracking");

    const result = await postSerpTasks([
      {
        keyword: "interior designer",
        location: "Miami,Florida,United States",
        depth: 30,
      },
      { keyword: "home designer", location: "Invalid City", depth: 80 },
    ]);

    expect(result).toEqual({
      tasks: [
        {
          id: "task-1",
          keyword: "interior designer",
          location: "Miami,Florida,United States",
          depth: 30,
          queuedAt: 1_234,
        },
        {
          id: "task-2",
          keyword: "home designer",
          location: FALLBACK_LOCATION,
          depth: 80,
          queuedAt: 1_234,
        },
      ],
      downgraded: ["home designer"],
    });
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(secondBody).toEqual([
      expect.objectContaining({
        keyword: "home designer",
        location_name: FALLBACK_LOCATION,
      }),
    ]);
  });
});

describe("atomic position snapshot updates", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("merges keyword rows while atomically replacing pending tasks", async () => {
    const snapshotRef = { kind: "snapshot", id: "2026-08-20" };
    const orgRef = {
      kind: "org",
      collection: vi.fn(() => ({ doc: vi.fn(() => snapshotRef) })),
    };
    const txn = {
      get: vi.fn(async (ref: { kind: string }) =>
        ref.kind === "snapshot"
          ? {
              data: () => ({
                results: [
                  {
                    keyword: "keep",
                    position: 4,
                    url: "https://example.com/keep",
                  },
                  {
                    keyword: "replace",
                    position: 20,
                    url: "https://example.com/old",
                  },
                ],
              }),
            }
          : {
              data: () => ({
                seo: {
                  pendingChecks: [
                    { id: "remove", keyword: "replace" },
                    { id: "keep-task", keyword: "keep" },
                  ],
                },
              }),
            },
      ),
      set: vi.fn(),
    };
    const db = {
      collection: vi.fn(() => ({ doc: vi.fn(() => orgRef) })),
      runTransaction: vi.fn(
        async (callback: (arg: typeof txn) => Promise<void>) => callback(txn),
      ),
    };
    vi.doMock("./firebase-admin", () => ({ getAdminDb: () => db }));
    const { applyCheckOutcome } = await import("./position-tracking");
    const newTask = {
      id: "new-task",
      keyword: "new",
      location: "United States",
      depth: 80,
      queuedAt: Date.now(),
    };

    await applyCheckOutcome("org-1", {
      results: [
        { keyword: "replace", position: 8, url: "https://example.com/new" },
        { keyword: "added", position: null, url: null },
      ],
      removeTaskIds: ["remove"],
      addTasks: [newTask],
    });

    expect(db.runTransaction).toHaveBeenCalledOnce();
    expect(txn.set).toHaveBeenCalledWith(snapshotRef, {
      date: "2026-08-20",
      results: [
        { keyword: "keep", position: 4, url: "https://example.com/keep" },
        { keyword: "replace", position: 8, url: "https://example.com/new" },
        { keyword: "added", position: null, url: null },
      ],
      createdAt: Date.now(),
    });
    expect(txn.set).toHaveBeenCalledWith(
      orgRef,
      {
        seo: {
          pendingChecks: [{ id: "keep-task", keyword: "keep" }, newTask],
        },
      },
      { merge: true },
    );
  });

  it("does not open a transaction for an empty outcome", async () => {
    const runTransaction = vi.fn();
    vi.doMock("./firebase-admin", () => ({
      getAdminDb: () => ({ runTransaction }),
    }));
    const { applyCheckOutcome } = await import("./position-tracking");

    await applyCheckOutcome("org-1", {});
    expect(runTransaction).not.toHaveBeenCalled();
  });
});
