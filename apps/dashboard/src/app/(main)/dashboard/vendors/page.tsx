"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { Building2, Loader2, Mail, Phone, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-context";
import { DashboardImage } from "@/components/dashboard-image";
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

export default function VendorsPage() {
  const { profile, organizationId, loading: authLoading } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [isAddOpen, setIsAddOpen] = useState(false);

  const handleOpenAdd = () => setIsAddOpen(true);

  useEffect(() => {
    if (authLoading || !organizationId) return;
    const id = organizationId; // stable string dependency; profile object identity churns on each heartbeat

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const searchParam = params.get("search");
      if (searchParam) setSearchQuery(searchParam);
      if (params.get("add") === "true") {
        setIsAddOpen(true);
        window.history.replaceState({}, "", window.location.pathname);
      }
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
    if (!profile) return;
    const vendorId =
      customVendorId ?? `vendor-${Math.random().toString(36).substr(2, 9)}`;
    try {
      const mirrored = await mirrorVendorImagesToFirebase(
        profile.organizationId,
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
          organizationId: profile.organizationId,
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

  return (
    <>
      <PageTitle title="Vendor Directory" />
      <div className="flex w-full flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <H1>Vendor Directory</H1>
            <p className="mt-1 text-muted-foreground text-sm">
              Manage trade vendors and client procurement representatives.
            </p>
          </div>
          <Button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/95 sm:self-start">
            <Plus className="size-4" />
            Add Vendor
          </Button>
        </div>

        {/* Filter and search controls combined into a clean layout */}
        <div className="flex flex-col items-center justify-between gap-4 border-b pb-4 md:flex-row">
          {/* Category Tabs */}
          <Tabs
            value={activeCategory}
            onValueChange={setActiveCategory}
            className="w-full">
            <TabsList className="flex max-w-full flex-wrap gap-0.5">
              <TabsTrigger value="All">All Vendors</TabsTrigger>
              {VENDOR_CATEGORIES.map((cat) => (
                <TabsTrigger key={cat} value={cat}>
                  {cat}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Quick Search */}
          <div className="relative w-full max-w-xs">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search vendors, representatives or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-background/50 pl-9"
            />
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex min-h-75 flex-col items-center justify-center gap-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
              Loading Directory
            </p>
          </div>
        ) : filteredVendors.length === 0 ? (
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
                className="mt-4 flex items-center gap-2">
                <Plus className="size-4" />
                Add Vendor
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid 3xl:grid-cols-6 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            {filteredVendors.map((vendor) => (
              <VendorCard key={vendor.vendorId} vendor={vendor} />
            ))}
          </div>
        )}

        <VendorFormDialog
          open={isAddOpen}
          onOpenChange={setIsAddOpen}
          mode="add"
          initialData={EMPTY_VENDOR_FORM}
          onSave={handleAdd}
        />
      </div>
    </>
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
    <Card className="group relative flex h-full flex-col overflow-hidden pt-0 transition-all duration-200 has-[.detail-link:hover]:-translate-y-0.5 has-[.detail-link:hover]:border-primary/30 has-[.detail-link:hover]:shadow-md">
      {/* Hero area: real image → gradient fallback */}
      <Link
        href={`/dashboard/vendors/${vendor.vendorId}`}
        className="detail-link relative flex h-56 w-full cursor-pointer items-center justify-center overflow-hidden">
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
              className="detail-link cursor-pointer">
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
            <div className="flex flex-col gap-1 text-muted-foreground text-xs">
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
                className="cursor-pointer text-muted-foreground transition-colors hover:text-primary">
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
                className="cursor-pointer text-muted-foreground transition-colors hover:text-primary">
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
                className="cursor-pointer text-muted-foreground transition-colors hover:text-primary">
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
                className="cursor-pointer text-muted-foreground transition-colors hover:text-primary">
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
                className="cursor-pointer text-muted-foreground transition-colors hover:text-primary">
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
                className="cursor-pointer text-muted-foreground transition-colors hover:text-primary">
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
