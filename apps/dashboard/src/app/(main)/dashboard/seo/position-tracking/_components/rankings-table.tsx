"use client";
"use no memo";

import { useMemo } from "react";

import type {
  ColumnDef,
  OnChangeFn,
  RowSelectionState,
} from "@tanstack/react-table";
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ExternalLink, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  selectionColumn,
  SortableHeader,
  TanTable,
} from "@/components/ui/tan-table";

export interface RankingRow {
  keyword: string;
  /** Saved DataForSEO location_name the keyword is checked from. */
  location: string;
  intent: string | null;
  difficulty: number | null;
  /** undefined = no snapshot data in range; null = not found within depth. */
  posStart: number | null | undefined;
  posLatest: number | null | undefined;
  /** Positions gained since range start (positive = moved up). */
  diff: number | null;
  /** Share of the tracker's total visibility, 0–100. */
  visibility: number | null;
  volume: number | null;
  cpc: number | null;
  url: string | null;
  /** A queued check is in flight — the latest-position cell shows a spinner. */
  checking: boolean;
}

/** "Aventura,Florida,United States" → "Aventura"; country-wide → "United States". */
function cityLabel(location: string): string {
  const parts = location.split(",").map((part) => part.trim());
  return parts.length >= 3 ? parts[0] : "United States";
}

function PositionCell({ value }: { value: number | null | undefined }) {
  // No data in range (undefined) and not found within the checked depth
  // (null) both render as a dash.
  if (value === undefined || value === null) {
    return <div className="text-right text-muted-foreground">—</div>;
  }
  return <div className="text-right tabular-nums">{value}</div>;
}

export function RankingsTable({
  rows,
  startLabel,
  latestLabel,
  rowSelection,
  onRowSelectionChange,
}: {
  rows: RankingRow[];
  startLabel: string;
  latestLabel: string;
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
}) {
  // Fixed layout: data columns get tight widths; Keyword and URL (no width)
  // split the remaining space.
  const columns: ColumnDef<RankingRow>[] = useMemo(
    () => [
      { ...selectionColumn<RankingRow>(), meta: { headClassName: "w-10" } },
      {
        accessorKey: "keyword",
        header: ({ column }) => (
          <SortableHeader column={column}>Keyword</SortableHeader>
        ),
        cell: ({ row }) => (
          <div className="font-medium wrap-break-word whitespace-normal">
            {row.original.keyword}
          </div>
        ),
      },
      {
        id: "location",
        // Sort by the displayed city, case-insensitively — stored locations
        // predating title-casing can be lowercase.
        accessorFn: (row) => cityLabel(row.location).toLowerCase(),
        header: ({ column }) => (
          <SortableHeader column={column}>City</SortableHeader>
        ),
        meta: { headClassName: "w-36" },
        cell: ({ row }) => (
          <div className="wrap-break-word whitespace-normal text-muted-foreground capitalize">
            {cityLabel(row.original.location)}
          </div>
        ),
      },
      {
        accessorKey: "intent",
        header: "Intent",
        meta: { headClassName: "w-16" },
        cell: ({ row }) => {
          const intent = row.original.intent;
          if (!intent) {
            return <span className="text-muted-foreground">—</span>;
          }
          return (
            <Badge
              variant={intent === "commercial" ? "default" : "secondary"}
              title={intent}
              className="uppercase w-5"
            >
              {intent.charAt(0)}
            </Badge>
          );
        },
      },
      {
        id: "difficulty",
        accessorFn: (row) => row.difficulty ?? undefined,
        sortUndefined: "last",
        header: ({ column }) => (
          <SortableHeader column={column} align="right">
            KD %
          </SortableHeader>
        ),
        meta: { headClassName: "w-30" },
        cell: ({ row }) => (
          <div className="text-right text-muted-foreground tabular-nums">
            {row.original.difficulty ?? "—"}
          </div>
        ),
      },
      {
        accessorKey: "posStart",
        header: () => <div className="text-right">Pos. {startLabel}</div>,
        cell: ({ row }) => <PositionCell value={row.original.posStart} />,
        meta: { headClassName: "w-30" },
      },
      {
        id: "posLatest",
        // Unplaced (null, shown as a dash) sorts as 100 — worse than any
        // real result; rows with no data sort last in either direction.
        accessorFn: (row) =>
          row.posLatest === undefined ? undefined : (row.posLatest ?? 100),
        sortUndefined: "last",
        header: ({ column }) => (
          <SortableHeader column={column} align="right">
            Pos. {latestLabel}
          </SortableHeader>
        ),
        cell: ({ row }) =>
          row.original.checking ? (
            <div className="flex justify-end">
              <RefreshCw className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <PositionCell value={row.original.posLatest} />
          ),
        meta: { headClassName: "w-30" },
      },
      {
        accessorKey: "diff",
        header: () => <div className="text-right">Diff</div>,
        meta: { headClassName: "w-30" },
        cell: ({ row }) => {
          const diff = row.original.diff;
          if (diff === null) {
            return <div className="text-right text-muted-foreground">—</div>;
          }
          if (diff === 0) {
            return <div className="text-right text-muted-foreground">0</div>;
          }
          return (
            <div className="flex justify-end">
              <Badge variant={diff > 0 ? "trendingUp2" : "trendingDown2"}>
                {diff > 0 ? <ArrowUp /> : <ArrowDown />}
                {Math.abs(diff)}
              </Badge>
            </div>
          );
        },
      },
      {
        id: "visibility",
        accessorFn: (row) => row.visibility ?? undefined,
        sortUndefined: "last",
        header: ({ column }) => (
          <SortableHeader column={column} align="right">
            Visibility
          </SortableHeader>
        ),
        meta: { headClassName: "w-30" },
        cell: ({ row }) => (
          <div className="text-right text-muted-foreground tabular-nums">
            {row.original.visibility === null
              ? "—"
              : `${row.original.visibility.toFixed(2)}%`}
          </div>
        ),
      },
      {
        id: "volume",
        accessorFn: (row) => row.volume ?? undefined,
        sortUndefined: "last",
        header: ({ column }) => (
          <SortableHeader column={column} align="right">
            Vol.
          </SortableHeader>
        ),
        meta: { headClassName: "w-30" },
        cell: ({ row }) => (
          <div className="text-right text-muted-foreground tabular-nums">
            {row.original.volume === null
              ? "—"
              : row.original.volume.toLocaleString()}
          </div>
        ),
      },
      {
        accessorKey: "cpc",
        header: () => <div className="text-center">CPC</div>,
        meta: { headClassName: "w-30" },
        cell: ({ row }) => (
          <div className="text-center text-muted-foreground tabular-nums">
            {row.original.cpc === null
              ? "—"
              : `$${row.original.cpc.toFixed(2)}`}
          </div>
        ),
      },
      {
        accessorKey: "url",
        header: "URL",
        cell: ({ row }) => {
          const url = row.original.url;
          if (!url) return <span className="text-muted-foreground">—</span>;
          let path: string;
          try {
            path = new URL(url).pathname;
          } catch {
            path = url;
          }
          return (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex max-w-full items-center gap-1 text-primary hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              <span className="min-w-0 truncate">{path}</span>
              <ExternalLink className="size-3.5 shrink-0" />
            </a>
          );
        },
      },
    ],
    [startLabel, latestLabel],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { rowSelection },
    onRowSelectionChange,
    getRowId: (row) => row.keyword,
  });

  return (
    <TanTable
      table={table}
      tableClassName="table-fixed"
      borderTop={false}
      noun="keywords"
      emptyMessage="No keywords tracked yet — add your first ones."
    />
  );
}
