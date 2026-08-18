import type { ReactNode } from "react";

import type { VisibilityState } from "@tanstack/react-table";

import type { ItemColumnLayout, ProjectRoomItem, Vendor } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

// ----------------------------------------------------
// Field registry — the single source of truth for the items grid. Each entry
// becomes a TanStack column (in items-table.tsx), a column-picker option, and a
// default-visibility flag, so the three never drift apart. It is intentionally
// free of TanStack/dnd imports so read-only consumers (e.g. the proposal
// document) can mirror the same columns/widths/headers without pulling in the
// interactive table. Rendering is a CSS grid (not a <table>) so column widths are
// one declarative `grid-template-columns` string and become trivially resizable.
// ----------------------------------------------------

export interface ItemFieldDef {
  id: string;
  label: string;
  defaultVisible: boolean;
  /** Default column width in px (user-resizable, persisted by the parent). */
  size: number;
  /** Sort/accessor value; also used as the fallback display value. */
  value: (item: ProjectRoomItem) => string | number;
  /** Custom cell renderer; defaults to `value` (or "—" when empty). */
  render?: (item: ProjectRoomItem, vendor?: Vendor) => ReactNode;
  /** Right-align the header + cells (numeric columns). */
  align?: "right";
  /** Allow the cell text to wrap instead of truncating. */
  wrap?: boolean;
  /** Render the cell value in a monospace face. */
  mono?: boolean;
  /** Extra cell classes (e.g. emphasis on Total). */
  cellClassName?: string;
}

export const ITEM_FIELDS: ItemFieldDef[] = [
  {
    id: "item",
    label: "Item",
    defaultVisible: true,
    size: 200,
    cellClassName: "font-semibold text-foreground text-sm",
    value: (item) => item.name,
  },
  {
    id: "sku",
    label: "SKU",
    defaultVisible: false,
    size: 120,
    mono: true,
    value: (item) => item.sku ?? "",
  },
  {
    id: "category",
    label: "Category",
    defaultVisible: false,
    size: 130,
    value: (item) => item.category ?? "",
  },
  {
    id: "subcategory",
    label: "Subcategory",
    defaultVisible: false,
    size: 140,
    value: (item) => item.subcategory ?? "",
  },
  {
    id: "materials",
    label: "Materials",
    defaultVisible: true,
    size: 190,
    wrap: true,
    value: (item) => item.materials ?? "",
  },
  {
    id: "finishColor",
    label: "Color",
    defaultVisible: true,
    size: 140,
    value: (item) => item.finishColor ?? "",
  },
  {
    id: "manufacturer",
    label: "MFR",
    defaultVisible: false,
    size: 140,
    value: (item) => item.manufacturer ?? "",
  },
  {
    id: "description",
    label: "Description",
    defaultVisible: true,
    size: 320,
    wrap: true,
    value: (item) => item.description ?? "",
  },
  {
    id: "poDescription",
    label: "PO Description",
    defaultVisible: false,
    size: 200,
    wrap: true,
    value: (item) => item.poDescription ?? "",
  },
  {
    id: "internalNote",
    label: "Internal Note",
    defaultVisible: false,
    size: 200,
    wrap: true,
    value: (item) => item.internalNote ?? "",
  },
  {
    id: "dimensions",
    label: "Dimensions",
    defaultVisible: true,
    size: 180,
    value: (item) => item.dimensions ?? "",
  },
  {
    id: "unitType",
    label: "Unit",
    defaultVisible: true,
    size: 90,
    value: (item) => item.unitType,
  },
  {
    id: "costType",
    label: "Cost Type",
    defaultVisible: false,
    size: 110,
    value: (item) => item.costType,
  },
  {
    id: "tags",
    label: "Tags",
    defaultVisible: false,
    size: 140,
    wrap: true,
    value: (item) => (item.tags?.length ? item.tags.join(", ") : ""),
  },
  {
    id: "taxable",
    label: "Taxable",
    defaultVisible: false,
    size: 90,
    value: (item) => (item.taxable ? "Yes" : "No"),
  },
  {
    id: "unitCost",
    label: "Unit Cost",
    defaultVisible: false,
    size: 110,
    align: "right",
    value: (item) => item.unitCost,
    render: (item) => formatCurrency(item.unitCost),
  },
  {
    id: "markup",
    label: "Markup %",
    defaultVisible: false,
    size: 100,
    align: "right",
    value: (item) => item.markup,
    render: (item) => `${item.markup}%`,
  },
  {
    id: "msrp",
    label: "MSRP",
    defaultVisible: false,
    size: 110,
    align: "right",
    value: (item) => item.msrp ?? 0,
    render: (item) => (item.msrp ? formatCurrency(item.msrp) : "—"),
  },
  {
    id: "quantity",
    label: "Qty",
    defaultVisible: true,
    size: 70,
    align: "right",
    value: (item) => item.quantity,
  },
  {
    id: "sellingPrice",
    label: "Price",
    defaultVisible: true,
    size: 110,
    align: "right",
    value: (item) => item.sellingPrice,
    render: (item) => formatCurrency(item.sellingPrice),
  },
  {
    id: "total",
    label: "Total",
    defaultVisible: true,
    size: 120,
    align: "right",
    cellClassName: "font-semibold text-primary",
    value: (item) => item.sellingPrice * item.quantity,
    render: (item) => formatCurrency(item.sellingPrice * item.quantity),
  },
];

