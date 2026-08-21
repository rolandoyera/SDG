"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { Building2 } from "lucide-react";

import { useAuth } from "@/components/auth-context";
import { Button } from "@/components/ui/button";
import { getOrganization } from "@/lib/db";

/**
 * Shown only to a SuperAdmin whose active org differs from their home org, so
 * working inside another tenant is always visually explicit. Everyone else
 * never has an override, so the banner never renders for them. White-label
 * hosts are pinned to their tenant — the domain itself is the signal and there
 * is nothing to "return" to, so the banner stays hidden there.
 */
export function ActiveOrgBanner() {
  const { profile, role, organizationId, hostPinnedOrgId, setActiveOrganization } =
    useAuth();
  const router = useRouter();
  const homeOrgId = profile?.organizationId ?? null;
  const isOverridden =
    role === "SuperAdmin" &&
    !hostPinnedOrgId &&
    !!organizationId &&
    organizationId !== homeOrgId;

  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    if (!isOverridden || !organizationId) {
      setOrgName(null);
      return;
    }
    let cancelled = false;
    void getOrganization(organizationId).then((org) => {
      if (!cancelled) setOrgName(org?.name ?? organizationId);
    });
    return () => {
      cancelled = true;
    };
  }, [isOverridden, organizationId]);

  if (!isOverridden || !homeOrgId) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b bg-secondary/60 px-4 py-1.5 lg:px-6">
      <p className="flex items-center gap-2 text-muted-foreground text-sm">
        <Building2 className="size-4 shrink-0 text-primary" />
        <span>
          Working in{" "}
          <span className="font-semibold text-foreground">
            {orgName ?? organizationId}
          </span>{" "}
          — you&apos;re operating inside another tenant.
        </span>
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setActiveOrganization(homeOrgId);
          router.push("/dashboard/home");
        }}
      >
        Return to my organization
      </Button>
    </div>
  );
}
