"use client";

import * as React from "react";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import {
  Building2,
  CreditCard,
  Folder,
  LineChart,
  Loader2,
  Megaphone,
  Save,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  User,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { LoadingState } from "@/components/loading-state";
import { FadeIn } from "@/components/fade-in";
import { useAuth } from "@/components/auth-context";
import { PageTitle } from "@/components/page-title-updater";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { H1 } from "@/components/ui/typography";
import {
  getOrganization,
  getOrganizationUsers,
  updateOrganization,
} from "@/lib/db";
import type { Organization, UserProfile } from "@/lib/types";

import HeaderBackLink from "../../_components/HeaderBackLink";

const tenantConfigSchema = z.object({
  gaPropertyId: z.string().trim().optional().or(z.literal("")),
  gscSiteUrl: z.string().trim().optional().or(z.literal("")),
  googleAdsCustomerId: z.string().trim().optional().or(z.literal("")),
  googleDriveFolderId: z.string().trim().optional().or(z.literal("")),
  aiMonthlyLimit: z.number().min(0, "Limit must be 0 or greater."),
});

type TenantConfigFormData = z.infer<typeof tenantConfigSchema>;

interface PageProps {
  params: Promise<{
    tenantId: string;
  }>;
}

export default function TenantDetailPage({ params }: PageProps) {
  const { tenantId } = React.use(params);
  const { uid, role, loading: authLoading } = useAuth();
  const router = useRouter();

  const [org, setOrg] = React.useState<Organization | null>(null);
  const [users, setUsers] = React.useState<UserProfile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [togglingStatus, setTogglingStatus] = React.useState(false);

  // Form setup
  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty },
  } = useForm<TenantConfigFormData>({
    resolver: zodResolver(tenantConfigSchema),
    defaultValues: {
      gaPropertyId: "",
      gscSiteUrl: "",
      googleAdsCustomerId: "",
      googleDriveFolderId: "",
      aiMonthlyLimit: 100,
    },
  });

  // Access check
  React.useEffect(() => {
    if (authLoading) return;
    if (!uid) {
      router.push("/auth/login");
      return;
    }
    if (role !== "SuperAdmin") {
      toast.error("Access denied. SuperAdmin privileges required.");
      router.push("/dashboard/home");
    }
  }, [uid, role, authLoading, router]);

  // Load tenant details & users
  const loadTenantData = React.useCallback(async () => {
    try {
      const [orgData, usersData] = await Promise.all([
        getOrganization(tenantId),
        getOrganizationUsers(tenantId),
      ]);

      if (!orgData) {
        toast.error("Organization not found.");
        router.push("/dashboard/tenants");
        return;
      }

      setOrg(orgData);
      setUsers(usersData);

      // Seed form values
      reset({
        gaPropertyId: orgData.config?.gaPropertyId || "",
        gscSiteUrl: orgData.config?.gscSiteUrl || "",
        googleAdsCustomerId: orgData.config?.googleAdsCustomerId || "",
        googleDriveFolderId: orgData.config?.googleDriveFolderId || "",
        aiMonthlyLimit: orgData.config?.aiMonthlyLimit ?? 100,
      });
    } catch (error) {
      console.error("Failed to load tenant details:", error);
      toast.error("Failed to fetch tenant configuration.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, router, reset]);

  React.useEffect(() => {
    if (!authLoading && role === "SuperAdmin") {
      void loadTenantData();
    }
  }, [role, authLoading, loadTenantData]);

  // Handle config form submit
  const handleSaveConfig = async (data: TenantConfigFormData) => {
    if (saving || !org) return;
    setSaving(true);

    try {
      const updatedConfig = {
        // Preserve fields not managed by this form (e.g. metaIntegration).
        ...org.config,
        gaPropertyId: data.gaPropertyId?.trim() || "",
        gscSiteUrl: data.gscSiteUrl?.trim() || "",
        googleAdsCustomerId: data.googleAdsCustomerId?.trim() || "",
        googleDriveFolderId: data.googleDriveFolderId?.trim() || "",
        aiMonthlyLimit: data.aiMonthlyLimit,
      };

      await updateOrganization(tenantId, {
        config: updatedConfig,
      });

      setOrg((prev) => (prev ? { ...prev, config: updatedConfig } : null));
      // Re-seed the form with what was saved (values are trimmed above) so it
      // reads as pristine again and the save button disables until a new edit.
      reset({
        gaPropertyId: updatedConfig.gaPropertyId,
        gscSiteUrl: updatedConfig.gscSiteUrl,
        googleAdsCustomerId: updatedConfig.googleAdsCustomerId,
        googleDriveFolderId: updatedConfig.googleDriveFolderId,
        aiMonthlyLimit: updatedConfig.aiMonthlyLimit,
      });
      toast.success("Tenant settings updated successfully!");
    } catch (error) {
      console.error("Failed to update organization config:", error);
      toast.error("Failed to save credentials.");
    } finally {
      setSaving(false);
    }
  };

  // Toggle active/suspended state
  const handleToggleStatus = async () => {
    if (togglingStatus || !org) return;
    setTogglingStatus(true);

    const newStatus = org.status === "Active" ? "Suspended" : "Active";
    try {
      await updateOrganization(org.organizationId, { status: newStatus });
      setOrg((prev) => (prev ? { ...prev, status: newStatus } : null));
      toast.success(`Organization status changed to ${newStatus}.`);
    } catch (error) {
      console.error("Error toggling organization status:", error);
      toast.error("Failed to toggle suspension status.");
    } finally {
      setTogglingStatus(false);
    }
  };

  if (authLoading || loading || role !== "SuperAdmin") {
    return <LoadingState label="Loading Tenant" />;
  }

  if (!org) return null;

  // Counters are keyed by ET month, the same boundary the server increments on.
  const usagePeriod = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  const periodUsage = org.config?.usage?.[usagePeriod] ?? {};
  const aiUsed = periodUsage.autofills ?? 0;
  const aiLimit = org.config?.aiMonthlyLimit ?? 100;
  // 0 is the off switch, not "unlimited" — show it as full, never as empty.
  const aiDisabled = aiLimit === 0;
  const usagePercentage = aiDisabled
    ? 100
    : Math.min(100, (aiUsed / aiLimit) * 100);
  // Vendor units differ (Firecrawl per page, Jina per token, Gemini per token),
  // so they are shown as-is rather than folded into the autofill count.
  const vendorUsage = [
    { label: "Gemini requests", value: periodUsage.geminiRequests ?? 0 },
    { label: "Gemini tokens", value: periodUsage.geminiTokens ?? 0 },
    { label: "Firecrawl pages", value: periodUsage.firecrawlPages ?? 0 },
    { label: "Jina characters", value: periodUsage.jinaChars ?? 0 },
  ];

  return (
    <>
      <PageTitle title={org.name || "Tenant Dashboard"} />
      <FadeIn className="flex w-full flex-col gap-6">
        {/* Header & Back Link */}
        <div className="flex flex-col gap-2">
          <HeaderBackLink href="/dashboard/tenants" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded bg-primary/10 p-2.5 text-primary">
                <Building2 className="size-6" />
              </div>
              <div>
                <H1 className="flex items-center gap-2 font-bold text-2xl">
                  {org.name}
                </H1>
                <p className="font-mono text-muted-foreground text-xs">
                  ID: {org.organizationId}
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <Badge
                variant={org.status === "Active" ? "success" : "destructive"}
              >
                {org.status}
              </Badge>
              <Button
                onClick={handleToggleStatus}
                variant="outline"
                size="sm"
                disabled={togglingStatus}
                className="flex items-center gap-1.5"
              >
                {org.status === "Active" ? (
                  <>
                    <UserX className="size-3.5 text-rose-500" />
                    Suspend Studio
                  </>
                ) : (
                  <>
                    <UserCheck className="size-3.5 text-emerald-500" />
                    Reactivate Studio
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left Columns - Form Configurations */}
          <div className="flex flex-col gap-6 lg:col-span-1">
            {/* API Integrations Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-primary">
                  <Settings className="size-4" />
                  Integration Configurations
                </CardTitle>
                <CardDescription>
                  Assign dedicated keys and folders to override global defaults
                  for this tenant.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handleSubmit(handleSaveConfig)}
                  className="grid grid-cols-1 gap-4 space-y-6 lg:grid-cols-2"
                  autoComplete="off"
                >
                  {/* Dummy inputs to prevent Chrome autofill */}
                  <input
                    type="text"
                    name="prevent_autofill_username"
                    className="hidden"
                    tabIndex={-1}
                    aria-hidden="true"
                    readOnly
                  />
                  <input
                    type="password"
                    name="prevent_autofill_password"
                    className="hidden"
                    tabIndex={-1}
                    aria-hidden="true"
                    readOnly
                  />

                  {/* Google Analytics 4 */}
                  <Controller
                    control={control}
                    name="gaPropertyId"
                    render={({ field, fieldState }) => (
                      <Field
                        className="gap-1.5"
                        data-invalid={fieldState.invalid}
                      >
                        <FieldLabel
                          htmlFor="ga-id"
                          className="flex items-center gap-1.5"
                        >
                          <LineChart className="size-3.5 text-muted-foreground" />
                          Google Analytics Property ID
                        </FieldLabel>
                        <Input
                          {...field}
                          id="ga-id"
                          placeholder="e.g. 538475335"
                          disabled={saving}
                          aria-invalid={fieldState.invalid}
                          autoComplete="off"
                        />
                        <p className="text-[10px] text-muted-foreground/80 leading-normal">
                          Optionally provide a GA4 Property ID to feed dashboard
                          analytics views for this studio.
                        </p>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />

                  {/* Google Search Console */}
                  <Controller
                    control={control}
                    name="gscSiteUrl"
                    render={({ field, fieldState }) => (
                      <Field
                        className="gap-1.5"
                        data-invalid={fieldState.invalid}
                      >
                        <FieldLabel
                          htmlFor="gsc-site"
                          className="flex items-center gap-1.5"
                        >
                          <Search className="size-3.5 text-muted-foreground" />
                          Search Console Site URL
                        </FieldLabel>
                        <Input
                          {...field}
                          id="gsc-site"
                          placeholder="e.g. sc-domain:example.com"
                          disabled={saving}
                          aria-invalid={fieldState.invalid}
                          autoComplete="off"
                        />
                        <p className="text-[10px] text-muted-foreground/80 leading-normal">
                          Use the exact property string from Search Console:
                          `sc-domain:example.com` for a domain property, or
                          `https://example.com/` (with trailing slash) for a
                          URL-prefix property.
                        </p>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />

                  {/* Google Ads */}
                  <Controller
                    control={control}
                    name="googleAdsCustomerId"
                    render={({ field, fieldState }) => (
                      <Field
                        className="gap-1.5"
                        data-invalid={fieldState.invalid}
                      >
                        <FieldLabel
                          htmlFor="google-ads-id"
                          className="flex items-center gap-1.5"
                        >
                          <Megaphone className="size-3.5 text-muted-foreground" />
                          Google Ads Customer ID
                        </FieldLabel>
                        <Input
                          {...field}
                          id="google-ads-id"
                          placeholder="e.g. 728-365-1449"
                          disabled={saving}
                          aria-invalid={fieldState.invalid}
                          autoComplete="off"
                        />
                        <p className="text-[10px] text-muted-foreground/80 leading-normal">
                          Optionally provide a Google Ads account ID (with or
                          without dashes) to feed the Google Ads dashboard page
                          for this studio.
                        </p>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />

                  {/* Google Drive Folder ID */}
                  <Controller
                    control={control}
                    name="googleDriveFolderId"
                    render={({ field, fieldState }) => (
                      <Field
                        className="gap-1.5"
                        data-invalid={fieldState.invalid}
                      >
                        <FieldLabel
                          htmlFor="drive-id"
                          className="flex items-center gap-1.5"
                        >
                          <Folder className="size-3.5 text-muted-foreground" />
                          Google Drive Folder ID
                        </FieldLabel>
                        <Input
                          {...field}
                          id="drive-id"
                          placeholder="e.g. 1fPhDPIMqvyOwqZY8Hdb28QKtV0IYrUoK"
                          disabled={saving}
                          aria-invalid={fieldState.invalid}
                          autoComplete="off"
                        />
                        <p className="text-[10px] text-muted-foreground/80 leading-normal">
                          Uploads from this studio will be stored under this
                          dedicated Google Drive folder path.
                        </p>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />

                  {/* AI Scraping limit setting */}
                  <Controller
                    control={control}
                    name="aiMonthlyLimit"
                    render={({ field, fieldState }) => (
                      <Field
                        className="gap-1.5"
                        data-invalid={fieldState.invalid}
                      >
                        <FieldLabel
                          htmlFor="ai-limit"
                          className="flex items-center gap-1.5"
                        >
                          <CreditCard className="size-3.5 text-muted-foreground" />
                          Monthly AI Scraping Limit
                        </FieldLabel>
                        <FieldDescription>
                          Autofills allowed per month. Set to 0 to turn AI
                          autofill off for this tenant.
                        </FieldDescription>
                        <Input
                          {...field}
                          type="number"
                          id="ai-limit"
                          placeholder="100"
                          disabled={saving}
                          aria-invalid={fieldState.invalid}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value))
                          }
                          autoComplete="off"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />

                  <div className="mt-4 flex items-end justify-end">
                    <Button
                      type="submit"
                      disabled={saving || !isDirty}
                      className="flex items-center gap-2"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Saving settings...
                        </>
                      ) : (
                        <>
                          <Save className="size-4" />
                          Save Configuration
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Usage and Overview */}
          <div className="flex flex-col gap-6">
            {/* AI Usage Tracker */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-primary">
                  <Sparkles className="size-4" />
                  AI Scraper Usage
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-baseline justify-between">
                  <span className="font-bold text-3xl text-foreground">
                    {aiUsed}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {aiDisabled
                      ? "AI autofill disabled"
                      : `of ${aiLimit} requests`}
                  </span>
                </div>

                {/* Progress Bar container */}
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${usagePercentage}%` }}
                  />
                </div>
                <div className="flex justify-between font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
                  <span>0% used</span>
                  <span>{usagePercentage.toFixed(0)}% used</span>
                </div>

                <div className="space-y-1.5 border-t pt-3">
                  {vendorUsage.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-baseline justify-between text-sm"
                    >
                      <span className="text-muted-foreground">
                        {item.label}
                      </span>
                      <span className="font-medium tabular-nums">
                        {item.value.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Studio Administrator Summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-primary">
                  <User className="size-4" />
                  Administrator Contact
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <User className="size-4 text-muted-foreground" />
                  <span className="font-medium text-foreground">
                    {org.adminEmail}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldAlert className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Plan: {org.plan} Tier
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Member Roster Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-primary">
              <Users className="size-4" />
              Studio Team Directory
            </CardTitle>
            <CardDescription>
              Active and pending team member accounts registered under this
              tenant.
            </CardDescription>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Full Name</TableHead>
                <TableHead>Email Address</TableHead>
                <TableHead>System Role</TableHead>
                <TableHead>Joined Date</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead>Account Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No registered users found for this organization.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.uid} className="hover:bg-muted/30">
                    <TableCell className="font-semibold text-foreground">
                      {user.fullName}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.role}</TableCell>
                    <TableCell>{user.joinedDate || "N/A"}</TableCell>
                    <TableCell>
                      {user.lastActive > 0
                        ? format(
                            new Date(user.lastActive),
                            "dd MMM yyyy, h:mm a",
                          )
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          user.status === "Active" ? "success" : "warning"
                        }
                      >
                        {user.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </FadeIn>
    </>
  );
}
