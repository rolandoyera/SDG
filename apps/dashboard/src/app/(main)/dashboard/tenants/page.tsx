"use client";

import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { format } from "date-fns";
import {
  ArrowUpDown,
  Building2,
  CreditCard,
  Loader2,
  Plus,
  Search,
  UserCheck,
  UserX,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-context";
import { PageTitle } from "@/components/page-title-updater";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { H1 } from "@/components/ui/typography";
import { getOrganizations, updateOrganization } from "@/lib/db";
import type { Organization } from "@/lib/types";

import { CreateTenantDialog } from "./_components/create-tenant-dialog";

function preventPaginationNavigation(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
}

export default function TenantsPage() {
  const {
    uid,
    role,
    organizationId: activeOrgId,
    setActiveOrganization,
    loading: authLoading,
  } = useAuth();
  const router = useRouter();

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Access check & redirect
  useEffect(() => {
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

  // Load organizations
  const loadOrgs = useCallback(async () => {
    try {
      const list = await getOrganizations();
      setOrgs(list);
    } catch (error) {
      console.error("Failed to load organizations:", error);
      toast.error("Failed to load tenants list.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && role === "SuperAdmin") {
      void loadOrgs();
    }
  }, [role, authLoading, loadOrgs]);

  // Toggle Tenant suspension status
  const handleToggleStatus = async (
    orgId: string,
    currentStatus: "Active" | "Suspended",
  ) => {
    const newStatus = currentStatus === "Active" ? "Suspended" : "Active";
    try {
      await updateOrganization(orgId, { status: newStatus });
      setOrgs((prev) =>
        prev.map((o) =>
          o.organizationId === orgId ? { ...o, status: newStatus } : o,
        ),
      );
      toast.success(
        `Tenant '${orgId}' has been ${newStatus === "Suspended" ? "suspended" : "reactivated"}.`,
      );
    } catch (error) {
      console.error("Error updating organization status:", error);
      toast.error("Failed to update tenant status.");
    }
  };

  // Update subscription plan tier
  const handleUpdatePlan = async (
    orgId: string,
    newPlan: "Starter" | "Pro" | "Enterprise",
  ) => {
    try {
      await updateOrganization(orgId, { plan: newPlan });
      setOrgs((prev) =>
        prev.map((o) =>
          o.organizationId === orgId ? { ...o, plan: newPlan } : o,
        ),
      );
      toast.success(`Tenant '${orgId}' subscription updated to ${newPlan}.`);
    } catch (error) {
      console.error("Error updating organization plan:", error);
      toast.error("Failed to update subscription tier.");
    }
  };

  // Filtering list
  const filteredOrgs = orgs.filter((org) => {
    const term = searchQuery.toLowerCase();
    return (
      org.name.toLowerCase().includes(term) ||
      org.organizationId.toLowerCase().includes(term) ||
      org.adminEmail.toLowerCase().includes(term)
    );
  });

  const pageCount = Math.ceil(filteredOrgs.length / pageSize) || 1;

  // Adjust page index if filter results shrink
  useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount);
    }
  }, [pageCount, currentPage]);

  const startIndex = (currentPage - 1) * pageSize;
  const paginatedOrgs = filteredOrgs.slice(startIndex, startIndex + pageSize);
  const visibleTenantCount = paginatedOrgs.length;

  const pageNumbers = useMemo(() => {
    if (pageCount <= 3) {
      return Array.from({ length: pageCount }, (_, index) => index + 1);
    }

    if (currentPage <= 2) return [1, 2, 3];
    if (currentPage >= pageCount - 1)
      return [pageCount - 2, pageCount - 1, pageCount];

    return [currentPage - 1, currentPage, currentPage + 1];
  }, [currentPage, pageCount]);

  if (authLoading || role !== "SuperAdmin") {
    return (
      <div className="flex h-[60vh] w-full items-center justify-center">
        <div className="relative flex flex-col items-center gap-4">
          <div className="relative size-12">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
          <p className="animate-pulse font-medium text-muted-foreground text-xs uppercase tracking-widest">
            Verifying Authority
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageTitle title="Tenant Directory" />
      <div className="flex w-full flex-col gap-6">
        {/* Title & Description */}
        <div className="flex flex-col gap-1">
          <H1 className="flex items-center gap-2">
            <Building2 className="size-8 text-primary" />
            Tenant Management
          </H1>
          <p className="text-muted-foreground text-sm">
            Provision, monitor, and configure multi-tenant design studio
            organizations on the SaaS network.
          </p>
        </div>

        {/* Stats Summary Widgets */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="bg-card/40 backdrop-blur-xs">
            <CardHeader className="pb-2">
              <CardDescription className="font-semibold text-xs uppercase tracking-wider">
                Total Studio Tenants
              </CardDescription>
              <CardTitle className="font-bold text-3xl">
                {orgs.length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-card/40 backdrop-blur-xs">
            <CardHeader className="pb-2">
              <CardDescription className="font-semibold text-xs uppercase tracking-wider">
                Active Subscriptions
              </CardDescription>
              <CardTitle className="font-bold text-3xl text-emerald-500">
                {orgs.filter((o) => o.status === "Active").length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-card/40 backdrop-blur-xs">
            <CardHeader className="pb-2">
              <CardDescription className="font-semibold text-xs uppercase tracking-wider">
                Suspended Tenants
              </CardDescription>
              <CardTitle className="font-bold text-3xl text-rose-500">
                {orgs.filter((o) => o.status === "Suspended").length}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Data Views */}
        {loading ? (
          <div className="flex min-h-75 flex-col items-center justify-center gap-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
              Loading SaaS Organizations
            </p>
          </div>
        ) : orgs.length === 0 ? (
          <Card className="flex min-h-75 flex-col items-center justify-center border-dashed bg-background/30 p-8 text-center">
            <Building2 className="mb-3 size-12 text-muted-foreground/40" />
            <h3 className="font-semibold text-lg">No tenants found</h3>
            <p className="mt-1 max-w-sm text-muted-foreground text-sm">
              Provision your first design studio client account to get started.
            </p>
            <Button
              onClick={() => setIsDialogOpen(true)}
              className="mt-4 flex items-center gap-2"
            >
              <Plus className="size-4" />
              Create New Tenant
            </Button>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="leading-none">All Tenants</CardTitle>
              <CardDescription>
                Manage and configure all design studio tenant profiles.
              </CardDescription>
              <CardAction>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search tenants..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-44 pl-9 md:w-52"
                    />
                  </div>
                  <Button
                    onClick={() => setIsDialogOpen(true)}
                    className="flex items-center gap-1.5 text-primary-foreground hover:bg-primary/95"
                  >
                    <Plus className="size-3.5" />
                    Create Tenant
                  </Button>
                </div>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 px-0">
              <div className="overflow-hidden">
                <Table className="**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4 **:data-[slot='table-cell']:py-4">
                  <TableHeader className="border-t **:data-[slot='table-head']:h-11 **:data-[slot='table-head']:font-medium **:data-[slot='table-head']:text-foreground **:data-[slot='table-head']:text-sm">
                    <TableRow>
                      <TableHead>Organization Name</TableHead>
                      <TableHead>Tenant Identifier</TableHead>
                      <TableHead>Admin Email</TableHead>
                      <TableHead>Created Date</TableHead>
                      <TableHead>Service Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="**:data-[slot='table-row']:border-border/50 **:data-[slot='table-row']:hover:bg-transparent">
                    {paginatedOrgs.length ? (
                      paginatedOrgs.map((org) => (
                        <TableRow key={org.organizationId}>
                          <TableCell className="font-semibold text-foreground">
                            <Link
                              href={`/dashboard/tenants/${org.organizationId}`}
                              className="transition-colors hover:text-primary hover:underline"
                            >
                              {org.name}
                            </Link>
                          </TableCell>
                          <TableCell>{org.organizationId}</TableCell>
                          <TableCell>{org.adminEmail}</TableCell>
                          <TableCell>
                            {format(new Date(org.createdAt), "dd MMM yyyy")}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                org.plan === "Enterprise"
                                  ? "secondary"
                                  : org.plan === "Pro"
                                    ? "info"
                                    : "outline"
                              }
                            >
                              {org.plan}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                org.status === "Active"
                                  ? "success"
                                  : "destructive"
                              }
                            >
                              {org.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                >
                                  <span className="sr-only">Open menu</span>
                                  <ArrowUpDown className="h-4.5 w-4.5 rotate-90 opacity-60" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                className="w-fit"
                                align="end"
                              >
                                <DropdownMenuLabel>
                                  Manage Tenant
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />

                                {/* Switch the session's active org to this tenant */}
                                <DropdownMenuItem
                                  disabled={org.organizationId === activeOrgId}
                                  onClick={() => {
                                    setActiveOrganization(org.organizationId);
                                    toast.success(
                                      `Now working in '${org.name}'.`,
                                    );
                                    router.push("/dashboard/home");
                                  }}
                                  className="flex cursor-pointer items-center gap-2"
                                >
                                  <Building2 className="size-4 opacity-70" />
                                  <span>
                                    {org.organizationId === activeOrgId
                                      ? "Currently active tenant"
                                      : "Work in this tenant"}
                                  </span>
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />

                                {/* Toggle Status Action */}
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleToggleStatus(
                                      org.organizationId,
                                      org.status,
                                    )
                                  }
                                  className="flex cursor-pointer items-center gap-2"
                                >
                                  {org.status === "Active" ? (
                                    <>
                                      <UserX className="size-4 text-rose-500 opacity-80" />
                                      <span className="text-rose-500">
                                        Suspend Organization
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <UserCheck className="size-4 text-emerald-500 opacity-80" />
                                      <span className="text-emerald-500">
                                        Reactivate Tenant
                                      </span>
                                    </>
                                  )}
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />
                                <DropdownMenuLabel>
                                  Upgrade/Downgrade Plan
                                </DropdownMenuLabel>

                                {/* Plan selection options */}
                                <DropdownMenuItem
                                  disabled={org.plan === "Starter"}
                                  onClick={() =>
                                    handleUpdatePlan(
                                      org.organizationId,
                                      "Starter",
                                    )
                                  }
                                  className="flex cursor-pointer items-center gap-2"
                                >
                                  <CreditCard className="size-4 opacity-70" />
                                  <span>Switch to Starter Plan</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={org.plan === "Pro"}
                                  onClick={() =>
                                    handleUpdatePlan(org.organizationId, "Pro")
                                  }
                                  className="flex cursor-pointer items-center gap-2"
                                >
                                  <CreditCard className="size-4 opacity-70" />
                                  <span>Switch to Pro Plan</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={org.plan === "Enterprise"}
                                  onClick={() =>
                                    handleUpdatePlan(
                                      org.organizationId,
                                      "Enterprise",
                                    )
                                  }
                                  className="flex cursor-pointer items-center gap-2"
                                >
                                  <CreditCard className="size-4 opacity-70" />
                                  <span>Switch to Enterprise Plan</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center">
                          No results.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between gap-4 px-4 pb-1">
                <p className="text-muted-foreground text-sm">
                  Viewing {visibleTenantCount} out of{" "}
                  {filteredOrgs.length.toLocaleString()} tenants
                </p>

                <Pagination className="mx-0 w-auto justify-end">
                  <PaginationContent className="gap-1.5">
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        className={
                          currentPage === 1
                            ? "pointer-events-none opacity-50"
                            : undefined
                        }
                        onClick={(event) => {
                          preventPaginationNavigation(event);
                          if (currentPage > 1) setCurrentPage(currentPage - 1);
                        }}
                      />
                    </PaginationItem>
                    {pageNumbers[0] > 1 ? (
                      <PaginationItem>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : null}
                    {pageNumbers.map((pageNumber) => (
                      <PaginationItem key={`page-${pageNumber}`}>
                        <PaginationLink
                          href="#"
                          isActive={currentPage === pageNumber}
                          onClick={(event) => {
                            preventPaginationNavigation(event);
                            setCurrentPage(pageNumber);
                          }}
                        >
                          {pageNumber}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    {pageNumbers[pageNumbers.length - 1] < pageCount ? (
                      <PaginationItem>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : null}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        className={
                          currentPage === pageCount
                            ? "pointer-events-none opacity-50"
                            : undefined
                        }
                        onClick={(event) => {
                          preventPaginationNavigation(event);
                          if (currentPage < pageCount)
                            setCurrentPage(currentPage + 1);
                        }}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Create Tenant Dialog */}
        <CreateTenantDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          orgs={orgs}
          onTenantCreated={(newOrg) => setOrgs((prev) => [newOrg, ...prev])}
        />
      </div>
    </>
  );
}
