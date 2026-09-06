"use client";

import { Suspense, useEffect, useState } from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  Plus,
  Search,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

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
import { PageTitle } from "@/components/page-title-updater";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addLibraryItem, getLibraryItems, getVendors } from "@/lib/db";
import { mirrorExternalImagesToFirebase } from "@/lib/library-image-mirror";
import type { LibraryItem, Vendor } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

import { QuickCreateTrigger } from "../_components/quick-create-trigger";
import { LibraryItemCard } from "./_components/library-item-card";
import { CATEGORIES, SUBCATEGORIES } from "./_components/library-constants";
import { LibraryItemFormDialog } from "./_components/library-item-form-dialog";
import { QuickVendorDialog } from "./_components/quick-vendor-dialog";
import { useLibraryItemForm } from "./_components/use-library-item-form";
import PageHeader from "@/components/page-header";
import { LoadingState } from "@/components/loading-state";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

// Longest material string the list view renders before cutting off with an
// ellipsis (full text stays available on hover). Table cells don't wrap, so an
// uncapped scraped materials blurb would stretch its column across the table.
const MATERIAL_CHAR_MAX = 40;

function LibraryContent() {
  const { organizationId, loading: authLoading } = useAuth();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useViewMode("library-view-mode");

  // Filters live in the URL (?category=&subcategory=) so category/subcategory
  // badges elsewhere can deep-link into a filtered catalog, and refresh/copied
  // links land on the same view.
  const searchParams = useSearchParams();
  const activeCategory = searchParams.get("category") ?? "All";
  const activeSubcategory = searchParams.get("subcategory") ?? "All";

  const setFilters = (category: string, subcategory: string) => {
    const params = new URLSearchParams(window.location.search);
    if (category === "All") params.delete("category");
    else params.set("category", category);
    if (subcategory === "All") params.delete("subcategory");
    else params.set("subcategory", subcategory);
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
    );
  };

  const form = useLibraryItemForm();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isVendorDialogOpen, setIsVendorDialogOpen] = useState(false);

  // Fetch Items & Vendors on Mount. Keyed on the stable `organizationId` string
  // rather than the `profile` object, whose identity churns on every onSnapshot/
  // lastActive update and would otherwise refetch the whole catalog on each heartbeat.
  useEffect(() => {
    if (authLoading || !organizationId) return;
    const id = organizationId; // narrowed to string for use inside the async closure

    async function loadData() {
      try {
        const [itemsData, vendorsData] = await Promise.all([
          getLibraryItems(id),
          getVendors(id),
        ]);
        setItems(itemsData);
        setVendors(vendorsData);
      } catch (error) {
        console.error("Failed to load catalog data:", error);
        toast.error("Failed to fetch library catalog from Firestore.", {
          duration: 8000,
        });
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, [organizationId, authLoading]);

  const handleOpenAdd = () => {
    form.reset();
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    // The ACTIVE org, not profile.organizationId (the HOME org): a SuperAdmin
    // working inside a tenant must create the item in that tenant, or it lands
    // invisible in their home org (fetches here already query the active org).
    if (!organizationId) return;
    setSubmitting(true);
    try {
      // Mirror any external (AI-sourced) images into Firebase so the item self-hosts them.
      const { imageUrls, coverImageUrl, coverImagePath, images, specSheet } =
        await mirrorExternalImagesToFirebase(
          organizationId,
          {
            imageUrls: form.formData.imageUrls,
            coverImageUrl: form.formData.coverImageUrl,
            coverImagePath: form.formData.coverImagePath,
            images: form.formData.images,
            specSheet: form.formData.specSheet,
          },
          form.tempItemId,
        );
      const created = await addLibraryItem(
        {
          ...form.formData,
          imageUrls,
          coverImageUrl,
          coverImagePath,
          images,
          specSheet,
          organizationId,
        },
        form.tempItemId,
      );
      setItems((prev) => [created, ...prev]);
      toast.success("New product successfully added to Global Library!");
      setIsModalOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save library item.", { duration: 8000 });
    } finally {
      setSubmitting(false);
    }
  };

  // Filtering
  const filteredItems = items.filter((item) => {
    const parentVendor = vendors.find((v) => v.vendorId === item.vendorId);
    const vendorName = parentVendor?.name || "";
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      item.name.toLowerCase().includes(query) ||
      vendorName.toLowerCase().includes(query) ||
      item.sku?.toLowerCase().includes(query) ||
      item.finishColor?.toLowerCase().includes(query);

    const matchesCategory =
      activeCategory === "All" || item.category === activeCategory;

    const matchesSubcategory =
      activeCategory === "All" ||
      activeSubcategory === "All" ||
      item.subcategory === activeSubcategory;

    return matchesSearch && matchesCategory && matchesSubcategory;
  });

  const isSubcategoryVisible =
    activeCategory !== "All" && SUBCATEGORIES[activeCategory] !== undefined;

  // Columns for the list display mode. A handful of fields that fit the
  // standard table comfortably; the rest live on the item detail page.
  const columns: ListViewColumn<LibraryItem>[] = [
    {
      id: "image",
      label: "Image",
      header: <span className="sr-only">Image</span>,
      hideable: false,
      cellClassName: "w-16",
      cell: (item) => (
        <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
          {item.coverImageUrl ? (
            <DashboardImage
              src={item.coverImageUrl}
              alt={item.name}
              sizes="48px"
              className="object-cover"
            />
          ) : (
            <ShoppingBag className="size-5 text-muted-foreground/30" />
          )}
        </div>
      ),
    },
    {
      id: "name",
      label: "Name",
      hideable: false,
      cell: (item) => (
        <Link
          href={`/dashboard/library/${item.itemId}`}
          className="font-medium text-foreground hover:text-primary"
        >
          {item.name}
        </Link>
      ),
    },
    {
      id: "vendor",
      label: "Vendor",
      cell: (item) => {
        const parentVendor = vendors.find((v) => v.vendorId === item.vendorId);
        if (!parentVendor) return "—";
        return (
          <Link
            href={`/dashboard/vendors/${parentVendor.vendorId}`}
            className="hover:text-primary hover:underline"
          >
            {parentVendor.name}
          </Link>
        );
      },
    },
    {
      id: "category",
      label: "Category",
      cell: (item) => item.category,
    },
    {
      id: "subcategory",
      label: "Subcategory",
      defaultVisible: false,
      cell: (item) => item.subcategory || "—",
    },
    {
      id: "sku",
      label: "SKU",
      cellClassName: "font-mono text-xs",
      cell: (item) => item.sku || "—",
    },
    {
      id: "color",
      label: "Color",
      cell: (item) => item.finishColor || "—",
    },
    {
      id: "material",
      label: "Material",
      cell: (item) => {
        if (!item.materials) return "—";
        if (item.materials.length <= MATERIAL_CHAR_MAX) return item.materials;
        return (
          <span title={item.materials}>
            {item.materials.slice(0, MATERIAL_CHAR_MAX).trimEnd()}…
          </span>
        );
      },
    },
    {
      id: "cost",
      label: "Cost",
      headClassName: "text-right",
      cellClassName: "text-right",
      cell: (item) => formatCurrency(item.unitCost),
    },
    {
      id: "sellingPrice",
      label: "Selling Price",
      headClassName: "text-right",
      cellClassName: "text-right",
      cell: (item) => (
        <span className="font-semibold text-primary">
          {formatCurrency(item.sellingPrice)}
        </span>
      ),
    },
    {
      id: "markup",
      label: "Markup",
      headClassName: "text-right",
      cellClassName: "text-right",
      cell: (item) => {
        const profitable = item.sellingPrice > item.unitCost;
        // Items without a selling price carry the org's default markup in the
        // data; showing it would imply pricing exists, so display 0 instead.
        const displayMarkup =
          item.sellingPrice > 0 ? Math.round(item.markup) : 0;
        return (
          <Badge
            className="text-[9px]"
            variant={profitable ? "trendingUp" : "trendingDown"}
          >
            {profitable ? (
              <TrendingUp className="size-3" />
            ) : (
              <TrendingDown className="size-3" />
            )}
            {displayMarkup}%
          </Badge>
        );
      },
    },
  ];

  const [columnVisibility, setColumnVisibility] = useColumnVisibility(
    columns,
    "library-list-columns",
  );

  if (loading) return <LoadingState label="Loading Library" />;

  return (
    <FadeIn className="flex w-full flex-col gap-6">
      <PageTitle title="Product Library" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Product Library"
          description="Catalog all your items in one place."
        />
        <Button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/95 sm:self-start"
        >
          <Plus className="size-4" />
          Item
        </Button>
      </div>

      <div className="flex flex-col items-center justify-between gap-4 pb-4 md:flex-row">
        {/* Category filter: tabs on very wide screens, dropdown below 3xl */}
        <div className="3xl:flex hidden w-full flex-col md:w-auto">
          <Tabs
            value={activeCategory}
            onValueChange={(val) => setFilters(val, "All")}
            className="w-full"
          >
            <TabsList className="flex max-w-full flex-wrap gap-0.5">
              <TabsTrigger value="All">All Categories</TabsTrigger>
              {CATEGORIES.map((cat) => (
                <TabsTrigger key={cat} value={cat}>
                  {cat}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div
            className="grid transition-all duration-200 ease-in-out"
            style={{
              gridTemplateRows: isSubcategoryVisible ? "1fr" : "0fr",
              opacity: isSubcategoryVisible ? 1 : 0,
              marginTop: isSubcategoryVisible ? "1rem" : "0rem",
            }}
          >
            <div className="overflow-hidden">
              <Tabs
                value={activeSubcategory}
                onValueChange={(val) => setFilters(activeCategory, val)}
                className="w-full"
              >
                <TabsList className="flex max-w-full flex-wrap gap-0.5">
                  <TabsTrigger value="All">All {activeCategory}</TabsTrigger>
                  {isSubcategoryVisible &&
                    SUBCATEGORIES[activeCategory].map((sub) => (
                      <TabsTrigger key={sub} value={sub}>
                        {sub}
                      </TabsTrigger>
                    ))}
                </TabsList>
              </Tabs>
            </div>
          </div>
        </div>

        <div className="flex 3xl:hidden w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
          <Select
            value={activeCategory}
            onValueChange={(val) => setFilters(val, "All")}
          >
            <SelectTrigger className="w-full md:w-55">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Categories</SelectItem>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {activeCategory !== "All" && SUBCATEGORIES[activeCategory] && (
            <Select
              value={activeSubcategory}
              onValueChange={(val) => setFilters(activeCategory, val)}
            >
              <SelectTrigger className="fade-in w-full animate-in duration-200 md:w-55">
                <SelectValue placeholder="Subcategory" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Subcategories</SelectItem>
                {SUBCATEGORIES[activeCategory].map((sub) => (
                  <SelectItem key={sub} value={sub}>
                    {sub}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Quick Search + display mode controls */}
        <div className="flex w-full items-center gap-2 md:w-auto">
          <div className="relative w-full max-w-xs">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search items, vendors or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
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

      {/* Library grid or list */}
      {filteredItems.length === 0 ? (
        <div className="flex min-h-[calc(100vh-30rem)] flex-col items-center justify-center border-dashed p-8 text-center">
          <Empty>
            <EmptyHeader>
              <EmptyMedia>
                <ShoppingBag className="mb-3 size-12 text-muted-foreground/40" />
              </EmptyMedia>
              <EmptyTitle>No Items Yet</EmptyTitle>
              <EmptyDescription className="w-full">
                {searchQuery
                  ? "Get started by adding an item to your library."
                  : "Try broadening your search or clear the active category filter."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row justify-center gap-2">
              {!searchQuery && (
                <Button
                  onClick={handleOpenAdd}
                  className="mt-4 flex items-center gap-2"
                >
                  <Plus className="size-4" />
                  Add An Item
                </Button>
              )}
            </EmptyContent>
          </Empty>
        </div>
      ) : view === "grid" ? (
        <FadeIn
          key="grid"
          className="grid xl:grid-cols-6 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5"
        >
          {filteredItems.map((item) => (
            <LibraryItemCard
              key={item.itemId}
              item={item}
              parentVendor={vendors.find((v) => v.vendorId === item.vendorId)}
            />
          ))}
        </FadeIn>
      ) : (
        <FadeIn key="list">
          <ListViewTable
            columns={columns}
            rows={filteredItems}
            rowKey={(item) => item.itemId}
            visibility={columnVisibility}
            rowHref={(item) => `/dashboard/library/${item.itemId}`}
          />
        </FadeIn>
      )}

      <QuickCreateTrigger onTrigger={handleOpenAdd} />
      <LibraryItemFormDialog
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title="Add Item"
        submitLabel="Add Item"
        submitting={submitting}
        onSubmit={handleSubmit}
        form={form}
        vendors={vendors}
        onQuickAddVendor={() => setIsVendorDialogOpen(true)}
      />

      <QuickVendorDialog
        open={isVendorDialogOpen}
        onOpenChange={setIsVendorDialogOpen}
        onCreated={(vendor) => {
          setVendors((prev) => [vendor, ...prev]);
          form.setValue("vendorId", vendor.vendorId, { shouldValidate: true });
        }}
      />
    </FadeIn>
  );
}

// useSearchParams requires a Suspense boundary on a statically rendered route.
export default function LibraryPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading Library" />}>
      <LibraryContent />
    </Suspense>
  );
}
