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
import type {
  DuplicatePhraseFinding,
  PageAnalysis,
} from "@/server/seo-actions";

import { SIGNIFICANT_DUPLICATE_PERCENT } from "./site-checks";

interface CrawlRow {
  path: string;
  words: number;
  duplicateRatio: number;
  titleLength: number;
  metaLength: number;
  h1Count: number;
  imageCount: number;
  missingAltCount: number;
  linkCount: number;
  inboundCount: number;
  /** Zero inbound links AND a crawl complete enough for that to mean orphaned. */
  flagOrphan: boolean;
  analysis: PageAnalysis;
}

const columns: ColumnDef<CrawlRow>[] = [
  {
    accessorKey: "path",
    header: ({ column }) => (
      <SortableHeader column={column}>Page</SortableHeader>
    ),
    cell: ({ row }) => (
      // The cap is what decides where a path wraps, not the wrap rules — it
      // only stops one long slug from squeezing the numeric columns.
      <div className="max-w-140 wrap-break-word whitespace-normal font-medium">
        {row.original.path}
      </div>
    ),
  },
  {
    accessorKey: "words",
    header: ({ column }) => (
      <SortableHeader column={column} align="right" className="h-auto">
        <span className="flex flex-col items-center">
          Words
          <span className="text-xs">(Count)</span>
        </span>
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="text-right tabular-nums">
        {row.original.words.toLocaleString()}
      </div>
    ),
  },
  {
    accessorKey: "duplicateRatio",
    header: ({ column }) => (
      <SortableHeader column={column} align="right" className="h-auto">
        <span className="flex flex-col items-center">
          Duplicate
          <span className="text-xs">(Content)</span>
        </span>
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const pct = Math.round(row.original.duplicateRatio * 100);
      if (pct <= SIGNIFICANT_DUPLICATE_PERCENT) {
        return <div className="text-right text-muted-foreground">–</div>;
      }
      return (
        <div
          className={cn(
            "text-right tabular-nums",
            pct >= 20 ? "text-destructive" : "text-muted-foreground",
          )}>
          {pct}%
        </div>
      );
    },
  },
  {
    accessorKey: "titleLength",
    // Two explicit lines rather than a wrap: the label is far wider than the
    // count under it, and letting it wrap puts the break wherever the column
    // width lands instead of between the name and its unit.
    header: ({ column }) => (
      <SortableHeader column={column} align="right" className="h-auto">
        <span className="flex flex-col items-center">
          Meta Title
          <span className="text-xs">(Chars)</span>
        </span>
      </SortableHeader>
    ),
    meta: { headClassName: "w-fit" },
    cell: ({ row }) => (
      <div
        className={cn(
          "text-right tabular-nums",
          row.original.titleLength === 0
            ? "text-destructive"
            : "text-muted-foreground",
        )}>
        {row.original.titleLength}
      </div>
    ),
  },
  {
    accessorKey: "metaLength",
    header: ({ column }) => (
      <SortableHeader column={column} align="right" className="h-auto">
        <span className="flex flex-col items-center">
          Meta Desc
          <span className="text-xs">(Chars)</span>
        </span>
      </SortableHeader>
    ),
    meta: { headClassName: "w-fit" },
    cell: ({ row }) => (
      <div
        className={cn(
          "text-right tabular-nums",
          row.original.metaLength === 0
            ? "text-destructive"
            : "text-muted-foreground",
        )}>
        {row.original.metaLength}
      </div>
    ),
  },
  {
    accessorKey: "h1Count",
    header: ({ column }) => (
      <SortableHeader column={column} align="right" className="h-auto">
        <span className="flex flex-col items-center">
          H1
          <span className="text-xs">(Min 1, Max 1)</span>
        </span>
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div
        className={cn(
          "text-right tabular-nums",
          row.original.h1Count === 1
            ? "text-muted-foreground"
            : "text-destructive",
        )}>
        {row.original.h1Count}
      </div>
    ),
  },
  {
    accessorKey: "imageCount",
    header: ({ column }) => (
      <SortableHeader column={column} align="right" className="h-auto">
        <span className="flex flex-col items-center">
          Images
          <span className="text-xs">(Count)</span>
        </span>
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
      <SortableHeader column={column} align="right" className="h-auto">
        <span className="flex flex-col items-center">
          No Alt Text
          <span className="text-xs">(Count)</span>
        </span>
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div
        className={cn(
          "text-right tabular-nums",
          row.original.missingAltCount > 0
            ? "text-destructive"
            : "text-muted-foreground",
        )}>
        {row.original.missingAltCount}
      </div>
    ),
  },
  {
    accessorKey: "linkCount",
    header: ({ column }) => (
      <SortableHeader column={column} align="right" className="h-auto">
        <span className="flex flex-col items-center">
          Links
          <span className="text-xs">(Count)</span>
        </span>
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="text-right text-muted-foreground tabular-nums">
        {row.original.linkCount}
      </div>
    ),
  },
  {
    accessorKey: "inboundCount",
    header: ({ column }) => (
      <SortableHeader column={column} align="right" className="h-auto">
        <span className="flex flex-col items-center">
          Inbound
          <span className="text-xs">(Pages)</span>
        </span>
      </SortableHeader>
    ),
    // A flagged 0 is an orphan: in the sitemap, but nothing on the site links
    // to it. Said out loud on hover — a bare red zero doesn't explain itself.
    // On a partial crawl the count still shows, but unflagged: zero inbound
    // links across 100 of 209 pages isn't evidence of anything.
    cell: ({ row }) => (
      <div
        title={
          row.original.flagOrphan
            ? "Orphan — this page is in the sitemap, but no other crawled page links to it"
            : undefined
        }
        className={cn(
          "text-right tabular-nums",
          row.original.flagOrphan
            ? "text-destructive"
            : "text-muted-foreground",
        )}>
        {row.original.inboundCount}
      </div>
    ),
  },
];

