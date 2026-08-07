"use client";
"use no memo";

import type { ColumnDef } from "@tanstack/react-table";
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { SortableHeader, TanTable } from "@/components/ui/tan-table";

export interface GeoTableRow {
  /** Display name (e.g. a city or country). */
  label: string;
  /** Numeric metric for the row. */
  value: number;
  /** Country code for a flag in the left gutter (e.g. "US"); omit for none. */
  flagCode?: string;
}

// Fixed flag gutter so labels stay aligned even when a row has no flag (e.g. Unknown).
const FLAG_WIDTH = 21;
const FLAG_HEIGHT = 14;

/**
 * Ranked list of geo rows (flag, label, value, share) on the shared TanTable —
 * sortable headers plus the standard 10-per-page pagination footer.
 */
export function GeoTable({
  rows,
  labelHeader,
  valueHeader = "Visitors",
  emptyMessage = "No data for this range.",
}: {
  rows: GeoTableRow[];
  labelHeader: string;
  valueHeader?: string;
  emptyMessage?: string;
}) {
  const total = rows.reduce((sum, r) => sum + r.value, 0);

  const columns: ColumnDef<GeoTableRow>[] = [
    {
      accessorKey: "label",
      header: ({ column }) => (
        <SortableHeader column={column}>{labelHeader}</SortableHeader>
      ),
      cell: ({ row }) => (
        <span className="flex items-center gap-2.5 font-medium text-foreground">
          <span
            aria-hidden="true"
            className={
              row.original.flagCode
                ? `flag:${row.original.flagCode} shrink-0 rounded-xs ring-1 ring-foreground/5`
                : "shrink-0"
            }
            style={{ height: FLAG_HEIGHT, width: FLAG_WIDTH }}
          />
          {row.original.label}
        </span>
      ),
    },
    {
      accessorKey: "value",
      header: ({ column }) => (
        <SortableHeader column={column} align="right">
          {valueHeader}
        </SortableHeader>
      ),
      cell: ({ row }) => (
        <div className="text-right tabular-nums text-foreground">
          {row.original.value.toLocaleString()}
        </div>
      ),
    },
    {
      id: "share",
      accessorKey: "value",
      header: ({ column }) => (
        <SortableHeader column={column} align="right">
          %
        </SortableHeader>
      ),
      cell: ({ row }) => (
        <div className="text-right text-muted-foreground tabular-nums">
          {total > 0
            ? `${Math.round((row.original.value / total) * 100)}%`
            : "0%"}
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      sorting: [{ id: "value", desc: true }],
      pagination: { pageSize: 10 },
    },
  });

  return (
    <TanTable
      table={table}
      borderTop={false}
      pagination
      noun="rows"
      emptyMessage={emptyMessage}
    />
  );
}
