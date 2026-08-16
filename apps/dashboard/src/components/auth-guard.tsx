"use client";

import { type ReactNode, useEffect } from "react";

import { usePathname, useRouter } from "next/navigation";

import { format } from "date-fns";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { toast } from "sonner";

import { resolveHostOrg } from "@/config/app-config";
import { db } from "@/lib/firebase";

import { useAuth } from "./auth-context";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, profile, role, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isAuthRoute = pathname.startsWith("/auth");
  const isInviteRoute = pathname.startsWith("/auth/invite");

  // Redirect logic
  useEffect(() => {
    if (loading) return;

    if (!user && !isAuthRoute) {
      const isExplicitLogout =
        typeof window !== "undefined" &&
        window.sessionStorage.getItem("explicit_logout") === "true";
      if (isExplicitLogout) {
        window.sessionStorage.removeItem("explicit_logout");
        router.push("/");
      } else {
        router.push("/auth/login");
      }
    } else if (user && isAuthRoute && !isInviteRoute) {
      router.push("/dashboard");
    }
  }, [user, loading, isAuthRoute, isInviteRoute, router]);

  // White-label domains are tenant-exclusive: members of other orgs get signed
  // out (SuperAdmins may enter any tenant). This is a UX gate — real isolation
  // lives in the server's verified-caller org resolution and Firestore rules,
  // which never depend on the domain.
  const profileOrgId = profile?.organizationId ?? null;
  useEffect(() => {
    if (loading || !profileOrgId || role === "SuperAdmin") return;
    const hostOrg = resolveHostOrg(window.location.host);
    if (hostOrg && hostOrg !== profileOrgId) {
      toast.error("Your account doesn't have access to this workspace.");
      void signOut();
    }
  }, [loading, profileOrgId, role, signOut]);

  // Convert invites and create profiles if they do not exist yet
  useEffect(() => {
    if (!user || loading) return;

    const handleInviteConversion = async () => {
      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
          const emailKey = user.email ? user.email.trim().toLowerCase() : "";
          if (emailKey) {
            const pendingDocRef = doc(db, "users", emailKey);
            const pendingDocSnap = await getDoc(pendingDocRef);

            if (
              pendingDocSnap.exists() &&
              pendingDocSnap.data().organizationId &&
              pendingDocSnap.data().role
            ) {
              const pendingData = pendingDocSnap.data();
              await setDoc(userDocRef, {
                fullName: pendingData.fullName || user.displayName || "User",
                email: emailKey,
                role: pendingData.role,
                organizationId: pendingData.organizationId,
                status: "Active",
                joinedDate: format(new Date(), "dd MMM yyyy, h:mm a"),
                lastActive: Date.now(),
              });
              await deleteDoc(pendingDocRef);
            } else {
              // Access is invite-only: an account without a profile or pending
              // invite gets no organization and no session.
              toast.error(
                "This account has no invitation. Ask your administrator for an invite.",
              );
              await signOut();
            }
          }
        }
      } catch (error) {
        console.error("Error in AuthGuard invite conversion:", error);
      }
    };

    void handleInviteConversion();
  }, [user, loading, signOut]);

  // Keep active status updated on page navigation
  useEffect(() => {
    if (!user || loading) return;
    const updateActiveStatus = async () => {
      try {
        const userDocRef = doc(db, "users", user.uid);
        await setDoc(userDocRef, { lastActive: Date.now() }, { merge: true });
      } catch (error) {
        console.error("Error updating active status:", error);
      }
    };
    void updateActiveStatus();
  }, [user, loading]);

  if (isAuthRoute) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="relative flex flex-col items-center gap-4">
          {/* Elegant Pulsating Double Ring Spinner */}
          <div className="relative size-16">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <div className="animation-duration-[1.5s] direction-[reverse] absolute inset-2 animate-spin rounded-full border-4 border-primary/40 border-b-transparent" />
          </div>
          {/* Subtly fading loader label */}
          <p className="animate-pulse font-medium text-muted-foreground text-xs uppercase tracking-widest">
            Verifying Session
          </p>
        </div>
      </div>
    );
  }

  if (user) {
    return <>{children}</>;
  }

  // Safe fallback while redirect is executing
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background" />
  );
}
