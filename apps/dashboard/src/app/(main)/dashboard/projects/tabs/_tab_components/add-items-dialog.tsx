"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Search, ShoppingBag } from "lucide-react";
import { Controller, type Resolver, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { DashboardImage } from "@/components/dashboard-image";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { addLibraryItem, addProjectRoomItem } from "@/lib/db";
import type {
  LibraryItem,
  ProjectRoom,
  ProjectRoomItem,
  Vendor,
} from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

import {
  CATEGORIES,
  COST_TYPES,
  SUBCATEGORIES,
  UNIT_TYPES,
} from "../../../library/_components/library-constants";

// ----------------------------------------------------
// Validation Schemas
// ----------------------------------------------------
const customItemSchema = z.object({
  costType: z.enum(COST_TYPES).default("Product"),
  category: z.string().min(1, "Category is required."),
  subcategory: z.string().optional(),
  name: z.string().min(1, "Item name is required."),
  sku: z.string().optional(),
  sourcingLink: z.string().optional(),
  unitType: z.enum(UNIT_TYPES, { error: "Unit type is required." }),
  unitCost: z.number().min(0, "Cost must be positive."),
  markup: z.number().min(0, "Markup must be positive."),
  sellingPrice: z.number().min(0, "Price must be positive."),
  description: z.string().optional(),
  dimensions: z.string().optional(),
  materials: z.string().optional(),
  quantity: z.number().min(1, "Quantity must be at least 1."),
  saveToLibrary: z.boolean().default(false),
});

type CustomItemFormData = z.infer<typeof customItemSchema>;

interface AddItemsDialogProps {
  room: ProjectRoom;
  projectId: string;
  organizationId: string;
  libraryItems: LibraryItem[];
  vendors: Vendor[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onItemAdded: (item: ProjectRoomItem) => void;
}

export function AddItemsDialog({
  room,
  projectId,
  organizationId,
  libraryItems,
  vendors,
  open,
  onOpenChange,
  onItemAdded,
}: AddItemsDialogProps) {
  const [activeTab, setActiveTab] = useState("catalog");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  // Selection states for Tab 1 (Catalog)
  const [selectedCatalogItems, setSelectedCatalogItems] = useState<
    Record<string, number>
  >({});
  const [addingCatalog, setAddingCatalog] = useState(false);

  // Form for Tab 2 (Custom Item)
  const customItemForm = useForm<CustomItemFormData>({
    resolver: zodResolver(customItemSchema) as Resolver<CustomItemFormData>,
    defaultValues: {
      costType: "Product",
      category: "Furniture",
      subcategory: "",
      name: "",
      sku: "",
      sourcingLink: "",
      unitType: "Each",
      unitCost: 0,
      markup: 0,
      sellingPrice: 0,
      description: "",
      dimensions: "",
      materials: "",
      quantity: 1,
      saveToLibrary: false,
    },
  });

  const customFormData = customItemForm.watch();

  const handleUnitCostChange = (val: number) => {
    const sellingPrice = Number(
      (val * (1 + customFormData.markup / 100)).toFixed(2),
    );
    customItemForm.setValue("unitCost", val);
    customItemForm.setValue("sellingPrice", sellingPrice);
  };

  const handleMarkupChange = (val: number) => {
    const sellingPrice = Number(
      (customFormData.unitCost * (1 + val / 100)).toFixed(2),
    );
    customItemForm.setValue("markup", val);
    customItemForm.setValue("sellingPrice", sellingPrice);
  };

  const handleSellingPriceChange = (val: number) => {
    const cost = customFormData.unitCost;
    const markup =
      cost > 0
        ? Number((((val - cost) / cost) * 100).toFixed(2))
        : customFormData.markup;
    customItemForm.setValue("sellingPrice", val);
    customItemForm.setValue("markup", markup);
  };

  const filteredCatalogItems = libraryItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.manufacturer?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      categoryFilter === "All" || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const toggleCatalogSelection = (itemId: string) => {
    setSelectedCatalogItems((prev) => {
      const copy = { ...prev };
      if (itemId in copy) {
        delete copy[itemId];
      } else {
        copy[itemId] = 1;
      }
      return copy;
    });
  };

  const updateCatalogQty = (itemId: string, qty: number) => {
    if (qty < 1) return;
    setSelectedCatalogItems((prev) => ({
      ...prev,
      [itemId]: qty,
    }));
  };

  const handleAddSelectedCatalog = async () => {
    const itemIds = Object.keys(selectedCatalogItems);
    if (itemIds.length === 0) {
      toast.error("Please select at least one item.");
      return;
    }

    setAddingCatalog(true);
    try {
      for (const id of itemIds) {
        const libItem = libraryItems.find((li) => li.itemId === id);
        if (!libItem) continue;

        const qty = selectedCatalogItems[id];
        const { itemId, updatedAt, ...rest } = libItem;

        const roomItem = await addProjectRoomItem({
          ...rest,
          roomId: room.roomId,
          projectId,
          libraryItemId: id,
          quantity: qty,
        });

        onItemAdded(roomItem);
      }
      toast.success(`Items successfully added to ${room.name}!`);
      setSelectedCatalogItems({});
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to add catalog items to room.");
    } finally {
      setAddingCatalog(false);
    }
  };

  const onSubmitCustomItem = async (data: CustomItemFormData) => {
    try {
      const { saveToLibrary, ...itemDetails } = data;
      let libraryItemId: string | undefined;

      if (saveToLibrary) {
        const globalItem = await addLibraryItem({
          organizationId,
          name: itemDetails.name,
          costType: itemDetails.costType,
          category: itemDetails.category,
          subcategory: itemDetails.subcategory,
          sku: itemDetails.sku,
          description: itemDetails.description,
          unitType: itemDetails.unitType,
          finishColor: "",
          sourcingLink: itemDetails.sourcingLink,
          manufacturer: "",
          materials: itemDetails.materials,
          dimensions: itemDetails.dimensions,
          taxable: true,
          unitCost: itemDetails.unitCost,
          markup: itemDetails.markup,
          sellingPrice: itemDetails.sellingPrice,
        });
        libraryItemId = globalItem.itemId;
        toast.success("New product saved to Global Library!");
      }

      const roomItem = await addProjectRoomItem({
        organizationId,
        projectId,
        roomId: room.roomId,
        libraryItemId,
        name: itemDetails.name,
        costType: itemDetails.costType,
        category: itemDetails.category,
        subcategory: itemDetails.subcategory,
        sku: itemDetails.sku,
        description: itemDetails.description,
        unitType: itemDetails.unitType,
        sourcingLink: itemDetails.sourcingLink,
        materials: itemDetails.materials,
        dimensions: itemDetails.dimensions,
        taxable: true,
        unitCost: itemDetails.unitCost,
        markup: itemDetails.markup,
        sellingPrice: itemDetails.sellingPrice,
        quantity: itemDetails.quantity,
      });

      onItemAdded(roomItem);
      toast.success(`Product added to ${room.name}!`);
      customItemForm.reset();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to create room item.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] flex-col overflow-hidden bg-popover/97 p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 border-b p-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="size-5 text-primary" />
            Add Items to {room.name}
          </DialogTitle>
          <DialogDescription className="ml-7">
            Select from your library or create new items.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b bg-muted/10 px-6 py-2">
            <TabsList className="w-full justify-start gap-1">
              <TabsTrigger value="catalog">Library Items</TabsTrigger>
              <TabsTrigger value="custom">Create New Item</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="catalog"
            className="m-0 flex flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 gap-4 border-b p-4">
              <div className="relative flex-1">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search catalog by name, SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pl-9"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-9 w-[180px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Categories</SelectItem>
                  {CATEGORIES.map((cat: string) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {filteredCatalogItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
                  <ShoppingBag className="mb-2 size-12 text-muted-foreground/30" />
                  <p className="font-semibold text-sm">No items found</p>
                  <p className="text-xs">
                    Adjust filters or create a custom item.
                  </p>
                </div>
              ) : (
                filteredCatalogItems.map((item) => {
                  const isChecked = item.itemId in selectedCatalogItems;
                  const qty = selectedCatalogItems[item.itemId] || 1;
                  const parentVendor = vendors.find(
                    (v) => v.vendorId === item.vendorId,
                  );

                  return (
                    <div
                      key={item.itemId}
                      className={`flex items-center gap-4 rounded border p-3 transition-all ${
                        isChecked
                          ? "border-primary bg-primary/5 shadow-xs"
                          : "hover:border-primary/20"
                      }`}>
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() =>
                          toggleCatalogSelection(item.itemId)
                        }
                        className="size-4.5 rounded"
                      />
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
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate font-semibold text-foreground text-sm">
                          {item.name}
                        </h4>
                        <p className="mt-0.5 truncate text-muted-foreground text-xs">
                          {parentVendor?.name}{" "}
                          {item.sku && `• SKU: ${item.sku}`}
                        </p>
                      </div>
                      <div className="flex w-32 shrink-0 flex-col gap-0.5 text-left">
                        <Label>{item.unitType}</Label>
                        <span className="font-medium text-foreground text-sm">
                          {formatCurrency(item.sellingPrice)}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-6">
                        <div className="flex min-w-[70px] flex-col items-end gap-0.5">
                          <Label>Total</Label>
                          <span className="font-bold text-primary text-sm">
                            {formatCurrency(qty * item.sellingPrice)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="font-medium text-muted-foreground text-xs">
                            Qty:
                          </Label>
                          <Input
                            type="number"
                            min="1"
                            disabled={!isChecked}
                            value={qty}
                            onChange={(e) =>
                              updateCatalogQty(
                                item.itemId,
                                Number(e.target.value),
                              )
                            }
                            className="h-8 w-16 text-center"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between border-t bg-muted/10 p-4">
              <span className="font-semibold text-muted-foreground text-xs">
                {Object.keys(selectedCatalogItems).length} items selected
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAddSelectedCatalog}
                  disabled={
                    addingCatalog ||
                    Object.keys(selectedCatalogItems).length === 0
                  }>
                  {addingCatalog && (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  )}
                  Add to Room
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent
            value="custom"
            className="m-0 flex flex-1 flex-col overflow-hidden">
            <form
              onSubmit={customItemForm.handleSubmit(onSubmitCustomItem)}
              className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 space-y-6 overflow-y-auto p-6">
                <div>
                  <h3 className="mb-4 border-b pb-1.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                    Primary Details
                  </h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Controller
                      control={customItemForm.control}
                      name="name"
                      render={({ field, fieldState }) => (
                        <Field
                          className="flex flex-col gap-1.5"
                          data-invalid={fieldState.invalid}>
                          <Label>
                            Item Name{" "}
                            <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            placeholder="e.g. Modernist Solid Walnut Sofa"
                            {...field}
                          />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                    <Controller
                      control={customItemForm.control}
                      name="sku"
                      render={({ field, fieldState }) => (
                        <Field
                          className="flex flex-col gap-1.5"
                          data-invalid={fieldState.invalid}>
                          <Label>SKU / Model Number</Label>
                          <Input placeholder="e.g. SF-WL-01" {...field} />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                    <Controller
                      control={customItemForm.control}
                      name="category"
                      render={({ field, fieldState }) => (
                        <Field
                          className="flex flex-col gap-1.5"
                          data-invalid={fieldState.invalid}>
                          <Label>
                            Category <span className="text-destructive">*</span>
                          </Label>
                          <Select
                            value={field.value}
                            onValueChange={(val) => {
                              field.onChange(val);
                              customItemForm.setValue("subcategory", "");
                            }}>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose Category" />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORIES.map((cat: string) => (
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
                      control={customItemForm.control}
                      name="subcategory"
                      render={({ field, fieldState }) => {
                        const activeCategory = customFormData.category;
                        const subs = activeCategory
                          ? SUBCATEGORIES[activeCategory] || []
                          : [];
                        return (
                          <Field
                            className="flex flex-col gap-1.5"
                            data-invalid={fieldState.invalid}>
                            <Label>Subcategory</Label>
                            <Select
                              value={field.value}
                              disabled={!activeCategory || subs.length === 0}
                              onValueChange={field.onChange}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select Subcategory" />
                              </SelectTrigger>
                              <SelectContent>
                                {subs.map((sub: string) => (
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
                </div>

                <div>
                  <h3 className="mb-4 border-b pb-1.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                    Physical Specs & Links
                  </h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Controller
                      control={customItemForm.control}
                      name="sourcingLink"
                      render={({ field, fieldState }) => (
                        <Field
                          className="flex flex-col gap-1.5"
                          data-invalid={fieldState.invalid}>
                          <Label>Sourcing Link</Label>
                          <Input placeholder="https://..." {...field} />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                    <Controller
                      control={customItemForm.control}
                      name="unitType"
                      render={({ field, fieldState }) => (
                        <Field
                          className="flex flex-col gap-1.5"
                          data-invalid={fieldState.invalid}>
                          <Label>Unit Type</Label>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Unit Type" />
                            </SelectTrigger>
                            <SelectContent>
                              {UNIT_TYPES.map((u: string) => (
                                <SelectItem key={u} value={u}>
                                  {u}
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
                      control={customItemForm.control}
                      name="materials"
                      render={({ field, fieldState }) => (
                        <Field
                          className="flex flex-col gap-1.5"
                          data-invalid={fieldState.invalid}>
                          <Label>Materials</Label>
                          <Input
                            placeholder="e.g. Solid Oak, Bouclé Fabric"
                            {...field}
                          />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                    <Controller
                      control={customItemForm.control}
                      name="dimensions"
                      render={({ field, fieldState }) => (
                        <Field
                          className="flex flex-col gap-1.5"
                          data-invalid={fieldState.invalid}>
                          <Label>Dimensions</Label>
                          <Input
                            placeholder='e.g. 84" W x 38" D x 32" H'
                            {...field}
                          />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                  </div>
                  <div className="mt-4">
                    <Controller
                      control={customItemForm.control}
                      name="description"
                      render={({ field, fieldState }) => (
                        <Field
                          className="flex flex-col gap-1.5"
                          data-invalid={fieldState.invalid}>
                          <Label>Sourcing & PO Description</Label>
                          <Textarea
                            placeholder="Item specifications details..."
                            className="min-h-[80px]"
                            {...field}
                          />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                  </div>
                </div>

                <div>
                  <h3 className="mb-4 border-b pb-1.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                    Financial Specifications
                  </h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="unit-cost">Unit Cost ($)</Label>
                      <Input
                        id="unit-cost"
                        type="number"
                        min="0"
                        step="0.01"
                        value={customFormData.unitCost}
                        onChange={(e) =>
                          handleUnitCostChange(Number(e.target.value))
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="markup">Markup (%)</Label>
                      <Input
                        id="markup"
                        type="number"
                        min="0"
                        step="0.1"
                        value={customFormData.markup}
                        onChange={(e) =>
                          handleMarkupChange(Number(e.target.value))
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="selling-price">Selling Price ($)</Label>
                      <Input
                        id="selling-price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={customFormData.sellingPrice}
                        onChange={(e) =>
                          handleSellingPriceChange(Number(e.target.value))
                        }
                        className="font-semibold text-primary"
                      />
                    </div>
                    <Controller
                      control={customItemForm.control}
                      name="quantity"
                      render={({ field, fieldState }) => (
                        <Field
                          className="flex flex-col gap-1.5"
                          data-invalid={fieldState.invalid}>
                          <Label htmlFor="item-qty">Quantity</Label>
                          <Input
                            id="item-qty"
                            type="number"
                            min="1"
                            value={field.value}
                            onChange={(e) =>
                              field.onChange(Number(e.target.value))
                            }
                          />
                          {fieldState.invalid && (
                            <FieldError errors={[fieldState.error]} />
                          )}
                        </Field>
                      )}
                    />
                  </div>
                </div>

                <div className="border-t pt-4">
                  <Controller
                    control={customItemForm.control}
                    name="saveToLibrary"
                    render={({ field }) => (
                      <div className="flex items-start gap-2.5">
                        <Checkbox
                          id="save-to-library"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="mt-0.5 rounded"
                        />
                        <div className="grid gap-1.5 leading-none">
                          <Label
                            htmlFor="save-to-library"
                            className="cursor-pointer select-none font-semibold text-sm">
                            Add to Global Library
                          </Label>
                          <p className="text-muted-foreground text-xs">
                            When enabled, this product will also be saved to the
                            Global Library for reuse in other projects.
                          </p>
                        </div>
                      </div>
                    )}
                  />
                </div>
              </div>

              <div className="flex shrink-0 justify-end gap-2 border-t bg-muted/10 p-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={customItemForm.formState.isSubmitting}>
                  {customItemForm.formState.isSubmitting && (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  )}
                  Add Custom Item
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
