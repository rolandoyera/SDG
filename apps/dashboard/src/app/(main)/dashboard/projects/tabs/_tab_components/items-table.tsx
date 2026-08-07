"use client";
"use no memo";

import type { CSSProperties } from "react";

import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type {
  Column,
  ColumnDef,
  ColumnSizingState,
  OnChangeFn,
  Row,
  VisibilityState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { GripVertical, Pencil, ShoppingBag, Trash2 } from "lucide-react";

import { DashboardImage } from "@/components/dashboard-image";
import { Button } from "@/components/ui/button";
import type { ProjectRoomItem, Vendor } from "@/lib/types";
import { cn } from "@/lib/utils";

import {
  cellClass,
  FIELD_BY_ID,
  ITEM_FIELDS,
  MIN_FLEX_TRACK,
  THUMBNAIL_SIZE,
} from "./items-fields";

// The column registry lives in items-fields.tsx (shared, TanStack/dnd-free) so
// read-only consumers can mirror the same columns. Re-export the layout consts
// so existing importers of this module keep working.
export {
  DEFAULT_ITEM_COLUMN_VISIBILITY,
  ITEM_COLUMN_OPTIONS,
} from "./items-fields";

// Structural (non-field) column widths.
const ACTIONS_SIZE = 96;
/** Width of the leading drag-handle track. */
const GRIP_TRACK = "2rem";
/** Columns that are always a fixed pixel width (never flex). */
const FIXED_TRACK_IDS = new Set(["thumbnail", "actions"]);

// A single grid track. Defaults are proportional (`fr`) so the grid fills the
// container width on load and adapts to any screen — no per-screen pixel
// guessing. A column the user has explicitly resized switches to a fixed `px`
// width; the remaining `fr` columns absorb the slack so the table still spans
// the full width. Structural columns are always fixed.
function columnTrack(
  column: Column<ProjectRoomItem>,
  columnSizing: ColumnSizingState,
): string {
  if (FIXED_TRACK_IDS.has(column.id)) return `${column.getSize()}px`;
  if (columnSizing[column.id] != null) return `${column.getSize()}px`;
  const weight = FIELD_BY_ID.get(column.id)?.size ?? 120;
  return `minmax(${MIN_FLEX_TRACK}px, ${weight}fr)`;
}

// ----------------------------------------------------
// Column definitions
// ----------------------------------------------------

function buildColumns(
  vendors: Vendor[],
  onEditItem: (item: ProjectRoomItem) => void,
  onDeleteItem: (item: ProjectRoomItem) => void,
): ColumnDef<ProjectRoomItem>[] {
  const thumbnail: ColumnDef<ProjectRoomItem> = {
    id: "thumbnail",
    header: () => null,
    enableHiding: false,
    enableResizing: false,
    size: THUMBNAIL_SIZE,
    cell: ({ row }) => {
      const item = row.original;
      return (
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
      );
    },
  };

  const fieldColumns: ColumnDef<ProjectRoomItem>[] = ITEM_FIELDS.map(
    (field) => ({
      id: field.id,
      header: () => field.label,
      size: field.size,
      minSize: 60,
      cell: ({ row }) => {
        const item = row.original;
        if (field.render) {
          const vendor = vendors.find((v) => v.vendorId === item.vendorId);
          return field.render(item, vendor);
        }
        return field.value(item) || "—";
      },
    }),
  );

  const actions: ColumnDef<ProjectRoomItem> = {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    enableHiding: false,
    enableResizing: false,
    size: ACTIONS_SIZE,
    cell: ({ row }) => {
      const item = row.original;
      return (
        <div className="flex w-full items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => onEditItem(item)}
          >
            <Pencil className="size-4" />
            <span className="sr-only">Edit item</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-destructive"
            onClick={() => onDeleteItem(item)}
          >
            <Trash2 className="size-4" />
            <span className="sr-only">Delete item</span>
          </Button>
        </div>
      );
    },
  };

  return [thumbnail, ...fieldColumns, actions];
}

// ----------------------------------------------------
// Rows
// ----------------------------------------------------

/** A draggable grid row: the grip handle drives the reorder, cells follow. */
function SortableItemRow({ row }: { row: Row<ProjectRoomItem> }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.original.roomItemId });

  const style: CSSProperties = {
    gridTemplateColumns: "var(--items-cols)",
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "grid min-w-full items-center transition-colors hover:bg-muted/20",
        isDragging &&
          "relative z-10 bg-white! shadow-[0_12px_30px_rgba(60,50,40,0.15)] dark:bg-white/20!",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex h-full cursor-grab touch-none items-center justify-center text-muted-foreground/30 hover:text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
        <span className="sr-only">Drag to reorder</span>
      </div>
      {row.getVisibleCells().map((cell) => (
        <div key={cell.id} className={cellClass(cell.column.id)}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </div>
      ))}
    </div>
  );
}

