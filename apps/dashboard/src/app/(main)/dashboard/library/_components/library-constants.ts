import { z } from "zod";

import type { LibraryItem } from "@/lib/types";

export const COST_TYPES = ["Product", "Service", "Labor", "Shipping"] as const;
export const UNIT_TYPES = ["Each", "SF", "LF", "Yard", "Pieces"] as const;

/** Maximum images allowed on a library item (gallery slots, upload cap, AI fill). */
export const MAX_IMAGES = 6;

export const libraryItemSchema = z.object({
  name: z.string().min(1, "Item name is required."),
  costType: z.enum(COST_TYPES, { error: "Please choose a cost type." }),
  category: z.string().min(1, "Please choose a category."),
  subcategory: z.string().optional(),
  vendorId: z.string().min(1, "Please select a vendor."),
  unitType: z.enum(UNIT_TYPES, { error: "Please choose a unit type." }),
  sku: z.string().optional(),
  description: z.string().optional(),
  poDescription: z.string().optional(),
  finishColor: z.string().optional(),
  sourcingLink: z.string().optional(),
  manufacturer: z.string().optional(),
  materials: z.string().optional(),
  dimensions: z.string().optional(),
  internalNote: z.string().optional(),
  taxable: z.boolean(),
  unitCost: z.number(),
  msrp: z.number().optional(),
  markup: z.number(),
  sellingPrice: z.number(),
  imageUrls: z.array(z.string()).optional(),
  manualImageUrls: z.array(z.string()).optional(),
  coverImageUrl: z.string().optional(),
  coverImagePath: z.string().optional(),
  images: z.array(z.object({ url: z.string(), path: z.string() })).optional(),
  specSheet: z.object({ url: z.string(), path: z.string() }).optional(),
  aiMetadata: z.any().optional(),
});
export const CATEGORIES = [
  "Furniture",
  "Lighting",
  "Kitchen",
  "Bath",
  "Surfaces",
  "Fabrics & Textiles",
  "Finishes",
  "Doors & Windows",
  "Decor",
  "Outdoor",
  "Construction Materials",
  "Equipment",
  "Other",
];

export const SUBCATEGORIES: Record<string, string[]> = {
  Furniture: [
    "Tables",
    "Seating",
    "Beds",
    "Casegoods",
    "Children's",
    "Custom Furniture",
    "Other",
  ],
  Lighting: [
    "Ceiling Lights",
    "Wall Lights",
    "Floor Lamps",
    "Table Lamps",
    "Track Lighting",
    "Recessed Lighting",
    "Accent Lighting",
    "Other",
  ],
  Kitchen: [
    "Cabinets",
    "Sinks",
    "Faucets",
    "Countertops",
    "Hardware",
    "Appliances",
    "Accessories",
    "Other",
  ],
  Bath: [
    "Cabinets",
    "Vanities",
    "Sinks",
    "Faucets",
    "Showers",
    "Tubs",
    "Toilets",
    "Mirrors",
    "Hardware",
    "Accessories",
    "Other",
  ],
  Surfaces: [
    "Stone",
    "Tile",
    "Wood Flooring",
    "Concrete",
    "Wall Coverings",
    "Glass",
    "Other",
  ],
  "Fabrics & Textiles": [
    "Upholstery Fabrics",
    "Leather",
    "Wallpaper",
    "Rugs & Carpeting",
    "Bedding & Linens",
    "Towels & Bath Linens",
    "Other",
  ],
  Finishes: [
    "Paint & Stain",
    "Metal Finish",
    "Wood Finish",
    "Specialty Finish",
    "Other",
  ],
  "Doors & Windows": [
    "Doors",
    "Windows",
    "Hardware",
    "Window Treatments",
    "Other",
  ],
  Decor: ["Art", "Mirrors", "Planters", "Vases", "Rugs", "Other"],
  Outdoor: [
    "Furniture",
    "Lighting",
    "Kitchen",
    "Structures",
    "Planters",
    "Other",
  ],
  "Construction Materials": [
    "Lumber",
    "Drywall",
    "Concrete",
    "Insulation",
    "Roofing",
    "Siding",
    "Windows",
    "Doors",
    "Other",
  ],
  Equipment: ["Tools", "Machinery", "Vehicles", "Other"],
  Other: ["Other"],
};

/** Shape of the shared Add/Edit library item form (everything persisted except server-managed keys). */
export type LibraryItemFormData = z.infer<typeof libraryItemSchema>;

/** Pristine form values used when creating a new item or resetting the form. */
export const EMPTY_LIBRARY_ITEM_FORM: LibraryItemFormData = {
  costType: "Product" as LibraryItemFormData["costType"],
  name: "",
  category: "",
  subcategory: "",
  vendorId: "",
  sku: "",
  description: "",
  poDescription: "",
  unitType: "" as LibraryItemFormData["unitType"],
  finishColor: "",
  sourcingLink: "",
  manufacturer: "",
  materials: "",
  dimensions: "",
  internalNote: "",
  taxable: true,
  unitCost: 0,
  markup: 20,
  msrp: 0,
  sellingPrice: 0,
  imageUrls: [],
  manualImageUrls: [],
  coverImageUrl: "",
  coverImagePath: "",
  images: [],
  specSheet: undefined,
  aiMetadata: undefined,
};

/** Map an existing library item onto the editable form shape. */
export function libraryItemToForm(item: LibraryItem): LibraryItemFormData {
  return {
    costType: item.costType,
    name: item.name,
    category: item.category,
    subcategory: item.subcategory ?? "",
    vendorId: item.vendorId ?? "",
    sku: item.sku ?? "",
    description: item.description ?? "",
    poDescription: item.poDescription ?? "",
    unitType: item.unitType,
    finishColor: item.finishColor ?? "",
    sourcingLink: item.sourcingLink ?? "",
    manufacturer: item.manufacturer ?? "",
    materials: item.materials ?? "",
    dimensions: item.dimensions ?? "",
    internalNote: item.internalNote ?? "",
    taxable: item.taxable,
    unitCost: item.unitCost,
    markup: item.markup,
    msrp: item.msrp ?? 0,
    sellingPrice: item.sellingPrice,
    imageUrls: item.imageUrls ?? [],
    manualImageUrls: item.manualImageUrls ?? [],
    coverImageUrl: item.coverImageUrl ?? "",
    coverImagePath: item.coverImagePath ?? "",
    images: item.images ?? [],
    specSheet: item.specSheet,
    aiMetadata: item.aiMetadata,
  };
}

/** Normalize a user-entered URL so it always carries a protocol. */
export function withProtocol(url: string): string {
  return url.startsWith("http") ? url : `https://${url}`;
}
