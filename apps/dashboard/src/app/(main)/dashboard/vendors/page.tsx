"use client";

import { Suspense, useEffect, useState } from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Building2, Mail, Phone, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { LoadingState } from "@/components/loading-state";
import { useAuth } from "@/components/auth-context";
import { DashboardImage } from "@/components/dashboard-image";
import { FadeIn } from "@/components/fade-in";
import {
  ColumnsMenu,
  type ListViewColumn,
  ListViewTable,
  useColumnVisibility,
  useViewMode,
  ViewModeTabs,
} from "@/components/list-view-table";
import {
  FacebookIcon,
  GlobeIcon,
  InstagramIcon,
  PinterestIcon,
  XTwitterIcon,
  YoutubeIcon,
} from "@/components/icons/icons";
import { PageTitle } from "@/components/page-title-updater";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { H1, H3 } from "@/components/ui/typography";
import { addVendor, getVendors } from "@/lib/db";
import type { Vendor } from "@/lib/types";
import { formatVendorPhone } from "@/lib/utils";
import { mirrorVendorImagesToFirebase } from "@/lib/vendor-image-mirror";

import { QuickCreateTrigger } from "../_components/quick-create-trigger";
import {
  EMPTY_VENDOR_FORM,
  VENDOR_CATEGORIES,
  type VendorFormData,
  VendorFormDialog,
} from "./_components/vendor-form-dialog";
import { vendorGradient } from "./_components/vendor-gradient";
import {
  getDisplayUrl,
  getVendorSocialHrefs,
} from "./_components/vendor-links";

