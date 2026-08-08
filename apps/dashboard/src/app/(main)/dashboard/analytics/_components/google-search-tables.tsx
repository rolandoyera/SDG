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
import type {
  SearchPageItem,
  SearchQueryItem,
} from "@/server/search-console-actions";

// GSC returns full page URLs; show just the path so the table stays readable.
function toPath(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

/** The clicks/impressions/CTR/position columns shared by both tables. */
function metricColumns<
  T extends {
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  },
>(): ColumnDef<T>[] {
  return [
    {
      accessorKey: "clicks",
      header: ({ column }) => (
        <SortableHeader column={column} align="right">
          Clicks
        </SortableHeader>
      ),
      cell: ({ row }) => (
        <div className="text-right tabular-nums">
          {row.original.clicks.toLocaleString()}
        </div>
      ),
    },
    {
      accessorKey: "impressions",
      header: ({ column }) => (
        <SortableHeader column={column} align="right">
          Impr.
        </SortableHeader>
      ),
      cell: ({ row }) => (
        <div className="text-right text-muted-foreground tabular-nums">
          {row.original.impressions.toLocaleString()}
        </div>
      ),
    },
    {
      accessorKey: "ctr",
      header: ({ column }) => (
        <SortableHeader column={column} align="right">
          CTR
        </SortableHeader>
      ),
      cell: ({ row }) => (
        <div className="text-right text-muted-foreground tabular-nums">
          {`${(row.original.ctr * 100).toFixed(1)}%`}
        </div>
      ),
    },
    {
      accessorKey: "position",
      header: ({ column }) => (
        <SortableHeader column={column} align="right">
          Pos.
        </SortableHeader>
      ),
      cell: ({ row }) => (
        <div className="text-right text-muted-foreground tabular-nums">
          {row.original.position.toFixed(1)}
        </div>
      ),
    },
  ];
}

const queryColumns: ColumnDef<SearchQueryItem>[] = [
  {
    accessorKey: "query",
    header: ({ column }) => (
      <SortableHeader column={column}>Query</SortableHeader>
    ),
    cell: ({ row }) => (
      // Long queries wrap instead of stretching the table into a horizontal
      // scroll (TableCell is whitespace-nowrap by default).
      <div className="font-medium wrap-break-word whitespace-normal">
        {row.original.query}
      </div>
    ),
  },
  ...metricColumns<SearchQueryItem>(),
];

const pageColumns: ColumnDef<SearchPageItem>[] = [
  {
    accessorKey: "page",
    header: ({ column }) => (
      <SortableHeader column={column}>Page</SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="font-medium wrap-break-word whitespace-normal">
        {toPath(row.original.page)}
      </div>
    ),
  },
  ...metricColumns<SearchPageItem>(),
];

export function SearchQueriesTable({ data }: { data: SearchQueryItem[] }) {
  const table = useReactTable({
    data,
    columns: queryColumns,
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
      noun="queries"
      emptyMessage="No query data available for this range."
    />
  );
}

export function SearchPagesTable({ data }: { data: SearchPageItem[] }) {
  const table = useReactTable({
    data,
    columns: pageColumns,
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
      emptyMessage="No page data available for this range."
    />
  );
}
