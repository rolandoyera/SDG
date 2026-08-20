"use client";

import { useState } from "react";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import {
  Copy,
  Download,
  GripVertical,
  Loader2 as LoaderIcon,
  MoreHorizontal,
  Plus,
  ShoppingBag,
  Trash2,
  Upload,
} from "lucide-react";
import { createPortal } from "react-dom";
import { Controller } from "react-hook-form";
import { toast } from "sonner";

import { AiButton } from "@/components/ui/ai-button";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AI_ASSISTANT_NAME } from "@/lib/ai-assistant";
import type { Vendor } from "@/lib/types";
import { cn, formatCurrency, formatCurrencyInput } from "@/lib/utils";
import { fetchImageBytes } from "@/server/ai-actions";

import {
  CATEGORIES,
  MAX_IMAGES,
  SUBCATEGORIES,
  UNIT_TYPES,
} from "./library-constants";
import type { LibraryItemFormApi } from "./use-library-item-form";
import { Badge } from "@/components/ui/badge";

const LABEL_CLASS = "h-5 flex items-center";

interface LibraryItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  submitting: boolean;
  onSubmit: () => void | Promise<void>;
  form: LibraryItemFormApi;
  vendors: Vendor[];
  onQuickAddVendor: () => void;
  /** Unique id for the hidden file input (must differ if two forms ever mount together). */
  uploaderId?: string;
  /**
   * When true, the vendor is fixed (e.g. adding an item from a vendor's page):
   * the combobox and Quick Add are replaced by a read-only vendor name so the
   * item can't be reassigned to another vendor.
   */
  lockVendor?: boolean;
}

const downloadImage = async (url: string) => {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    let filename = "image.jpg";
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname;
      const part = pathname.split("/").pop();
      if (part?.includes(".")) {
        filename = part;
      }
    } catch {
      /* ignore */
    }
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
    toast.success("Image download started!");
  } catch (error) {
    console.error("Download error:", error);
    window.open(url, "_blank");
    toast.info("Opened image in new tab for download.");
  }
};

function DroppablePlaceholderWrapper({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className: string;
}) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={className}>
      {children}
    </div>
  );
}

interface SortableImageCardProps {
  url: string;
  index: number;
  onRemove: (url: string) => void;
}

function SortableImageCard({ url, index, onRemove }: SortableImageCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: url });

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scaleX ?? 1}, ${transform.scaleY ?? 1})`
      : undefined,
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 30 : 1,
  };

  const handleCopyImage = async () => {
    try {
      // Fetch the bytes server-side to avoid CORS on the Firebase Storage host.
      const res = await fetchImageBytes(url);
      if (!res.success || !res.base64 || !res.contentType) {
        throw new Error(res.error ?? "Could not load image bytes.");
      }

      const binary = atob(res.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: res.contentType });

      // Browsers only reliably accept image/png for clipboard image writes,
      // so convert non-PNG sources (JPG/WEBP) through a canvas first.
      let pngBlob = blob;
      if (blob.type !== "image/png") {
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
        pngBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
            "image/png",
          );
        });
      }

      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": pngBlob }),
      ]);
      toast.success("Image copied to clipboard!");
    } catch (error) {
      console.error("Copy image error:", error);
      toast.error("Couldn't copy image to clipboard.");
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/thumb relative aspect-square overflow-hidden rounded border bg-background transition-all hover:scale-102 ${
        index === 0
          ? "scale-102 border-primary ring-2 ring-primary/20"
          : "border-border hover:border-primary/50"
      }`}
    >
      {/* biome-ignore lint/performance/noImgElement: sortable preview uses dynamic local/external image URLs. */}
      <img
        src={url}
        alt={`Thumbnail ${index + 1}`}
        className="pointer-events-none size-full select-none object-cover"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
      />

      {/* Grip handle in top-left, visible on hover. Gets the sortable drag listeners & attributes. */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-1.5 left-1.5 z-20 flex size-6 cursor-all-scroll items-center justify-center rounded bg-black/60 text-white opacity-0 transition-opacity hover:bg-black group-hover/thumb:opacity-100"
        title="Drag to sort"
      >
        <GripVertical className="size-4" />
      </div>

      {/* Action Ellipsis dropdown button in bottom-right */}
      <div className="absolute right-1.5 bottom-1.5 z-20">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex size-6 cursor-pointer items-center justify-center rounded bg-black/60 text-white transition-colors hover:bg-black"
              aria-label="Image actions"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-30">
            <DropdownMenuItem
              onClick={handleCopyImage}
              className="flex items-center gap-2"
            >
              <Copy className="size-3.5 text-muted-foreground" />
              <span>Copy</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => downloadImage(url)}
              className="flex items-center gap-2"
            >
              <Download className="size-3.5 text-muted-foreground" />
              <span>Download</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onRemove(url)}
              variant="destructive"
              className="flex items-center gap-2 text-destructive"
            >
              <Trash2 className="size-3.5" />
              <span>Remove</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {index === 0 && (
        <span className="absolute bottom-1.5 left-1.5 z-10 select-none rounded bg-black/60 px-1 py-0.5 text-[8px] text-white uppercase tracking-wider backdrop-blur-xs">
          Cover
        </span>
      )}
    </div>
  );
}