export function CrawlTable({
  pages,
  duplicatePhrases,
  inboundLinks,
  flagOrphans,
  onSelectPage,
}: {
  pages: PageAnalysis[];
  duplicatePhrases: DuplicatePhraseFinding[];
  inboundLinks: Record<string, number>;
  /** False when the crawl was partial, so a zero inbound count proves nothing. */
  flagOrphans: boolean;
  onSelectPage: (page: PageAnalysis) => void;
}) {
  // Memoized so the array identity only changes with its inputs — an unstable
  // `data` reference makes TanStack's autoResetPageIndex effect fire after
  // every render, which loops forever (hangs the tab) on pagination changes.
  const data: CrawlRow[] = useMemo(() => {
    // A page's Duplicate % is its worst single-pair overlap, so the table
    // matches the pair lines in the Duplicated Content card.
    const maxRatio = new Map<string, number>();
    for (const finding of duplicatePhrases) {
      maxRatio.set(
        finding.pageA,
        Math.max(maxRatio.get(finding.pageA) ?? 0, finding.ratioA),
      );
      maxRatio.set(
        finding.pageB,
        Math.max(maxRatio.get(finding.pageB) ?? 0, finding.ratioB),
      );
    }
    return pages.map((page) => ({
      path: page.path,
      words: page.scopes.all.words,
      duplicateRatio: maxRatio.get(page.path) ?? 0,
      titleLength: page.title.length,
      metaLength: page.metaDescription.length,
      h1Count: page.h1s.length,
      imageCount: page.imageCount,
      missingAltCount: page.missingAltCount,
      linkCount: page.linkCount,
      inboundCount: inboundLinks[page.path] ?? 0,
      flagOrphan: flagOrphans && (inboundLinks[page.path] ?? 0) === 0,
      analysis: page,
    }));
  }, [pages, duplicatePhrases, inboundLinks, flagOrphans]);

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