function VendorsContent() {
  const { organizationId, loading: authLoading } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [view, setView] = useViewMode("vendors-view-mode");

  // Category filter lives in the URL (?category=) so links elsewhere can
  // deep-link into a filtered directory, and refresh/copied links land on
  // the same view.
  const searchParams = useSearchParams();
  const activeCategory = searchParams.get("category") ?? "All";

  const setActiveCategory = (category: string) => {
    const params = new URLSearchParams(window.location.search);
    if (category === "All") params.delete("category");
    else params.set("category", category);
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
    );
  };

  const handleOpenAdd = () => setIsAddOpen(true);

  useEffect(() => {
    if (authLoading || !organizationId) return;
    const id = organizationId; // stable string dependency; profile object identity churns on each heartbeat

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const searchParam = params.get("search");
      if (searchParam) setSearchQuery(searchParam);
    }

    async function loadData() {
      try {
        const data = await getVendors(id);
        setVendors(data);
      } catch {
        toast.error("Failed to fetch vendors from database.");
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, [organizationId, authLoading]);

  const handleAdd = async (data: VendorFormData, customVendorId?: string) => {
    // The ACTIVE org, not profile.organizationId (the HOME org) — a SuperAdmin
    // working inside a tenant must create the vendor in that tenant.
    if (!organizationId) return;
    const vendorId =
      customVendorId ?? `vendor-${Math.random().toString(36).substr(2, 9)}`;
    try {
      const mirrored = await mirrorVendorImagesToFirebase(
        organizationId,
        {
          logoUrl: data.logoUrl,
          logoPath: data.logoPath,
          heroImageUrl: data.heroImageUrl,
          heroImagePath: data.heroImagePath,
        },
        vendorId,
      );
      const created = await addVendor(
        {
          ...data,
          logoUrl: mirrored.logoUrl,
          logoPath: mirrored.logoPath,
          heroImageUrl: mirrored.heroImageUrl,
          heroImagePath: mirrored.heroImagePath,
          organizationId,
        },
        vendorId,
      );
      setVendors((prev) => [created, ...prev]);
      toast.success("New vendor added successfully!");
      setIsAddOpen(false);
    } catch {
      toast.error("Failed to save vendor details.");
      throw new Error("save failed");
    }
  };

  const filteredVendors = vendors
    .filter((v) => {
      const term = searchQuery.toLowerCase();
      const matchesSearch =
        v.name.toLowerCase().includes(term) ||
        v.repName?.toLowerCase().includes(term) ||
        v.category?.toLowerCase().includes(term) ||
        v.notes?.toLowerCase().includes(term);

      const matchesCategory =
        activeCategory === "All" || v.category === activeCategory;

      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Columns for the list display mode. A handful of fields that fit the
  // standard table comfortably; the rest live on the vendor profile page.
  const columns: ListViewColumn<Vendor>[] = [
    {
      id: "logo",
      label: "Logo",
      header: <span className="sr-only">Logo</span>,
      hideable: false,
      cellClassName: "w-14",
      cell: (vendor) => (
        <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
          {vendor.logoUrl ? (
            <DashboardImage
              src={vendor.logoUrl}
              alt={vendor.name}
              sizes="40px"
              className="object-contain"
            />
          ) : (
            <Building2 className="size-4 text-muted-foreground/30" />
          )}
        </div>
      ),
    },
    {
      id: "name",
      label: "Name",
      hideable: false,
      cell: (vendor) => (
        <Link
          href={`/dashboard/vendors/${vendor.vendorId}`}
          className="font-medium text-foreground hover:text-primary"
        >
          {vendor.name}
        </Link>
      ),
    },
    {
      id: "category",
      label: "Category",
      cell: (vendor) => vendor.category || "—",
    },
    {
      id: "accountNumber",
      label: "Account #",
      cellClassName: "font-mono text-xs",
      cell: (vendor) => vendor.accountNumber || "—",
    },
    {
      id: "rep",
      label: "Representative",
      cell: (vendor) => vendor.repName || "—",
    },
    {
      id: "email",
      label: "Email",
      cell: (vendor) =>
        vendor.repEmail ? (
          <a
            href={`mailto:${vendor.repEmail}`}
            className="hover:text-primary hover:underline"
          >
            {vendor.repEmail}
          </a>
        ) : (
          "—"
        ),
    },
    {
      id: "phone",
      label: "Phone",
      cell: (vendor) =>
        vendor.repPhone
          ? formatVendorPhone(vendor.repPhone, vendor.repPhoneCountry)
          : "—",
    },
    {
      id: "website",
      label: "Website",
      cell: (vendor) => {
        const { websiteHref } = getVendorSocialHrefs(vendor);
        if (!websiteHref) return "—";
        return (
          <a
            href={websiteHref}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary hover:underline"
          >
            {getDisplayUrl(websiteHref)}
          </a>
        );
      },
    },
    {
      id: "address",
      label: "Address",
      defaultVisible: false,
      cell: (vendor) => vendor.formattedAddress || "—",
    },
  ];

  const [columnVisibility, setColumnVisibility] = useColumnVisibility(
    columns,
    "vendors-list-columns",
  );

  if (loading) return <LoadingState label="Loading Vendors" />;

  return (
    <>
      <PageTitle title="Vendor Directory" />
      <FadeIn className="flex w-full flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <H1>Vendor Directory</H1>
            <p className="mt-1 text-muted-foreground text-sm">
              Manage your trade vendors.
            </p>
          </div>
          <Button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/95 sm:self-start"
          >
            <Plus className="size-4" />
            Vendor
          </Button>
        </div>

        {/* Filter and search controls combined into a clean layout */}
        <div className="flex flex-col items-center justify-between gap-4 border-b pb-4 md:flex-row">
          {/* Category Tabs */}
          <Tabs
            value={activeCategory}
            onValueChange={setActiveCategory}
            className="w-full"
          >
            <TabsList className="flex max-w-full flex-wrap gap-0.5">
              <TabsTrigger value="All">All Vendors</TabsTrigger>
              {VENDOR_CATEGORIES.map((cat) => (
                <TabsTrigger key={cat} value={cat}>
                  {cat}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Quick Search + display mode controls */}
          <div className="flex w-full items-center gap-2 md:w-auto">
            <div className="relative w-full max-w-xs">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search vendors, representatives or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-background/50 pl-9"
              />
            </div>
            {view === "list" && (
              <ColumnsMenu
                columns={columns}
                visibility={columnVisibility}
                onVisibilityChange={setColumnVisibility}
              />
            )}
            <ViewModeTabs view={view} onViewChange={setView} />
          </div>
        </div>

        {/* Grid */}
        {filteredVendors.length === 0 ? (
          <Card className="flex min-h-75 flex-col items-center justify-center border-dashed bg-background/30 p-8 text-center">
            <Building2 className="mb-3 size-12 text-muted-foreground/40" />
            <h3 className="font-semibold text-lg">No vendors found</h3>
            <p className="mt-1 max-w-sm text-muted-foreground text-sm">
              {searchQuery
                ? "Try broadening your search or clear the filter."
                : "Get started by adding your first vendor contact."}
            </p>
            {!searchQuery && (
              <Button
                onClick={handleOpenAdd}
                className="mt-4 flex items-center gap-2"
              >
                <Plus className="size-4" />
                Add Vendor
              </Button>
            )}
          </Card>
        ) : view === "grid" ? (
          <FadeIn
            key="grid"
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"
          >
            {filteredVendors.map((vendor) => (
              <VendorCard key={vendor.vendorId} vendor={vendor} />
            ))}
          </FadeIn>
        ) : (
          <FadeIn key="list">
            <ListViewTable
              columns={columns}
              rows={filteredVendors}
              rowKey={(vendor) => vendor.vendorId}
              visibility={columnVisibility}
              rowHref={(vendor) => `/dashboard/vendors/${vendor.vendorId}`}
            />
          </FadeIn>
        )}

        <QuickCreateTrigger onTrigger={() => setIsAddOpen(true)} />
        <VendorFormDialog
          open={isAddOpen}
          onOpenChange={setIsAddOpen}
          mode="add"
          initialData={EMPTY_VENDOR_FORM}
          onSave={handleAdd}
        />
      </FadeIn>
    </>
  );
}

// useSearchParams requires a Suspense boundary on a statically rendered route.
export default function VendorsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading Vendors" />}>
      <VendorsContent />
    </Suspense>
  );
}

function VendorCard({ vendor }: { vendor: Vendor }) {
  const gradient = vendorGradient(vendor.name);
  const {
    websiteHref,
    instagramHref,
    pinterestHref,
    facebookHref,
    youtubeHref,
    xTwitterHref,
  } = getVendorSocialHrefs(vendor);

  return (
    <Card className="group relative flex h-full flex-col overflow-hidden pt-0 transition-all duration-200 has-[.detail-link:hover]:-translate-y-0.5 has-[.detail-link:hover]:border-primary/30 has-[.detail-link:hover]:shadow">
      {/* Hero area: real image → gradient fallback */}
      <Link
        href={`/dashboard/vendors/${vendor.vendorId}`}
        className="detail-link relative flex aspect-5/4 w-full cursor-pointer items-center justify-center overflow-hidden"
      >
        {vendor.heroImageUrl ? (
          <DashboardImage
            src={vendor.heroImageUrl}
            alt=""
            sizes="(min-width: 1536px) 20vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className={`absolute inset-0 bg-linear-to-br ${gradient}`} />
        )}
        {vendor.category && (
          <div className="absolute top-3 left-3">
            <Badge variant="overlay">{vendor.category}</Badge>
          </div>
        )}
      </Link>

      <CardContent className="flex flex-1 flex-col gap-3">
        {/* Name */}
        <div className="flex items-center  gap-2">
          <H3 className="transition-colors group-has-[.detail-link:hover]:text-primary">
            <Link
              href={`/dashboard/vendors/${vendor.vendorId}`}
              className="detail-link cursor-pointer"
            >
              {vendor.name}
            </Link>
          </H3>
          {vendor.logoUrl ? (
            <div className="relative size-6 rounded overflow-hidden">
              <DashboardImage
                src={vendor.logoUrl}
                alt={vendor.name}
                sizes="24px"
                className="h-6 w-6 object-contain"
              />
            </div>
          ) : null}
        </div>

        {/* Rep contact */}
        {vendor.repName || vendor.repEmail || vendor.repPhone ? (
          <div className="flex flex-col gap-1.5 rounded border border-muted/60 bg-muted/40 px-3 py-2.5">
            {vendor.repName && (
              <p className="truncate font-medium text-foreground/80 text-xs">
                {vendor.repName}
              </p>
            )}
            <div className="flex flex-col gap-1 text-muted-foreground text-xs h-8">
              {vendor.repEmail && (
                <span className="flex items-center gap-1.5 truncate">
                  <Mail className="size-3 shrink-0" />
                  <span className="truncate">{vendor.repEmail}</span>
                </span>
              )}
              {vendor.repPhone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3 shrink-0" />
                  {formatVendorPhone(vendor.repPhone, vendor.repPhoneCountry)}
                </span>
              )}
            </div>
          </div>
        ) : null}
      </CardContent>
      <CardFooter className="flex items-center gap-3 text-muted-foreground">
        {websiteHref ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={websiteHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.currentTarget.blur()}
                className="cursor-pointer text-muted-foreground transition-colors hover:text-primary"
              >
                <GlobeIcon />
              </a>
            </TooltipTrigger>
            <TooltipContent>{getDisplayUrl(websiteHref)}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="cursor-not-allowed text-muted-foreground/20">
            <GlobeIcon />
          </span>
        )}
        {instagramHref ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={instagramHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.currentTarget.blur()}
                className="cursor-pointer text-muted-foreground transition-colors hover:text-primary"
              >
                <InstagramIcon />
              </a>
            </TooltipTrigger>
            <TooltipContent>{getDisplayUrl(instagramHref)}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="cursor-not-allowed text-muted-foreground/20">
            <InstagramIcon />
          </span>
        )}
        {pinterestHref ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={pinterestHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.currentTarget.blur()}
                className="cursor-pointer text-muted-foreground transition-colors hover:text-primary"
              >
                <PinterestIcon />
              </a>
            </TooltipTrigger>
            <TooltipContent>{getDisplayUrl(pinterestHref)}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="cursor-not-allowed text-muted-foreground/20">
            <PinterestIcon />
          </span>
        )}
        {facebookHref ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={facebookHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.currentTarget.blur()}
                className="cursor-pointer text-muted-foreground transition-colors hover:text-primary"
              >
                <FacebookIcon />
              </a>
            </TooltipTrigger>
            <TooltipContent>{getDisplayUrl(facebookHref)}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="cursor-not-allowed text-muted-foreground/20">
            <FacebookIcon />
          </span>
        )}
        {youtubeHref ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={youtubeHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.currentTarget.blur()}
                className="cursor-pointer text-muted-foreground transition-colors hover:text-primary"
              >
                <YoutubeIcon />
              </a>
            </TooltipTrigger>
            <TooltipContent>{getDisplayUrl(youtubeHref)}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="cursor-not-allowed text-muted-foreground/20">
            <YoutubeIcon />
          </span>
        )}
        {xTwitterHref ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={xTwitterHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.currentTarget.blur()}
                className="cursor-pointer text-muted-foreground transition-colors hover:text-primary"
              >
                <XTwitterIcon />
              </a>
            </TooltipTrigger>
            <TooltipContent>{getDisplayUrl(xTwitterHref)}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="cursor-not-allowed text-muted-foreground/20">
            <XTwitterIcon />
          </span>
        )}
      </CardFooter>
    </Card>
  );
}
