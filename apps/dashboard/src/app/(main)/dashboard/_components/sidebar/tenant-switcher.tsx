"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { getOrganizations } from "@/lib/db";
import type { Organization } from "@/lib/types";

/**
 * SuperAdmin-only tenant switcher in the sidebar footer. Shows the ACTIVE org
 * and switches the session's org — same semantics as the Tenants page action.
 * White-label hosts are pinned to their tenant, so switching is disabled there;
 * the switcher then just names the tenant the domain is pinned to.
 */
export function TenantSwitcher() {
  const { role, organizationId, hostPinnedOrgId, setActiveOrganization } =
    useAuth();
  const router = useRouter();
  const [orgs, setOrgs] = useState<Organization[]>([]);

  const isSuperAdmin = role === "SuperAdmin";

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    void getOrganizations().then((data) => {
      if (!cancelled) setOrgs(data);
    });
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);

  if (!isSuperAdmin || !organizationId) return null;

  const activeName =
    orgs.find((org) => org.organizationId === organizationId)?.name ??
    organizationId;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton className="cursor-pointer" tooltip={activeName}>
              <Building2 />
              <span className="truncate">{activeName}</span>
              <ChevronsUpDown className="ml-auto size-4 opacity-60" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded"
            side="top"
            align="start"
          >
            <DropdownMenuLabel>
              {hostPinnedOrgId
                ? "This domain is pinned to its tenant"
                : "Switch tenant"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {orgs.map((org) => (
              <DropdownMenuItem
                key={org.organizationId}
                disabled={
                  !!hostPinnedOrgId || org.organizationId === organizationId
                }
                className="cursor-pointer"
                onClick={() => {
                  setActiveOrganization(org.organizationId);
                  toast.success(`Now working in '${org.name}'.`);
                  router.push("/dashboard/home");
                }}
              >
                <span className="truncate">{org.name}</span>
                {org.organizationId === organizationId && (
                  <Check className="ml-auto size-4" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
