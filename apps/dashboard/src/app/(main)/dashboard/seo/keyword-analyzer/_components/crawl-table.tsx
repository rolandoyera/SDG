"use client";
"use no memo";

import { useMemo } from "react";

import type { ColumnDef } from "@tanstack/react-table";
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { SortableHeader, TanTable } from "@/components/ui/tan-table";
import { cn } from "@/lib/utils";
import type { PageAnalysis } from "@/server/seo-actions";

interface CrawlRow {
  path: string;
  words: number;
  unique: number;
  titleLength: number;
  metaLength: number;
  h1Count: number;
  imageCount: number;
  missingAltCount: number;
  linkCount: number;
  analysis: PageAnalysis;
}

const columns: ColumnDef<CrawlRow>[] = [
  {
    accessorKey: "path",
    header: ({ column }) => (
      <SortableHeader column={column}>Page</SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="max-w-72 truncate font-medium">{row.original.path}</div>
    ),
  },
  {
    accessorKey: "words",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Words
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="text-right tabular-nums">
        {row.original.words.toLocaleString()}
      </div>
    ),
  },
  {
    accessorKey: "unique",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Unique
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="text-right text-muted-foreground tabular-nums">
        {row.original.unique.toLocaleString()}
      </div>
    ),
  },
  {
    accessorKey: "titleLength",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Title
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div
        className={cn(
          "text-right tabular-nums",
          row.original.titleLength === 0
            ? "text-destructive"
            : "text-muted-foreground",
        )}
      >
        {row.original.titleLength}
      </div>
    ),
  },
  {
    accessorKey: "metaLength",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Meta
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div
        className={cn(
          "text-right tabular-nums",
          row.original.metaLength === 0
            ? "text-destructive"
            : "text-muted-foreground",
        )}
      >
        {row.original.metaLength}
      </div>
    ),
  },
  {
    accessorKey: "h1Count",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        H1
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div
        className={cn(
          "text-right tabular-nums",
          row.original.h1Count === 1
            ? "text-muted-foreground"
            : "text-destructive",
        )}
      >
        {row.original.h1Count}
      </div>
    ),
  },
  {
    accessorKey: "imageCount",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Images
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="text-right text-muted-foreground tabular-nums">
        {row.original.imageCount}
      </div>
    ),
  },
  {
    accessorKey: "missingAltCount",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        No Alt
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div
        className={cn(
          "text-right tabular-nums",
          row.original.missingAltCount > 0
            ? "text-destructive"
            : "text-muted-foreground",
        )}
      >
        {row.original.missingAltCount}
      </div>
    ),
  },
  {
    accessorKey: "linkCount",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Links
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="text-right text-muted-foreground tabular-nums">
        {row.original.linkCount}
      </div>
    ),
  },
];

export function CrawlTable({
  pages,
  onSelectPage,
}: {
  pages: PageAnalysis[];
  onSelectPage: (page: PageAnalysis) => void;
}) {
  // Memoized so the array identity only changes with `pages` — an unstable
  // `data` reference makes TanStack's autoResetPageIndex effect fire after
  // every render, which loops forever (hangs the tab) on pagination changes.
  const data: CrawlRow[] = useMemo(
    () =>
      pages.map((page) => ({
        path: page.path,
        words: page.scopes.all.words,
        unique: page.scopes.all.unique,
        titleLength: page.title.length,
        metaLength: page.metaDescription.length,
        h1Count: page.h1s.length,
        imageCount: page.imageCount,
        missingAltCount: page.missingAltCount,
        linkCount: page.linkCount,
        analysis: page,
      })),
    [pages],
  );

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
      emptyMessage="No pages crawled."
      onRowClick={(row) => onSelectPage(row.analysis)}
    />
  );
}