// ----------------------------------------------------
// Grid
// ----------------------------------------------------

interface ItemsTableProps {
  items: ProjectRoomItem[];
  vendors: Vendor[];
  /** Controlled column visibility shared across every section's grid. */
  columnVisibility: VisibilityState;
  /** Controlled column widths shared across every section's grid. */
  columnSizing: ColumnSizingState;
  /** Receives resize updates so the parent can persist + broadcast widths. */
  onColumnSizingChange: OnChangeFn<ColumnSizingState>;
  onEditItem: (item: ProjectRoomItem) => void;
  onDeleteItem: (item: ProjectRoomItem) => void;
}

/**
 * The list-view grid for a single section's items. A TanStack-powered, CSS-grid
 * renderer (not a `<table>`): widths live in one `grid-template-columns` string,
 * so columns are resizable and never fight the layout. Rows reorder by dragging
 * the grip handle, and can be dragged across sections — the surrounding
 * `DndContext` (owned by the parent) spans every section. Visibility and widths
 * are controlled by the parent so one picker + one set of widths drive every
 * section consistently.
 */
export function ItemsTable({
  items,
  vendors,
  columnVisibility,
  columnSizing,
  onColumnSizingChange,
  onEditItem,
  onDeleteItem,
}: ItemsTableProps) {
  const columns = buildColumns(vendors, onEditItem, onDeleteItem);

  const table = useReactTable({
    data: items,
    columns,
    state: { columnVisibility, columnSizing },
    onColumnSizingChange,
    columnResizeMode: "onChange",
    getRowId: (row) => row.roomItemId,
    getCoreRowModel: getCoreRowModel(),
  });

  // One declarative track list: the grip, then every visible column's track.
  const template = [
    GRIP_TRACK,
    ...table
      .getVisibleLeafColumns()
      .map((col) => columnTrack(col, columnSizing)),
  ].join(" ");

  return (
    <div
      className="w-full overflow-x-auto"
      style={{ "--items-cols": template } as CSSProperties}
    >
      <div
        className="grid min-w-full items-center border-b"
        style={{ gridTemplateColumns: "var(--items-cols)" }}
      >
        <div aria-hidden />
        {table.getHeaderGroups()[0]?.headers.map((header) => {
          const field = FIELD_BY_ID.get(header.column.id);
          return (
            <div
              key={header.id}
              className={cn(
                "relative flex items-center px-3 py-2 text-muted-foreground text-xs uppercase tracking-widest",
                field?.align === "right" && "justify-end",
              )}
            >
              {header.isPlaceholder
                ? null
                : flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
              {header.column.getCanResize() && (
                <button
                  type="button"
                  aria-label="Resize column"
                  onMouseDown={header.getResizeHandler()}
                  onTouchStart={header.getResizeHandler()}
                  onClick={(event) => event.stopPropagation()}
                  className="group/resize absolute top-0 right-0 z-10 flex h-full w-3 cursor-col-resize touch-none select-none items-center justify-center"
                >
                  <span
                    className={cn(
                      "h-1/2 w-px bg-border transition-all group-hover/resize:h-full group-hover/resize:w-0.5 group-hover/resize:bg-primary",
                      header.column.getIsResizing() &&
                        "h-full w-0.5 bg-primary",
                    )}
                  />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <SortableContext
        items={items.map((item) => item.roomItemId)}
        strategy={verticalListSortingStrategy}
      >
        <div className="divide-y">
          {table.getRowModel().rows.map((row) => (
            <SortableItemRow key={row.id} row={row} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}
