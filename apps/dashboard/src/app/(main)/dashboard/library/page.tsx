"use client";

import { Suspense, useEffect, useState } from "react";

import { useSearchParams } from "next/navigation";

import { Loader2, Plus, Search, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-context";
import { PageTitle } from "@/components/page-title-updater";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

import { LibraryItemCard } from "./_components/library-item-card";
import { CATEGORIES, SUBCATEGORIES } from "./_components/library-constants";
import { LibraryItemFormDialog } from "./_components/library-item-form-dialog";
import { QuickVendorDialog } from "./_components/quick-vendor-dialog";
import { useLibraryItemForm } from "./_components/use-library-item-form";
import PageHeader from "@/components/page-header";

function LibraryContent() {
  const { profile, organizationId, loading: authLoading } = useAuth();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

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

        // Auto-open add modal if deep-linked via Quick Create
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          if (params.get("add") === "true") {
            form.reset();
            setIsModalOpen(true);
            params.delete("add");
            const qs = params.toString();
            window.history.replaceState(
              {},
              "",
              qs
                ? `${window.location.pathname}?${qs}`
                : window.location.pathname,
            );
          }
        }
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
  }, [organizationId, authLoading, form.reset]);

  const handleOpenAdd = () => {
    form.reset();
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!profile) return;
    setSubmitting(true);
    try {
      // Mirror any external (AI-sourced) images into Firebase so the item self-hosts them.
      const { imageUrls, coverImageUrl, coverImagePath, images } =
        await mirrorExternalImagesToFirebase(
          profile.organizationId,
          {
            imageUrls: form.formData.imageUrls,
            coverImageUrl: form.formData.coverImageUrl,
            coverImagePath: form.formData.coverImagePath,
            images: form.formData.images,
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
          organizationId: profile.organizationId,
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

  return (
    <div className="flex w-full flex-col gap-6">
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
          Add Item
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

        {/* Quick Search */}
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search items, vendors or SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Library Grid or Skeletons */}
      {loading ? (
        <div className="flex min-h-75 flex-col items-center justify-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            Loading Library
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <Card className="flex min-h-75 flex-col items-center justify-center border-dashed p-8 text-center">
          <ShoppingBag className="mb-3 size-12 text-muted-foreground/40" />
          <h3 className="font-semibold text-lg">Library is empty</h3>
          <p className="mt-1 max-w-sm text-muted-foreground text-sm">
            {searchQuery
              ? "Try broadening your search or clear the active category filter."
              : "Get started by adding an item to your library."}
          </p>
          {!searchQuery && (
            <Button
              onClick={handleOpenAdd}
              className="mt-4 flex items-center gap-2"
            >
              <Plus className="size-4" />
              Add An Item
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid 3xl:grid-cols-7 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {filteredItems.map((item) => (
            <LibraryItemCard
              key={item.itemId}
              item={item}
              parentVendor={vendors.find((v) => v.vendorId === item.vendorId)}
            />
          ))}
        </div>
      )}

      <LibraryItemFormDialog
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title="Add Item"
        submitLabel="Add Catalog Item"
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
    </div>
  );
}

// useSearchParams requires a Suspense boundary on a statically rendered route.
export default function LibraryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-75 flex-col items-center justify-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            Loading Library
          </p>
        </div>
      }
    >
      <LibraryContent />
    </Suspense>
  );
}
