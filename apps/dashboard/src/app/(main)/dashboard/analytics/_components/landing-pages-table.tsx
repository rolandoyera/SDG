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
import type { LandingPageItem } from "@/server/analytics-actions";

const columns: ColumnDef<LandingPageItem>[] = [
  {
    accessorKey: "path",
    header: ({ column }) => (
      <SortableHeader column={column}>Page</SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="truncate font-medium">{row.original.path}</div>
    ),
  },
  {
    accessorKey: "sessions",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Sessions
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="text-right tabular-nums">
        {row.original.sessions.toLocaleString()}
      </div>
    ),
  },
  {
    accessorKey: "keyEvents",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Key Events
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{row.original.keyEvents}</div>
    ),
  },
  {
    accessorKey: "conversionRate",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Conv Rate
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="text-right text-muted-foreground tabular-nums">
        {`${(row.original.conversionRate * 100).toFixed(1)}%`}
      </div>
    ),
  },
];

export function LandingPagesTable({ data }: { data: LandingPageItem[] }) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  return (
    <TanTable
      table={table}
      borderTop={false}
      pagination
      noun="pages"
      emptyMessage="No landing page data available."
    />
  );
}
