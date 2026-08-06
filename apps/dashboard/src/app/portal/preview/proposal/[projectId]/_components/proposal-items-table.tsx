"use client";

import type { CSSProperties } from "react";

import { ShoppingBag } from "lucide-react";

import { DashboardImage } from "@/components/dashboard-image";
import {
  cellClass,
  DEFAULT_ITEM_COLUMN_VISIBILITY,
  ITEM_FIELDS,
  MIN_FLEX_TRACK,
  THUMBNAIL_SIZE,
} from "@/app/(main)/dashboard/projects/tabs/_tab_components/items-fields";
import type { ItemColumnLayout, ProjectRoomItem, Vendor } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ProposalItemsTableProps {
  items: ProjectRoomItem[];
  vendors: Vendor[];
  /** The project's persisted items grid layout (visible columns + widths). */
  layout?: ItemColumnLayout;
}

/**
 * Read-only mirror of the Project Items list-view grid. It reproduces the exact
 * columns, widths, and headers the user configured in the Items tab (from the
 * project's `itemColumnLayout`) using the shared field registry — but with none
 * of the interactivity (no drag handle, actions, or resizing). The single
 * `grid-template-columns` track string mirrors `columnTrack` in items-table.tsx:
 * a user-resized column is a fixed px width, the rest are proportional `fr`.
 */
export function ProposalItemsTable({
  items,
  vendors,
  layout,
}: ProposalItemsTableProps) {
  const visibility = {
    ...DEFAULT_ITEM_COLUMN_VISIBILITY,
    ...layout?.visibility,
  };
  const sizing = layout?.sizing ?? {};
  const visibleFields = ITEM_FIELDS.filter((field) => visibility[field.id]);

  const template = [
    `${THUMBNAIL_SIZE}px`,
    ...visibleFields.map((field) =>
      sizing[field.id] != null
        ? `${sizing[field.id]}px`
        : `minmax(${MIN_FLEX_TRACK}px, ${field.size}fr)`,
    ),
  ].join(" ");

  const gridStyle: CSSProperties = {
    gridTemplateColumns: "var(--proposal-cols)",
  };

  return (
    <div
      className="w-full overflow-x-auto"
      style={{ "--proposal-cols": template } as CSSProperties}>
      {/* Header */}
      <div
        className="grid min-w-full items-center border-border border-b"
        style={gridStyle}>
        <div aria-hidden />
        {visibleFields.map((field) => (
          <div
            key={field.id}
            className={cn(
              "flex items-center px-3 py-2 text-muted-foreground text-xs uppercase tracking-widest",
              field.align === "right" && "justify-end",
            )}>
            {field.label}
          </div>
        ))}
      </div>

      {/* Rows */}
      <div className="divide-y divide-border">
        {items.map((item) => {
          const vendor = vendors.find((v) => v.vendorId === item.vendorId);
          return (
            <div
              key={item.roomItemId}
              className="grid min-w-full items-center"
              style={gridStyle}>
              <div className={cellClass("thumbnail")}>
                <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-neutral-100">
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
              </div>
              {visibleFields.map((field) => (
                <div
                  key={field.id}
                  className={cellClass(
                    field.id,
                    field.id === "item" ? { wrap: true } : undefined,
                  )}>
                  {field.render
                    ? field.render(item, vendor)
                    : field.value(item) || "—"}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