/**
 * Shared dual-pane Add/Edit modal for a library item: specifications on the
 * left, financials + visual gallery on the right. Stateless apart from the
 * `form` hook it is handed — hosts own submission and the calculator/vendor dialogs.
 */
export function LibraryItemFormDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  submitting,
  onSubmit,
  form,
  vendors,
  onQuickAddVendor,
  uploaderId = "library-image-uploader",
  lockVendor = false,
}: LibraryItemFormDialogProps) {
  const [comboboxContainer, setComboboxContainer] =
    useState<HTMLDivElement | null>(null);
  const { formData, setFormData, uploadingImage } = form;
  const imageUrls = formData.imageUrls ?? [];

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  // Reorder once, on drop. Mutating the list during drag-over shifts the
  // SortableContext items underneath the cursor and breaks the gesture.
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeUrl = active.id as string;
    const overIdStr = over.id.toString();
    const oldIndex = imageUrls.indexOf(activeUrl);
    if (oldIndex === -1) return;

    // Dropping onto an empty slot sends the image to the end of the gallery.
    if (overIdStr.startsWith("placeholder-")) {
      const targetIndex = imageUrls.length - 1;
      if (oldIndex !== targetIndex) {
        form.reorderImages(oldIndex, targetIndex);
      }
      return;
    }

    if (activeUrl !== overIdStr) {
      const newIndex = imageUrls.indexOf(overIdStr);
      if (newIndex !== -1) {
        form.reorderImages(oldIndex, newIndex);
      }
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const isLowConfidence = (field: string) => {
    const confidence = formData.aiMetadata?.confidence?.[field];
    return confidence !== undefined && confidence < 0.8;
  };

  const getFieldStyle = (field: string) => {
    if (isLowConfidence(field)) {
      return "border-amber-500/60 focus-visible:ring-amber-500/30 bg-amber-500/5 transition-colors duration-200";
    }
    return "";
  };

  const renderConfidenceBadge = (field: string) => {
    const confidence = formData.aiMetadata?.confidence?.[field];
    if (confidence === undefined) return null;

    const isLow = confidence < 0.8;

    if (isLow) {
      return (
        <Badge
          variant="warning"
          className="ml-1.5 flex animate-pulse items-center gap-0.5 px-1 py-0.5 text-[8px]"
        >
          Review
        </Badge>
      );
    }

    return (
      <Badge
        variant="success"
        className="ml-1.5 flex items-center gap-0.5 px-1 py-0.5 text-[8px]"
      >
        Confident
      </Badge>
    );
  };

  // Shared formatted/raw price field bound to the form's focus bridge.
  const priceInput = (
    field: string,
    value: number,
    onValue: (n: number) => void,
  ) => (
    <Input
      type="text"
      placeholder="0.00"
      value={
        form.focusedField === field
          ? form.tempTextValue
          : formatCurrencyInput(value)
      }
      onFocus={() => {
        form.setFocusedField(field);
        form.setTempTextValue(value ? String(value) : "");
      }}
      onBlur={() => {
        form.setFocusedField(null);
        form.setTempTextValue("");
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9.]/g, "");
        form.setTempTextValue(raw);
        onValue(raw === "" || raw === "." ? 0 : Number(raw));

        // Clear AI confidence on edit
        const updatedConfidence = { ...formData.aiMetadata?.confidence };
        if (updatedConfidence[field]) {
          delete updatedConfidence[field];
          setFormData((prev) => ({
            ...prev,
            aiMetadata: prev.aiMetadata
              ? { ...prev.aiMetadata, confidence: updatedConfidence }
              : undefined,
          }));
        }
      }}
      className={`font-mono ${getFieldStyle(field)}`}
    />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-6xl">
        <div ref={setComboboxContainer} />
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex h-full w-full flex-col overflow-hidden"
        >
          <DialogHeader className="border-b px-6 pb-4">
            <DialogTitle className="flex items-center gap-2 font-heading font-medium text-2xl">
              <ShoppingBag className="size-5 text-primary" />
              {title}
            </DialogTitle>
            <DialogDescription>
              When using {AI_ASSISTANT_NAME}, always review extracted values. AI
              can sometimes make mistakes.
            </DialogDescription>
          </DialogHeader>

          {/* Split Screen Container */}
          <div className="grid flex-1 grid-cols-1 gap-0 overflow-y-auto overflow-x-hidden lg:grid-cols-12">
            {/* LEFT PANE: PRIMARY SPECIFICATIONS FORM (7 cols) */}

            <div className="flex flex-col gap-5 border-border/40 border-b p-6 lg:col-span-7 lg:border-r lg:border-b-0">
              <div className="flex flex-col gap-1.5">
                <Label className={LABEL_CLASS}>Product Web Link</Label>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="e.g. vendor.com/product-url"
                    value={formData.sourcingLink || ""}
                    onChange={(e) => {
                      const updatedConfidence = {
                        ...formData.aiMetadata?.confidence,
                      };
                      if (updatedConfidence.sourcingLink)
                        delete updatedConfidence.sourcingLink;
                      setFormData({
                        ...formData,
                        sourcingLink: e.target.value,
                        aiMetadata: formData.aiMetadata
                          ? {
                              ...formData.aiMetadata,
                              confidence: updatedConfidence,
                            }
                          : undefined,
                      });
                    }}
                    className="h-9 flex-1"
                  />
                  <AiButton
                    onClick={form.autofillWithAi}
                    disabled={!formData.sourcingLink}
                    loading={form.aiLoading}
                  >
                    {`Fill with ${AI_ASSISTANT_NAME}`}
                  </AiButton>
                </div>
                {form.variantOptions.length > 0 && (
                  <div className="mt-1 flex flex-col gap-2 rounded-lg border border-dashed p-3">
                    <Label className={LABEL_CLASS}>
                      This link doesn&apos;t specify a variant — which one did
                      you select on the vendor page?
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {form.variantOptions.map((option) => (
                        <Button
                          key={option.label}
                          type="button"
                          size="sm"
                          variant={
                            form.selectedVariantLabel === option.label
                              ? "default"
                              : "outline"
                          }
                          onClick={() => form.applyVariant(option)}
                        >
                          {option.label}
                          {option.sku ? ` · ${option.sku}` : ""}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <h3 className="border-b pb-1.5 font-medium text-muted-foreground/80 text-xs uppercase tracking-wider">
                Primary Specifications
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <Controller
                  control={form.control}
                  name="category"
                  render={({ field, fieldState }) => (
                    <Field
                      className="flex flex-col gap-1.5"
                      data-invalid={fieldState.invalid}
                    >
                      <Label className={`${LABEL_CLASS} flex items-center`}>
                        Category{" "}
                        <span className="ml-0.5 text-destructive">*</span>{" "}
                        {renderConfidenceBadge("category")}
                      </Label>
                      <Select
                        value={field.value}
                        onValueChange={(val) => {
                          // Radix's hidden native select echoes programmatic value
                          // changes back through onValueChange; a real user pick is
                          // always a different value. Without this, an AI autofill
                          // that sets category wipes the subcategory it just set.
                          if (val === field.value) return;
                          field.onChange(val);
                          form.setValue("subcategory", "");
                          const updatedConfidence = {
                            ...formData.aiMetadata?.confidence,
                          };
                          if (updatedConfidence.category)
                            delete updatedConfidence.category;
                          if (updatedConfidence.subcategory)
                            delete updatedConfidence.subcategory;
                          setFormData({
                            ...formData,
                            category: val,
                            subcategory: "",
                            aiMetadata: formData.aiMetadata
                              ? {
                                  ...formData.aiMetadata,
                                  confidence: updatedConfidence,
                                }
                              : undefined,
                          });
                        }}
                      >
                        <SelectTrigger
                          className={cn(
                            "h-9 w-full",
                            getFieldStyle("category"),
                          )}
                          aria-invalid={fieldState.invalid}
                        >
                          <SelectValue placeholder="Choose Category" />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
                <Controller
                  control={form.control}
                  name="subcategory"
                  render={({ field, fieldState }) => {
                    const activeCategory = formData.category;
                    const availableSubs = activeCategory
                      ? SUBCATEGORIES[activeCategory] || []
                      : [];
                    return (
                      <Field
                        className="flex flex-col gap-1.5"
                        data-invalid={fieldState.invalid}
                      >
                        <Label className={`${LABEL_CLASS} flex items-center`}>
                          Subcategory {renderConfidenceBadge("subcategory")}
                        </Label>
                        <Select
                          value={field.value}
                          disabled={!activeCategory}
                          onValueChange={(val) => {
                            // "" arrives from Radix's native-select echo when the
                            // item list hasn't mounted yet (category set in the same
                            // render, e.g. AI autofill) — never a real user pick.
                            if (!val || val === field.value) return;
                            field.onChange(val);
                            const updatedConfidence = {
                              ...formData.aiMetadata?.confidence,
                            };
                            if (updatedConfidence.subcategory)
                              delete updatedConfidence.subcategory;
                            setFormData({
                              ...formData,
                              subcategory: val,
                              aiMetadata: formData.aiMetadata
                                ? {
                                    ...formData.aiMetadata,
                                    confidence: updatedConfidence,
                                  }
                                : undefined,
                            });
                          }}
                        >
                          <SelectTrigger
                            className={cn(
                              "h-9 w-full",
                              getFieldStyle("subcategory"),
                            )}
                            aria-invalid={fieldState.invalid}
                          >
                            <SelectValue
                              placeholder={
                                activeCategory
                                  ? "Select Subcategory"
                                  : "Choose Category first"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent position="popper">
                            {availableSubs.map((sub) => (
                              <SelectItem key={sub} value={sub}>
                                {sub}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    );
                  }}
                />
              </div>

              <Controller
                control={form.control}
                name="name"
                render={({ field, fieldState }) => (
                  <Field
                    className="flex flex-col gap-1.5"
                    data-invalid={fieldState.invalid}
                  >
                    <Label className={`${LABEL_CLASS} flex items-center`}>
                      Item Name{" "}
                      <span className="ml-0.5 text-destructive">*</span>{" "}
                      {renderConfidenceBadge("name")}
                    </Label>
                    <Input
                      placeholder="e.g. Calacatta Viola, Honed Slab"
                      value={field.value}
                      onChange={(e) => {
                        field.onChange(e.target.value);
                        const updatedConfidence = {
                          ...formData.aiMetadata?.confidence,
                        };
                        if (updatedConfidence.name)
                          delete updatedConfidence.name;
                        setFormData({
                          ...formData,
                          name: e.target.value,
                          aiMetadata: formData.aiMetadata
                            ? {
                                ...formData.aiMetadata,
                                confidence: updatedConfidence,
                              }
                            : undefined,
                        });
                      }}
                      className={getFieldStyle("name")}
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Controller
                    control={form.control}
                    name="vendorId"
                    render={({ field, fieldState }) => {
                      const selected =
                        vendors.find((v) => v.vendorId === field.value) ?? null;
                      if (lockVendor) {
                        return (
                          <Field className="flex flex-col gap-1.5">
                            <Label
                              className={`${LABEL_CLASS} flex items-center`}
                            >
                              Vendor{" "}
                              <span className="ml-0.5 text-destructive">*</span>
                            </Label>
                            <div className="flex h-10 items-center rounded border border-input bg-muted/40 px-2.5 text-muted-foreground text-sm">
                              {selected?.name ?? "—"}
                            </div>
                          </Field>
                        );
                      }
                      return (
                        <Field
                          className="flex flex-col gap-1.5"
                          data-invalid={fieldState.invalid}
                        >
                          <Label
                            className={`${LABEL_CLASS} flex items-center justify-between`}
                          >
                            <span>
                              Vendor <span className="text-destructive">*</span>
                            </span>
                            <button
                              type="button"
                              onClick={onQuickAddVendor}
                              className="flex items-center gap-0.5 font-medium text-primary text-xs hover:cursor-pointer hover:underline"
                            >
                              <Plus className="size-3" /> Quick Add
                            </button>
                          </Label>
                          <Combobox
                            value={selected}
                            onValueChange={(item) =>
                              field.onChange(item?.vendorId ?? "")
                            }
                            items={[...vendors].sort((a, b) =>
                              a.name.localeCompare(b.name),
                            )}
                            filter={(
                              item: { vendorId: string; name: string },
                              inputValue: string,
                            ) =>
                              item.name
                                .toLowerCase()
                                .includes(inputValue.toLowerCase())
                            }
                          >
                            <ComboboxTrigger
                              render={
                                <button
                                  type="button"
                                  aria-invalid={fieldState.invalid}
                                  className={cn(
                                    "flex h-10 w-full items-center justify-between whitespace-nowrap rounded border border-input bg-transparent px-2.5 text-sm outline-none transition-colors",
                                    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                                    "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
                                    "dark:bg-input/30",
                                    !selected && "text-muted-foreground",
                                  )}
                                >
                                  {selected ? selected.name : "Choose Vendor"}
                                </button>
                              }
                            />
                            <ComboboxContent container={comboboxContainer}>
                              <ComboboxInput
                                showTrigger={false}
                                placeholder="Search vendors..."
                              />
                              <ComboboxEmpty>No vendor found.</ComboboxEmpty>
                              <ComboboxList>
                                {(item) => (
                                  <ComboboxItem
                                    key={item.vendorId}
                                    value={item}
                                  >
                                    {item.name}
                                  </ComboboxItem>
                                )}
                              </ComboboxList>
                            </ComboboxContent>
                          </Combobox>
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      );
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className={`${LABEL_CLASS} flex items-center`}>
                    SKU / Model # {renderConfidenceBadge("sku")}
                  </Label>
                  <Input
                    placeholder="e.g. SL-CV-04"
                    value={formData.sku || ""}
                    onChange={(e) => {
                      const updatedConfidence = {
                        ...formData.aiMetadata?.confidence,
                      };
                      if (updatedConfidence.sku) delete updatedConfidence.sku;
                      setFormData({
                        ...formData,
                        sku: e.target.value,
                        aiMetadata: formData.aiMetadata
                          ? {
                              ...formData.aiMetadata,
                              confidence: updatedConfidence,
                            }
                          : undefined,
                      });
                    }}
                    className={getFieldStyle("sku")}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className={`${LABEL_CLASS} flex items-center`}>
                  Public Description {renderConfidenceBadge("description")}
                </Label>
                <Textarea
                  placeholder="Item details, descriptions, or other specifics. Clients will see this."
                  value={formData.description || ""}
                  onChange={(e) => {
                    const updatedConfidence = {
                      ...formData.aiMetadata?.confidence,
                    };
                    if (updatedConfidence.description)
                      delete updatedConfidence.description;
                    setFormData({
                      ...formData,
                      description: e.target.value,
                      aiMetadata: formData.aiMetadata
                        ? {
                            ...formData.aiMetadata,
                            confidence: updatedConfidence,
                          }
                        : undefined,
                    });
                  }}
                  className={`min-h-20 ${getFieldStyle("description")}`}
                />
              </div>

              <h3 className="mt-2 border-b pb-1.5 font-medium text-muted-foreground/80 text-xs uppercase tracking-wider">
                Physical Specifications
              </h3>

              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Controller
                    control={form.control}
                    name="unitType"
                    render={({ field, fieldState }) => (
                      <Field
                        className="flex flex-col gap-1.5"
                        data-invalid={fieldState.invalid}
                      >
                        <Label className={LABEL_CLASS}>
                          Unit Type <span className="text-destructive">*</span>
                        </Label>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger
                            className="h-9 w-full"
                            aria-invalid={fieldState.invalid}
                          >
                            <SelectValue placeholder="Choose Unit Type" />
                          </SelectTrigger>
                          <SelectContent position="popper">
                            {UNIT_TYPES.map((ut) => (
                              <SelectItem key={ut} value={ut}>
                                {ut}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className={`${LABEL_CLASS} flex items-center`}>
                    Finish / Color {renderConfidenceBadge("finishColor")}
                  </Label>
                  <Input
                    placeholder="e.g. Honed Natural"
                    value={formData.finishColor || ""}
                    onChange={(e) => {
                      const updatedConfidence = {
                        ...formData.aiMetadata?.confidence,
                      };
                      if (updatedConfidence.finishColor)
                        delete updatedConfidence.finishColor;
                      setFormData({
                        ...formData,
                        finishColor: e.target.value,
                        aiMetadata: formData.aiMetadata
                          ? {
                              ...formData.aiMetadata,
                              confidence: updatedConfidence,
                            }
                          : undefined,
                      });
                    }}
                    className={getFieldStyle("finishColor")}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className={`${LABEL_CLASS} flex items-center`}>
                    Manufacturer {renderConfidenceBadge("manufacturer")}
                  </Label>
                  <Input
                    placeholder="e.g. Carrara Quarries"
                    value={formData.manufacturer || ""}
                    onChange={(e) => {
                      const updatedConfidence = {
                        ...formData.aiMetadata?.confidence,
                      };
                      if (updatedConfidence.manufacturer)
                        delete updatedConfidence.manufacturer;
                      setFormData({
                        ...formData,
                        manufacturer: e.target.value,
                        aiMetadata: formData.aiMetadata
                          ? {
                              ...formData.aiMetadata,
                              confidence: updatedConfidence,
                            }
                          : undefined,
                      });
                    }}
                    className={getFieldStyle("manufacturer")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label className={`${LABEL_CLASS} flex items-center`}>
                    Materials {renderConfidenceBadge("materials")}
                  </Label>
                  <Input
                    placeholder="e.g. Calacatta Viola Marble"
                    value={formData.materials || ""}
                    onChange={(e) => {
                      const updatedConfidence = {
                        ...formData.aiMetadata?.confidence,
                      };
                      if (updatedConfidence.materials)
                        delete updatedConfidence.materials;
                      setFormData({
                        ...formData,
                        materials: e.target.value,
                        aiMetadata: formData.aiMetadata
                          ? {
                              ...formData.aiMetadata,
                              confidence: updatedConfidence,
                            }
                          : undefined,
                      });
                    }}
                    className={getFieldStyle("materials")}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className={`${LABEL_CLASS} flex items-center`}>
                    Dimensions {renderConfidenceBadge("dimensions")}
                  </Label>
                  <Input
                    placeholder='e.g. 112" L x 68" W x 2cm'
                    value={formData.dimensions || ""}
                    onChange={(e) => {
                      const updatedConfidence = {
                        ...formData.aiMetadata?.confidence,
                      };
                      if (updatedConfidence.dimensions)
                        delete updatedConfidence.dimensions;
                      setFormData({
                        ...formData,
                        dimensions: e.target.value,
                        aiMetadata: formData.aiMetadata
                          ? {
                              ...formData.aiMetadata,
                              confidence: updatedConfidence,
                            }
                          : undefined,
                      });
                    }}
                    className={getFieldStyle("dimensions")}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className={LABEL_CLASS}>Internal Notes</Label>
                <Textarea
                  placeholder="Notes that are only visible to you."
                  value={formData.internalNote}
                  onChange={(e) =>
                    setFormData({ ...formData, internalNote: e.target.value })
                  }
                  className="min-h-17.5"
                />
              </div>
            </div>

            {/* RIGHT PANE: FINANCIALS, CALCULATOR & MULTI-MEDIA UPLOADS (5 cols) */}
            <div className="flex flex-col gap-6 bg-muted/20 p-6 lg:col-span-5">
              {/* FINANCIAL MATRIX SECTION */}
              <div>
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label className={LABEL_CLASS}>
                        Unit Wholesale Cost ($)
                      </Label>
                      {priceInput(
                        "unitCost",
                        formData.unitCost,
                        form.setUnitCost,
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className={LABEL_CLASS}>Markup %</Label>
                      <Input
                        type="number"
                        placeholder="20"
                        value={formData.markup || ""}
                        onChange={(e) => form.setMarkup(Number(e.target.value))}
                        className="font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label className={`${LABEL_CLASS} flex items-center`}>
                        Suggested MSRP ($) {renderConfidenceBadge("msrp")}
                      </Label>
                      {priceInput("msrp", formData.msrp ?? 0, form.setMsrp)}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className={LABEL_CLASS}>
                        Client Selling Price ($)
                      </Label>
                      {priceInput(
                        "sellingPrice",
                        formData.sellingPrice,
                        form.setSellingPrice,
                      )}
                    </div>
                  </div>

                  {/* Live Margin Calculation Cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col justify-center gap-1 px-3 text-emerald-600">
                      <span className="font-medium text-emerald-600 text-xs uppercase tracking-wider">
                        Your Profit
                      </span>
                      <span className="font-medium font-mono text-base">
                        +
                        {formatCurrency(
                          formData.sellingPrice - formData.unitCost,
                        )}
                      </span>
                    </div>
                    <div className="flex flex-col justify-center gap-1 px-3 text-primary">
                      <span className="font-medium text-primary text-xs uppercase tracking-wider">
                        Client Savings
                      </span>
                      <span className="font-medium font-mono text-base">
                        {(formData.msrp ?? 0) > formData.sellingPrice
                          ? formatCurrency(
                              (formData.msrp ?? 0) - formData.sellingPrice,
                            )
                          : "$0.00"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* VISUAL IMAGE LIBRARY SLOTS */}
              <div>
                {/* Hidden file uploader for Firebase Storage */}
                <input
                  type="file"
                  id={uploaderId}
                  accept="image/*"
                  onChange={form.handleImageUpload}
                  className="hidden"
                  disabled={uploadingImage || imageUrls.length >= MAX_IMAGES}
                />

                <div className="flex flex-col gap-4">
                  {/* Primary Cover Image Preview Box */}
                  <div className="group/cover relative flex aspect-5/4.5 w-full items-center justify-center overflow-hidden rounded border border-border/80 bg-background">
                    {uploadingImage && imageUrls.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-1.5 p-4 text-center text-primary">
                        <LoaderIcon className="size-8 animate-spin" />
                        <p className="text-xs">Uploading visual...</p>
                      </div>
                    ) : formData.coverImageUrl ? (
                      <>
                        {/* biome-ignore lint/performance/noImgElement: form preview uses dynamic local/external image URLs. */}
                        <img
                          src={formData.coverImageUrl}
                          alt="Primary Preview"
                          className="absolute inset-0 size-full object-contain p-4"
                        />
                        <span className="absolute bottom-2.5 left-2.5 rounded-full bg-black/60 px-2 py-0.5 font-medium text-[9px] text-white uppercase tracking-wider backdrop-blur-xs">
                          Active Cover
                        </span>
                      </>
                    ) : (
                      <Label
                        htmlFor={uploaderId}
                        className="flex size-full cursor-pointer flex-col items-center justify-center gap-1.5 p-4 text-center text-muted-foreground/60 transition-colors hover:bg-muted/10 hover:text-muted-foreground"
                      >
                        <Upload className="size-8 text-muted-foreground/40" />
                        <p className="text-xs">Click to upload image</p>
                        <p className="text-muted-foreground/50 text-xs">
                          Supports JPG, PNG, WEBP (Max 5MB)
                        </p>
                      </Label>
                    )}
                  </div>

                  {/* Secondary Gallery Grid of up to 4 thumbnail slots */}
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragCancel={handleDragCancel}
                  >
                    {/* Force a consistent drag cursor everywhere until release. */}
                    {activeId && (
                      <style>{"*{cursor:all-scroll !important}"}</style>
                    )}
                    <SortableContext
                      items={imageUrls}
                      strategy={rectSortingStrategy}
                    >
                      <div className="grid grid-cols-3 gap-3">
                        {imageUrls.map((url, i) => (
                          <SortableImageCard
                            key={url}
                            url={url}
                            index={i}
                            onRemove={form.removeImageUrl}
                          />
                        ))}

                        {/* Empty slots placeholders */}
                        {Array.from({
                          length: Math.max(0, MAX_IMAGES - imageUrls.length),
                        }).map((_, idx) => {
                          const placeholderId = `placeholder-${idx}`;
                          if (idx === 0 && uploadingImage) {
                            return (
                              <DroppablePlaceholderWrapper
                                key={placeholderId}
                                id={placeholderId}
                                className="aspect-square"
                              >
                                <div className="flex size-full items-center justify-center rounded border border-primary/50 border-dashed bg-primary/5 text-primary">
                                  <LoaderIcon className="size-4 animate-spin" />
                                </div>
                              </DroppablePlaceholderWrapper>
                            );
                          }
                          return (
                            <DroppablePlaceholderWrapper
                              key={placeholderId}
                              id={placeholderId}
                              className="aspect-square"
                            >
                              <Label
                                htmlFor={uploaderId}
                                className="flex size-full cursor-pointer items-center justify-center rounded border border-muted-foreground/30 border-dashed text-muted-foreground/40 hover:border-primary/50 hover:bg-primary/5"
                              >
                                <Plus className="size-4" />
                              </Label>
                            </DroppablePlaceholderWrapper>
                          );
                        })}
                      </div>
                    </SortableContext>

                    {/*
                      Portal the overlay to <body> so it escapes the dialog's
                      centering transform — a transformed ancestor would become
                      the containing block for the overlay's `position: fixed`,
                      offsetting it so it never tracks the cursor.
                    */}
                    {typeof document !== "undefined" &&
                      createPortal(
                        <DragOverlay adjustScale={true}>
                          {activeId ? (
                            <div className="relative aspect-square scale-102 cursor-grabbing overflow-hidden rounded border border-primary bg-background opacity-90 shadow-2xl">
                              {/* biome-ignore lint/performance/noImgElement: drag overlay preview uses the active dynamic image URL. */}
                              <img
                                src={activeId}
                                alt="Dragging preview"
                                className="pointer-events-none size-full select-none object-cover"
                                draggable={false}
                              />
                              <div className="absolute top-1.5 left-1.5 z-20 flex size-6 items-center justify-center rounded bg-black/60 text-white">
                                <GripVertical className="size-4" />
                              </div>
                            </div>
                          ) : null}
                        </DragOverlay>,
                        document.body,
                      )}
                  </DndContext>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t bg-muted/30 pr-8 pb-8">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2"
            >
              {submitting && <LoaderIcon className="size-4 animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
