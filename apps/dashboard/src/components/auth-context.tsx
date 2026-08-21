"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  signOut as firebaseSignOut,
  onIdTokenChanged,
  type User,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";

import { resolveHostOrg } from "@/config/app-config";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth-cookie";
import {
  deleteClientCookie,
  getClientCookie,
  setClientCookie,
} from "@/lib/cookie.client";
import { auth, db } from "@/lib/firebase";
import { ACTIVE_ORG_COOKIE } from "@/lib/org-cookie";
import type { UserProfile } from "@/lib/types";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  /**
   * Stable primitive projections of `profile`. Prefer these in effect dependency
   * arrays: unlike the `profile` object (whose identity changes on every profile
   * onSnapshot/lastActive update), these only change when their value changes, so
   * an effect keyed on `organizationId` won't refetch on each heartbeat.
   *
   * `organizationId` is the ACTIVE org for this session — the profile's own org
   * for Admins/Contributors, or the selected org for a SuperAdmin working in
   * another tenant. On a white-label host it is always that host's org.
   */
  organizationId: string | null;
  uid: string | null;
  role: UserProfile["role"] | null;
  loading: boolean;
  /**
   * The org this domain is pinned to via `hostOrgs` (white-label hosts), or
   * null on open domains. When set, the active org is always this org and
   * `setActiveOrganization` is a no-op — switch tenants from an open domain.
   */
  hostPinnedOrgId: string | null;
  signOut: () => Promise<void>;
  /**
   * SuperAdmin-only: switch the org this session operates on. The server
   * re-validates the role on every request, so for anyone else this is a no-op.
   * Also a no-op on white-label hosts, which are pinned to their tenant.
   */
  setActiveOrganization: (organizationId: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // The host never changes within a page lifetime; resolve once. Null during
  // SSR is fine — everything below AuthGuard renders client-side after loading.
  const [hostPinnedOrgId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : resolveHostOrg(window.location.host),
  );

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    // undefined = "no callback yet", so the first fire (even a signed-out null)
    // always falls through to the state updates below.
    let currentUid: string | null | undefined;

    const unsubscribeAuth = onIdTokenChanged(auth, async (firebaseUser) => {
      // Mirror the ID token into a cookie so server actions and API routes can
      // verify the caller with firebase-admin. onIdTokenChanged also fires on
      // the SDK's hourly token refresh, keeping the cookie fresh.
      if (firebaseUser) {
        setClientCookie(AUTH_TOKEN_COOKIE, await firebaseUser.getIdToken(), 30);
      } else {
        deleteClientCookie(AUTH_TOKEN_COOKIE);
      }

      // Token refreshes re-fire this callback for the same user; only rebuild
      // the profile listener when the signed-in uid actually changes.
      if ((firebaseUser?.uid ?? null) === currentUid) return;
      currentUid = firebaseUser?.uid ?? null;

      setUser(firebaseUser);

      // Clean up previous profile listener if any
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (firebaseUser) {
        // Set up real-time listener for user profile document
        const profileRef = doc(db, "users", firebaseUser.uid);
        unsubscribeProfile = onSnapshot(
          profileRef,
          (snapshot) => {
            const data = snapshot.data();
            if (snapshot.exists() && data?.organizationId) {
              const role: UserProfile["role"] = data.role || "Contributor";
              setProfile({
                uid: firebaseUser.uid,
                fullName: data.fullName || "User",
                displayName: data.displayName,
                email: data.email || firebaseUser.email || "",
                role,
                organizationId: data.organizationId,
                status: data.status || "Active",
                joinedDate: data.joinedDate || "",
                lastActive: data.lastActive || 0,
                location: data.location,
                phone: data.phone,
              });
              // SuperAdmins may keep a previously selected org across reloads,
              // except on white-label hosts, where the host's org always wins;
              // everyone else is pinned to their profile org. The server
              // re-validates the role either way, so a tampered cookie can't
              // grant a non-SuperAdmin another tenant. Mirrors the precedence
              // in src/server/auth.ts — keep the two in sync.
              const rawOverride =
                role === "SuperAdmin"
                  ? (hostPinnedOrgId ?? getClientCookie(ACTIVE_ORG_COOKIE))
                  : null;
              const nextActiveOrg = rawOverride
                ? rawOverride
                : data.organizationId;
              setActiveOrgId(nextActiveOrg);
              setClientCookie(ACTIVE_ORG_COOKIE, nextActiveOrg, 30);
              setLoading(false);
              return;
            }

            // A snapshot with pending local writes is an optimistic echo of our
            // own merge write (e.g. AuthGuard's lastActive update) that fires
            // before the full server document has loaded. It can be missing
            // fields like organizationId, so it must never drive the
            // authorization verdict — wait for the server-confirmed snapshot.
            if (snapshot.metadata.hasPendingWrites) return;

            // Access is invite-only: a server-confirmed profile without an
            // organization is invalid and must never inherit another tenant's context.
            if (snapshot.exists()) {
              console.error(
                "User profile is missing organizationId; treating session as unauthorized.",
              );
            }
            setProfile(null);
            setActiveOrgId(null);
            deleteClientCookie(ACTIVE_ORG_COOKIE);
            setLoading(false);
          },
          (error) => {
            // permission-denied is expected as listeners tear down during sign-out;
            // the auth token is already gone, so it is not a real error.
            if ((error as { code?: string }).code !== "permission-denied") {
              console.error("Error listening to user profile:", error);
            }
            setLoading(false);
          },
        );
      } else {
        setProfile(null);
        setActiveOrgId(null);
        deleteClientCookie(ACTIVE_ORG_COOKIE);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
    // hostPinnedOrgId never changes after mount, so this still runs once.
  }, [hostPinnedOrgId]);

  const handleSignOut = useCallback(async () => {
    setLoading(true);
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const isSuperAdmin = profile?.role === "SuperAdmin";
  const setActiveOrganization = useCallback(
    (organizationId: string) => {
      if (!isSuperAdmin || !organizationId) return;
      // White-label hosts are pinned to their tenant — a switch here would
      // silently revert on the next profile snapshot, so refuse it outright.
      if (hostPinnedOrgId) return;
      setClientCookie(ACTIVE_ORG_COOKIE, organizationId, 30);
      setActiveOrgId(organizationId);
    },
    [isSuperAdmin, hostPinnedOrgId],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        organizationId: activeOrgId ?? profile?.organizationId ?? null,
        uid: profile?.uid ?? null,
        role: profile?.role ?? null,
        loading,
        hostPinnedOrgId,
        signOut: handleSignOut,
        setActiveOrganization,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
