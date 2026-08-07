import { cache } from "react";

import { cookies } from "next/headers";

import { ACTIVE_ORG_COOKIE } from "@/lib/org-cookie";

import { getAdminDb } from "./firebase-admin";

interface OrgConfig {
  gaPropertyId?: string;
  gscSiteUrl?: string;
}

/**
 * Reads the active tenant's organizations/{orgId} document once per server
 * request (React.cache), cookie-scoped — callers never pass an org id, so
 * tenant isolation is unchanged.
 *
 * `hasOrg: false` means there is no active-organization cookie; `data: null`
 * with `hasOrg: true` means the read failed or the doc is missing.
 */
const readActiveOrg = cache(
  async (): Promise<{
    hasOrg: boolean;
    data: Record<string, unknown> | null;
  }> => {
    const cookieStore = await cookies();
    const organizationId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
    if (!organizationId) return { hasOrg: false, data: null };

    try {
      const orgSnap = await getAdminDb()
        .collection("organizations")
        .doc(organizationId)
        .get();
      return {
        hasOrg: true,
        data: orgSnap.exists ? (orgSnap.data() ?? {}) : null,
      };
    } catch (error) {
      console.error("Failed to resolve organization:", error);
      return { hasOrg: true, data: null };
    }
  },
);

/**
 * The active tenant's `config` map. Returns `null` when there is no
 * active-organization cookie (the signal for callers to fall back to their
 * env var), or an OrgConfig (possibly empty) when an org is active. A failed
 * read yields `{}`, i.e. "configured nothing" — never an env fallback for an
 * active org.
 */
export const getActiveOrgConfig = cache(async (): Promise<OrgConfig | null> => {
  const org = await readActiveOrg();
  if (!org.hasOrg) return null;
  return (org.data?.config ?? {}) as OrgConfig;
});

/** The active tenant's `companyProfile.website` (Company page), or null. */
export const getActiveOrgWebsite = cache(async (): Promise<string | null> => {
  const org = await readActiveOrg();
  const profile = org.data?.companyProfile as { website?: string } | undefined;
  const website = profile?.website?.trim();
  return website ? website : null;
});
