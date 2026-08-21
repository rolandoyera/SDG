import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VerifiedCaller } from "./auth";

/** The ET month key the counters are stored under, derived independently. */
const PERIOD = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
}).format(new Date());

function caller(overrides: Partial<VerifiedCaller> = {}): VerifiedCaller {
  return {
    uid: "u1",
    email: "person@example.com",
    role: "Admin",
    fullName: "A Person",
    homeOrganizationId: "org-sarvian",
    organizationId: "org-sarvian",
    ...overrides,
  };
}

/** Loads ai-quota with the cached org-config read stubbed out. */
async function loadQuota(config: Record<string, unknown> | null) {
  vi.doMock("./org-config", () => ({
    getActiveOrgConfig: vi.fn(async () => config),
  }));
  vi.doMock("./firebase-admin", () => ({ getAdminDb: () => ({}) }));
  vi.doMock("firebase-admin/firestore", () => ({
    FieldValue: { increment: (n: number) => n },
  }));
  return import("./ai-quota");
}

describe("autofill quota", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("blocks a tenant that has reached its monthly limit", async () => {
    const { checkAutofillQuota } = await loadQuota({
      aiMonthlyLimit: 100,
      usage: { [PERIOD]: { autofills: 100 } },
    });
    expect(await checkAutofillQuota(caller())).toEqual({
      allowed: false,
      used: 100,
      limit: 100,
    });
  });

  it("allows a tenant one under its limit", async () => {
    const { checkAutofillQuota } = await loadQuota({
      aiMonthlyLimit: 100,
      usage: { [PERIOD]: { autofills: 99 } },
    });
    expect(await checkAutofillQuota(caller())).toEqual({
      allowed: true,
      used: 99,
      limit: 100,
    });
  });

  it("counts only the current month, so last month's usage does not block", async () => {
    const { checkAutofillQuota } = await loadQuota({
      aiMonthlyLimit: 100,
      usage: { "2020-01": { autofills: 5000 } },
    });
    expect(await checkAutofillQuota(caller())).toMatchObject({
      allowed: true,
      used: 0,
    });
  });

  it("applies the default limit when the tenant has none set", async () => {
    const { checkAutofillQuota } = await loadQuota({});
    expect(await checkAutofillQuota(caller())).toMatchObject({ limit: 100 });
  });

  it("treats a limit of 0 as the off switch, even with no usage yet", async () => {
    const { checkAutofillQuota } = await loadQuota({ aiMonthlyLimit: 0 });
    expect(await checkAutofillQuota(caller())).toEqual({
      allowed: false,
      used: 0,
      limit: 0,
    });
  });

  it("still exempts an uncapped org from a limit of 0", async () => {
    const { checkAutofillQuota } = await loadQuota({ aiMonthlyLimit: 0 });
    expect(
      await checkAutofillQuota(
        caller({ homeOrganizationId: "org-demo", organizationId: "org-demo" }),
      ),
    ).toMatchObject({ allowed: true });
  });

  it("never caps a SuperAdmin, even while operating inside a capped tenant", async () => {
    const { checkAutofillQuota } = await loadQuota({
      aiMonthlyLimit: 1,
      usage: { [PERIOD]: { autofills: 9999 } },
    });
    expect(
      await checkAutofillQuota(caller({ role: "SuperAdmin" })),
    ).toMatchObject({ allowed: true });
  });

  it("never caps the demo sandbox", async () => {
    const { checkAutofillQuota } = await loadQuota({
      aiMonthlyLimit: 1,
      usage: { [PERIOD]: { autofills: 9999 } },
    });
    expect(
      await checkAutofillQuota(
        caller({ homeOrganizationId: "org-demo", organizationId: "org-demo" }),
      ),
    ).toMatchObject({ allowed: true });
  });

  it("caps a tenant SuperAdmin's org by home org, not by the active one", async () => {
    // A SuperAdmin homed in a tenant is still exempt by role; the org-based
    // exemption must not leak just because the ACTIVE org is the sandbox.
    const { checkAutofillQuota } = await loadQuota({
      aiMonthlyLimit: 1,
      usage: { [PERIOD]: { autofills: 9999 } },
    });
    expect(
      await checkAutofillQuota(
        caller({ role: "Admin", organizationId: "org-demo" }),
      ),
    ).toMatchObject({ allowed: false });
  });

  it("keys the usage period to the ET month", async () => {
    const { currentUsagePeriod } = await loadQuota({});
    expect(currentUsagePeriod()).toBe(PERIOD);
  });
});
