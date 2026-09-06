"use client";

import { use, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { LoadingState } from "@/components/loading-state";
import { FadeIn } from "@/components/fade-in";
import { useAuth } from "@/components/auth-context";
import {
  deleteLibraryItem,
  deleteReplacedStorageFiles,
  getLibraryItem,
  getVendors,
  updateLibraryItem,
} from "@/lib/db";
import { mirrorExternalImagesToFirebase } from "@/lib/library-image-mirror";
import type { LibraryItem, Vendor } from "@/lib/types";

import { DeleteItemDialog } from "../_components/delete-item-dialog";
import { ItemDetailHeader } from "../_components/item-detail-header";
import { ItemGalleryCard } from "../_components/item-gallery-card";
import { ItemNotesCards } from "../_components/item-notes-cards";
import { ItemPricingCard } from "../_components/item-pricing-card";
import { ItemSpecMatrix } from "../_components/item-spec-matrix";
import { libraryItemToForm } from "../_components/library-constants";
import { LibraryItemFormDialog } from "../_components/library-item-form-dialog";
import { QuickVendorDialog } from "../_components/quick-vendor-dialog";
import { useLibraryItemForm } from "../_components/use-library-item-form";

interface PageProps {
  params: Promise<{ itemId: string }>;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function LibraryItemDetailPage({ params }: PageProps) {
  const { itemId } = use(params);
  const router = useRouter();
  const { organizationId, loading: authLoading } = useAuth();

  const [item, setItem] = useState<LibraryItem | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePreviewImage, setActivePreviewImage] = useState("");

  const form = useLibraryItemForm();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [updatingCatalog, setUpdatingCatalog] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [deletingCatalog, setDeletingCatalog] = useState(false);
  const [isVendorDialogOpen, setIsVendorDialogOpen] = useState(false);

  // Fetch single catalog item & list of vendors on mount
  useEffect(() => {
    if (authLoading || !organizationId) return;
    const id = organizationId; // stable string dependency; profile object identity churns on each heartbeat

    async function loadData() {
      try {
        const [itemData, vendorsData] = await Promise.all([
          getLibraryItem(itemId),
          getVendors(id),
        ]);

        if (!itemData || itemData.organizationId !== id) {
          toast.error("Product catalog item not found.");
          router.push("/dashboard/library");
          return;
        }

        setItem(itemData);
        setVendors(vendorsData);
        setActivePreviewImage(
          itemData.coverImageUrl || itemData.imageUrls?.[0] || "",
        );
      } catch (error) {
        console.error("Failed to load library catalog item:", error);
        toast.error("Failed to retrieve catalog item specifications.");
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, [itemId, router, organizationId, authLoading]);

  const handleOpenEdit = () => {
    if (!item) return;
    form.reset(libraryItemToForm(item));
    setIsEditOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!item) return;
    setUpdatingCatalog(true);
    try {
      // Mirror any external (AI-sourced) images into Firebase so the item self-hosts them.
      const { imageUrls, coverImageUrl, coverImagePath, images, specSheet } =
        await mirrorExternalImagesToFirebase(
          item.organizationId,
          {
            imageUrls: form.formData.imageUrls,
            coverImageUrl: form.formData.coverImageUrl,
            coverImagePath: form.formData.coverImagePath,
            images: form.formData.images,
            specSheet: form.formData.specSheet,
          },
          item.itemId,
        );
      const updated = {
        ...form.formData,
        imageUrls,
        coverImageUrl,
        coverImagePath,
        images,
        specSheet,
      };

      try {
        await deleteReplacedStorageFiles(
          [
            item.coverImagePath,
            item.specSheet?.path,
            ...(item.images || []).map((img) => img.path),
          ],
          [
            updated.coverImagePath,
            updated.specSheet?.path,
            ...(updated.images || []).map((img) => img.path),
          ],
        );
      } catch (error) {
        toast.error(
          `Failed to clean up replaced product images: ${getErrorMessage(error, "Unknown error")}`,
        );
        return; // Abort saving if storage cleanup fails
      }

      await updateLibraryItem(item.itemId, updated);
      setItem({ ...item, ...updated });
      setIsEditOpen(false);
      setActivePreviewImage(coverImageUrl || imageUrls[0] || "");
      toast.success("Catalog item updated successfully!");
    } catch (error: unknown) {
      console.error(error);
      toast.error(
        getErrorMessage(error, "Failed to update library item details."),
      );
    } finally {
      setUpdatingCatalog(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!item) return;
    setDeletingCatalog(true);
    try {
      await deleteLibraryItem(item);
      toast.success("Product successfully deleted from Global Library!");
      router.push("/dashboard/library");
    } catch (error: unknown) {
      console.error(error);
      toast.error(getErrorMessage(error, "Failed to delete product item."));
    } finally {
      setDeletingCatalog(false);
      setIsDeleteAlertOpen(false);
    }
  };

  if (loading || authLoading) {
    return <LoadingState label="Loading Item" />;
  }

  if (!item) return null;

  const associatedVendor = vendors.find((v) => v.vendorId === item.vendorId);

  return (
    <FadeIn className="flex w-full flex-col">
      <ItemDetailHeader
        item={item}
        vendorName={associatedVendor?.name}
        onEdit={handleOpenEdit}
        onRequestDelete={() => setIsDeleteAlertOpen(true)}
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-4">
          <ItemGalleryCard
            item={item}
            activeImage={activePreviewImage}
            onSelectImage={setActivePreviewImage}
          />
        </div>

        <div className="flex flex-col gap-6 lg:col-span-8">
          <ItemPricingCard item={item} />
          <ItemSpecMatrix
            item={item}
            onSpecSheetSaved={(specSheet) =>
              setItem((prev) => (prev ? { ...prev, specSheet } : prev))
            }
          />
          <ItemNotesCards item={item} />
        </div>
      </div>

      <LibraryItemFormDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        title="Edit Item"
        submitLabel="Save Item"
        submitting={updatingCatalog}
        onSubmit={handleEditSubmit}
        form={form}
        vendors={vendors}
        onQuickAddVendor={() => setIsVendorDialogOpen(true)}
        uploaderId="edit-library-image-uploader"
      />

      <DeleteItemDialog
        open={isDeleteAlertOpen}
        onOpenChange={setIsDeleteAlertOpen}
        itemName={item.name}
        deleting={deletingCatalog}
        onConfirm={handleDeleteConfirm}
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
