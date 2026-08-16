import { cache } from "react";

import { cookies } from "next/headers";

import { AUTH_TOKEN_COOKIE } from "@/lib/auth-cookie";
import { ACTIVE_ORG_COOKIE } from "@/lib/org-cookie";
import type { UserProfile } from "@/lib/types";

import { getAdminAuth, getAdminDb } from "./firebase-admin";

export interface VerifiedCaller {
  uid: string;
  email?: string;
  role: UserProfile["role"];
  /** The org on the caller's own profile document. */
  homeOrganizationId: string;
  /**
   * The org this request operates on. Equal to homeOrganizationId for everyone
   * except SuperAdmins, who may select any org via the active-org cookie.
   */
  organizationId: string;
}

/**
 * The authenticated caller behind the current request, or null.
 *
 * Identity comes from the Firebase ID token cookie (verified with
 * firebase-admin — an unverifiable/expired token is treated as signed out) and
 * authorization from the caller's users/{uid} profile, read server-side. The
 * active-org cookie is ONLY honored as an org selector for SuperAdmins; for
 * everyone else the org is always the profile's own organizationId, so a forged
 * cookie can never reach another tenant.
 *
 * Wrapped in React.cache so the token verification + profile read happen once
 * per request no matter how many actions/helpers ask.
 */
export const getVerifiedCaller = cache(
  async (): Promise<VerifiedCaller | null> => {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_TOKEN_COOKIE)?.value;
    if (!token) return null;

    let uid: string;
    let email: string | undefined;
    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      uid = decoded.uid;
      email = decoded.email;
    } catch {
      return null;
    }

    const snap = await getAdminDb().doc(`users/${uid}`).get();
    const profile = snap.data() as Partial<UserProfile> | undefined;
    // Access is invite-only: no profile or no org means the account carries no
    // tenant authority. Pending invite docs are email-keyed, never uid-keyed,
    // but reject the status defensively anyway.
    if (!profile?.organizationId || profile.status === "Pending") return null;

    const role = profile.role ?? "Contributor";
    const requestedOrg = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
    const organizationId =
      role === "SuperAdmin" && requestedOrg
        ? requestedOrg
        : profile.organizationId;

    return {
      uid,
      email,
      role,
      homeOrganizationId: profile.organizationId,
      organizationId,
    };
  },
);

/**
 * The verified caller's active org id, or null when the request carries no
 * valid session. Drop-in replacement for the old raw active-org cookie read.
 */
export async function getActiveOrgId(): Promise<string | null> {
  return (await getVerifiedCaller())?.organizationId ?? null;
}
