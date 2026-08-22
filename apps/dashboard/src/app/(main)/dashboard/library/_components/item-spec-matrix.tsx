import type React from "react";
import { useRef, useState } from "react";

import { ExternalLink, FileText, Loader2, Tag, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  deleteReplacedStorageFiles,
  updateLibraryItem,
  uploadLibraryDoc,
} from "@/lib/db";
import type { LibraryItem } from "@/lib/types";

import { withProtocol } from "./library-constants";
import { cn } from "@/lib/utils";

const MAX_SPEC_SHEET_BYTES = 15 * 1024 * 1024; // storage.rules cap

/** Show the value, or a muted "N/A" placeholder when it is empty. */
const na = (value?: string) => (value ? value : "N/A");

function SpecField({
  label,
  value,
  className,
}: {
  label: string;
  value?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5 bg-background p-4", className)}>
      <Label>{label}</Label>
      {value && (
        <span className="text-muted-foreground text-sm capitalize">
          {value}
        </span>
      )}
      {!value && (
        <span className="font-medium text-muted-foreground/30 text-sm">
          N/A
        </span>
      )}
    </div>
  );
}

interface ItemSpecMatrixProps {
  item: LibraryItem;
  /** Called after a spec sheet PDF is uploaded and saved, so the page can refresh its item state. */
  onSpecSheetSaved?: (specSheet: { url: string; path: string }) => void;
}

/** Spec grid plus assigned vendor, direct product link, and spec sheet PDF. */
export function ItemSpecMatrix({
  item,
  onSpecSheetSaved,
}: ItemSpecMatrixProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const handleSpecSheetUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Spec sheets must be PDF files.", { duration: 8000 });
      return;
    }
    if (file.size >= MAX_SPEC_SHEET_BYTES) {
      toast.error("Spec sheet exceeds the 15MB limit.", { duration: 8000 });
      return;
    }

    setUploadingDoc(true);
    try {
      const specSheet = await uploadLibraryDoc(
        item.organizationId,
        file,
        item.itemId,
      );
      // GC a previously mirrored/uploaded sheet before pointing the item at
      // the new one; an orphaned file is worse than a failed cleanup, so a
      // cleanup error aborts the save (same rule as the edit flow).
      await deleteReplacedStorageFiles(
        [item.specSheet?.path],
        [specSheet.path],
      );
      await updateLibraryItem(item.itemId, { specSheet });
      onSpecSheetSaved?.(specSheet);
      toast.success("Spec sheet uploaded!");
    } catch (error) {
      console.error("Spec sheet upload failed:", error);
      toast.error("Failed to upload spec sheet.", { duration: 8000 });
    } finally {
      setUploadingDoc(false);
    }
  };

  return (
    <Card variant="panel">
      <CardHeader>
        <CardTitle>
          <Tag className="icons" />
          Specifications
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 py-3">
        <div className="grid grid-cols-2 overflow-hidden rounded border border-border text-sm md:grid-cols-4">
          <SpecField
            className="border-r border-b"
            label="Finish / Color"
            value={na(item.finishColor)}
          />
          <SpecField
            className="border-r border-b"
            label="Materials"
            value={na(item.materials)}
          />
          <SpecField
            className="border-r border-b"
            label="Dimensions"
            value={na(item.dimensions)}
          />
          <SpecField
            className="border-b"
            label="SKU / Model #"
            value={na(item.sku)}
          />
          <SpecField
            className="border-r"
            label="Unit Type"
            value={item.unitType}
          />
          <SpecField
            className="border-r"
            label="Manufacturer"
            value={item.manufacturer}
          />
          <SpecField
            className="border-r"
            label="Category"
            value={item.category}
          />
          <SpecField label="Subcategory" value={item.subcategory} />
        </div>
      </CardContent>
      <CardFooter className="h-14">
        <div className="flex w-full items-center justify-end gap-4">
          {item.specSheet?.url ? (
            <a
              href={item.specSheet.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="secondary" size="sm">
                <FileText className="size-4" />
                View Spec Sheet
              </Button>
            </a>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={uploadingDoc}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadingDoc ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Upload Spec Sheet
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleSpecSheetUpload}
          />
          {item.sourcingLink && (
            <div>
              <a
                href={withProtocol(item.sourcingLink)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="secondary" size="sm">
                  <ExternalLink className="size-4" />
                  Product Website
                </Button>
              </a>
            </div>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
