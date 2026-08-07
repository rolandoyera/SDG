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
import type { ChannelRow, SourceMediumRow } from "@/server/analytics-actions";

const channelColumns: ColumnDef<ChannelRow>[] = [
  {
    accessorKey: "channel",
    header: ({ column }) => (
      <SortableHeader column={column}>Channel</SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="font-medium">{row.original.channel}</div>
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
    accessorKey: "users",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Users
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="text-right text-muted-foreground tabular-nums">
        {row.original.users.toLocaleString()}
      </div>
    ),
  },
  {
    accessorKey: "engagementRate",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Engagement
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="text-right text-muted-foreground tabular-nums">
        {`${(row.original.engagementRate * 100).toFixed(1)}%`}
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
];

const sourceMediumColumns: ColumnDef<SourceMediumRow>[] = [
  {
    accessorKey: "source",
    header: ({ column }) => (
      <SortableHeader column={column}>Source</SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="truncate font-medium">{row.original.source}</div>
    ),
  },
  {
    accessorKey: "medium",
    header: ({ column }) => (
      <SortableHeader column={column}>Medium</SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="text-muted-foreground">{row.original.medium}</div>
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
];

export function ChannelsTable({ data }: { data: ChannelRow[] }) {
  const table = useReactTable({
    data,
    columns: channelColumns,
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
      noun="channels"
      emptyMessage="No channel data available for this range."
    />
  );
}

export function SourceMediumTable({ data }: { data: SourceMediumRow[] }) {
  const table = useReactTable({
    data,
    columns: sourceMediumColumns,
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
      noun="sources"
      emptyMessage="No source/medium data available for this range."
    />
  );
}
