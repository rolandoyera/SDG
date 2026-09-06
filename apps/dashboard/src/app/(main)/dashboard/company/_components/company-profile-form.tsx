"use client";

import { useEffect, useState } from "react";

import { toast } from "sonner";

import { LoadingState } from "@/components/loading-state";
import { FadeIn } from "@/components/fade-in";
import { useAuth } from "@/components/auth-context";
import {
  deleteReplacedStorageFiles,
  getOrganization,
  updateOrganization,
} from "@/lib/db";
import type { Organization } from "@/lib/types";
import { H1 } from "@/components/ui/typography";

import { BrandColorsCard, BrandColorsFields } from "./brand-colors-section";
import { LogoCard, LogoFields } from "./logo-section";
import { formToOrganizationUpdate } from "./company-constants";
import { CompanyInfoCard, CompanyInfoFields } from "./company-info-section";
import { SectionEditDialog } from "./section-dialog";
import { SettingsCard, SettingsFields } from "./settings-section";

type EditSection = "company" | "logo" | "colors" | "settings" | null;

export function CompanyProfileForm() {
  const { organizationId, loading: authLoading } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditSection>(null);

  useEffect(() => {
    if (authLoading || !organizationId) return;
    const id = organizationId;
    async function load() {
      try {
        const data = await getOrganization(id);
        if (data) setOrg(data);
      } catch {
        toast.error("Failed to load company profile.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [organizationId, authLoading]);

  const persist = async (
    patch: Partial<Organization>,
    prevPaths: Array<string | undefined> = [],
    nextPaths: Array<string | undefined> = [],
  ): Promise<boolean> => {
    if (!organizationId || !org) return false;
    const previous = org;
    setOrg({ ...org, ...patch }); // optimistic
    try {
      await updateOrganization(organizationId, patch);
      if (prevPaths.length > 0)
        await deleteReplacedStorageFiles(prevPaths, nextPaths);
      toast.success("Company profile saved.");
      return true;
    } catch (error) {
      console.error("Company profile save error:", error);
      setOrg(previous); // revert
      toast.error("Failed to save company profile.");
      return false;
    }
  };

  if (loading) return <LoadingState label="Loading Company Profile" />;

  if (!org) {
    return (
      <p className="text-muted-foreground text-sm">No organization found.</p>
    );
  }

  return (
    <FadeIn className="mx-auto flex w-full flex-col gap-6 p-6">
      <div>
        <H1>Company Profile</H1>
        <p className="mt-1 text-muted-foreground text-sm">
          Manage your organization details and branding used across the app.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CompanyInfoCard org={org} onEdit={() => setEditing("company")} />
        <SettingsCard org={org} onEdit={() => setEditing("settings")} />
        <LogoCard org={org} onEdit={() => setEditing("logo")} />
        <BrandColorsCard org={org} onEdit={() => setEditing("colors")} />
      </div>

      {/* Company Information (company + address → companyProfile block) */}
      <SectionEditDialog
        open={editing === "company"}
        onOpenChange={(v) => setEditing(v ? "company" : null)}
        title="Edit Company Information"
        description="Add and edit your company information."
        org={org}
        persist={persist}
        buildPatch={(data) => ({
          patch: {
            companyProfile: formToOrganizationUpdate(data).companyProfile,
          },
        })}
      >
        {(props) => <CompanyInfoFields {...props} />}
      </SectionEditDialog>

      {/* Logo (light/dark logos and icon marks) */}
      <SectionEditDialog
        open={editing === "logo"}
        onOpenChange={(v) => setEditing(v ? "logo" : null)}
        title="Edit Logo"
        description="Logos and icon marks used throughout the app and exports."
        org={org}
        persist={persist}
        buildPatch={(data) => {
          const { branding } = formToOrganizationUpdate(data);
          return {
            patch: { branding },
            prevPaths: [
              org.branding?.logoLightPath,
              org.branding?.logoDarkPath,
              org.branding?.iconLightPath,
              org.branding?.iconDarkPath,
            ],
            nextPaths: [
              branding.logoLightPath,
              branding.logoDarkPath,
              branding.iconLightPath,
              branding.iconDarkPath,
            ],
          };
        }}
      >
        {(props) => (
          <LogoFields {...props} organizationId={organizationId ?? ""} />
        )}
      </SectionEditDialog>

      {/* Brand Colors (primary + accent) */}
      <SectionEditDialog
        open={editing === "colors"}
        onOpenChange={(v) => setEditing(v ? "colors" : null)}
        title="Edit Brand Colors"
        description="Primary and accent colors used throughout the app and exports."
        org={org}
        persist={persist}
        buildPatch={(data) => ({
          patch: { branding: formToOrganizationUpdate(data).branding },
        })}
      >
        {(props) => <BrandColorsFields {...props} />}
      </SectionEditDialog>

      {/* Settings */}
      <SectionEditDialog
        open={editing === "settings"}
        onOpenChange={(v) => setEditing(v ? "settings" : null)}
        title="Edit Settings"
        description="Defaults applied to proposals, pricing, and localization."
        org={org}
        persist={persist}
        buildPatch={(data) => ({
          patch: { settings: formToOrganizationUpdate(data).settings },
        })}
      >
        {(props) => <SettingsFields {...props} />}
      </SectionEditDialog>
    </FadeIn>
  );
}
