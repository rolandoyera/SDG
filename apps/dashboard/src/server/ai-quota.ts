// Per-tenant vendor usage counters and the autofill cap.
//
// Counters live on organizations/{orgId}.config.usage["YYYY-MM"] rather than in
// their own collection because getActiveOrgConfig already reads that document
// once per request (React.cache) — so the quota check costs no extra read.
//
// Each metered event writes as it happens rather than being batched at the end
// of an autofill: the scrape chain returns early from several branches, and a
// single write at the bottom would silently miss all of them.

import { FieldValue } from "firebase-admin/firestore";

import { UNCAPPED_ORG_IDS } from "@/config/app-config";
import type { OrgUsageCounters } from "@/lib/types";

import type { VerifiedCaller } from "./auth";
import { getAdminDb } from "./firebase-admin";
import { getActiveOrgConfig } from "./org-config";
import { easternDateKey } from "./position-tracking";

/** Applied when a tenant has no explicit aiMonthlyLimit. */
export const DEFAULT_AI_MONTHLY_LIMIT = 100;

/** ET calendar month, matching the ET days aiUsage is keyed by. */
export function currentUsagePeriod(): string {
  return easternDateKey().slice(0, 7);
}

/**
 * Fire-and-forget (`void recordOrgUsage(...)`). Never throws — losing a counter
 * must not fail a tenant's autofill.
 */
export async function recordOrgUsage(
  organizationId: string,
  delta: OrgUsageCounters,
): Promise<void> {
  try {
    const increments = Object.fromEntries(
      Object.entries(delta)
        .filter(([, amount]) => Boolean(amount))
        .map(([field, amount]) => [
          field,
          FieldValue.increment(amount as number),
        ]),
    );
    if (Object.keys(increments).length === 0) return;

    await getAdminDb()
      .collection("organizations")
      .doc(organizationId)
      .set(
        { config: { usage: { [currentUsagePeriod()]: increments } } },
        { merge: true },
      );
  } catch (error) {
    console.error("[Org Usage] Failed to record usage:", error);
  }
}

export interface QuotaCheck {
  allowed: boolean;
  used: number;
  /** Autofills allowed this month. 0 blocks the tenant outright. */
  limit: number;
}

/**
 * Whether the caller's active org may run another autofill this ET month.
 *
 * Two exemptions: SuperAdmins are cross-org platform operators, so capping them
 * caps ourselves; and UNCAPPED_ORG_IDS covers the demo sandbox. Both key on the
 * caller's HOME org, not the active one — a SuperAdmin working inside a tenant
 * still records usage against that tenant, they just are not blocked by it.
 */
export async function checkAutofillQuota(
  caller: VerifiedCaller,
): Promise<QuotaCheck> {
  if (
    caller.role === "SuperAdmin" ||
    UNCAPPED_ORG_IDS.has(caller.homeOrganizationId)
  ) {
    return { allowed: true, used: 0, limit: 0 };
  }

  const config = await getActiveOrgConfig();
  // An unset limit falls back to the default; an explicit 0 is the off switch,
  // the only per-tenant way to stop AI spend without revoking the shared key.
  // There is deliberately no "unlimited" value — set a large number instead, so
  // one field never has to mean three different things.
  const limit = config?.aiMonthlyLimit ?? DEFAULT_AI_MONTHLY_LIMIT;
  const used = config?.usage?.[currentUsagePeriod()]?.autofills ?? 0;
  return { allowed: used < limit, used, limit };
}