/** Column-picker options (toggleable fields only — thumbnail/actions excluded). */
export const ITEM_COLUMN_OPTIONS = ITEM_FIELDS.map((f) => ({
  id: f.id,
  label: f.label,
}));

/** Default visibility map, derived from each field's `defaultVisible`. */
export const DEFAULT_ITEM_COLUMN_VISIBILITY: VisibilityState =
  Object.fromEntries(ITEM_FIELDS.map((f) => [f.id, f.defaultVisible]));

/** Field lookup by column id. */
export const FIELD_BY_ID = new Map(ITEM_FIELDS.map((f) => [f.id, f]));

/**
 * The layout as the UI holds it: visibility always carries every field id
 * (defaults filled in), sizing defaults to empty. Both a stored layout and the
 * live grid state normalize to the same shape, so they can be compared.
 */
export function normalizeItemColumnLayout(
  layout?: Partial<ItemColumnLayout> | null,
): ItemColumnLayout {
  return {
    visibility: {
      ...DEFAULT_ITEM_COLUMN_VISIBILITY,
      ...(layout?.visibility ?? {}),
    } as Record<string, boolean>,
    sizing: layout?.sizing ?? {},
  };
}

/**
 * Stable identity for a layout, used to tell "same layout" from "actually
 * changed" on both the save and the snapshot side.
 *
 * Key order must not matter: Firestore stores map fields **sorted by key**, so a
 * layout read back never matches the insertion order it was written in. Plain
 * `JSON.stringify` comparison therefore reports every round-trip as a change,
 * which loops snapshot -> setState -> save -> snapshot forever. (The emulator
 * preserves insertion order, so this only ever bites in production.)
 */
export function itemColumnLayoutKey(
  layout?: Partial<ItemColumnLayout> | null,
): string {
  const { visibility, sizing } = normalizeItemColumnLayout(layout);
  const entries = (map: Record<string, boolean | number>) =>
    Object.keys(map)
      .sort()
      .map((key) => `${key}:${map[key]}`)
      .join(",");
  return `v[${entries(visibility)}]s[${entries(sizing)}]`;
}

/** Leading thumbnail track width in px. */
export const THUMBNAIL_SIZE = 56;
/** Floor a flexible column may shrink to before the grid scrolls horizontally. */
export const MIN_FLEX_TRACK = 60;

/** Body-cell class for a given column. `wrap` overrides the field's own setting. */
export function cellClass(columnId: string, opts?: { wrap?: boolean }): string {
  if (columnId === "thumbnail" || columnId === "actions") {
    return "flex items-center px-3 py-3";
  }
  const field = FIELD_BY_ID.get(columnId);
  const wrap = opts?.wrap ?? field?.wrap;
  return cn(
    "min-w-0 px-3 py-3 text-muted-foreground text-xs",
    wrap ? "whitespace-normal break-words" : "truncate",
    field?.align === "right" && "text-right",
    field?.mono && "font-mono",
    field?.cellClassName,
  );
}
