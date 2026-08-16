import { cache } from "react";

import { getActiveOrgId } from "./auth";
import { getAdminDb } from "./firebase-admin";

interface OrgConfig {
  gaPropertyId?: string;
  gscSiteUrl?: string;
  googleAdsCustomerId?: string;
}

/**
 * Reads the active tenant's organizations/{orgId} document once per server
 * request (React.cache), resolved from the VERIFIED caller — callers never pass
 * an org id, so tenant isolation is enforced server-side.
 *
 * `hasOrg: false` means the request carries no valid session; `data: null`
 * with `hasOrg: true` means the read failed or the doc is missing.
 */
const readActiveOrg = cache(
  async (): Promise<{
    hasOrg: boolean;
    data: Record<string, unknown> | null;
  }> => {
    const organizationId = await getActiveOrgId();
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

/** The active tenant's company address state/country codes (Company page). */
export const getActiveOrgCompanyAddress = cache(
  async (): Promise<{ state: string | null; country: string | null }> => {
    const org = await readActiveOrg();
    const profile = org.data?.companyProfile as
      | { address?: { state?: string; country?: string } }
      | undefined;
    return {
      state: profile?.address?.state?.trim() || null,
      country: profile?.address?.country?.trim() || null,
    };
  },
);

/** The active tenant's company display name (Company page), or null. */
export const getActiveOrgCompanyName = cache(
  async (): Promise<string | null> => {
    const org = await readActiveOrg();
    const profile = org.data?.companyProfile as
      | { displayName?: string }
      | undefined;
    const name = profile?.displayName?.trim();
    return name ? name : null;
  },
);

/** The active tenant's saved SEO competitors (`seo.competitors`). */
export const getActiveOrgSeoCompetitors = cache(
  async (): Promise<{ name: string; url: string }[]> => {
    const org = await readActiveOrg();
    const seo = org.data?.seo as
      | { competitors?: { name?: string; url?: string }[] }
      | undefined;
    return (seo?.competitors ?? []).flatMap((entry) =>
      entry?.name && entry?.url ? [{ name: entry.name, url: entry.url }] : [],
    );
  },
);
