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
import type { ConversionsData } from "@/server/analytics-actions";

type ChannelLeadRow = ConversionsData["channels"][number];

const columns: ColumnDef<ChannelLeadRow>[] = [
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
    id: "convRate",
    accessorFn: (row) => (row.sessions > 0 ? row.keyEvents / row.sessions : 0),
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Conv Rate
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="text-right text-muted-foreground tabular-nums">
        {row.original.sessions > 0
          ? `${((row.original.keyEvents / row.original.sessions) * 100).toFixed(1)}%`
          : "0.0%"}
      </div>
    ),
  },
];

export function LeadsByChannelTable({ data }: { data: ChannelLeadRow[] }) {
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
      noun="channels"
      emptyMessage="No channel data available for this range."
    />
  );
}
