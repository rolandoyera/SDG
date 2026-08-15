"use client";
"use no memo";

import { useState, useTransition } from "react";

import type { ColumnDef } from "@tanstack/react-table";
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Ban, MoreVertical } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  TooltipDropdownMenu,
} from "@/components/ui/dropdown-menu";
import { SortableHeader, TanTable } from "@/components/ui/tan-table";
import type {
  AdsCampaignRow,
  AdsKeywordRow,
  AdsLocationRow,
  AdsSearchTermRow,
} from "@/server/google-ads-actions";
import { excludeSearchTerm } from "@/server/google-ads-actions";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

const titleCase = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase();

function numberCell(value: number) {
  return (
    <div className="text-right text-muted-foreground tabular-nums">
      {value.toLocaleString()}
    </div>
  );
}

function moneyCell(value: number) {
  return <div className="text-right tabular-nums">{usd.format(value)}</div>;
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

const campaignColumns: ColumnDef<AdsCampaignRow>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <SortableHeader column={column}>Campaign</SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="font-medium wrap-break-word whitespace-normal">
          {row.original.name}
        </span>
        <Badge
          variant={row.original.status === "ENABLED" ? "success" : "ghost"}
        >
          {titleCase(row.original.status)}
        </Badge>
      </div>
    ),
  },
  {
    accessorKey: "dailyBudget",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Budget/day
      </SortableHeader>
    ),
    cell: ({ row }) => moneyCell(row.original.dailyBudget),
  },
  {
    accessorKey: "impressions",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Impr.
      </SortableHeader>
    ),
    cell: ({ row }) => numberCell(row.original.impressions),
  },
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
    accessorKey: "ctr",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        CTR
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="text-right text-muted-foreground tabular-nums">
        {percent(row.original.ctr)}
      </div>
    ),
  },
  {
    accessorKey: "avgCpc",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Avg. CPC
      </SortableHeader>
    ),
    cell: ({ row }) => moneyCell(row.original.avgCpc),
  },
  {
    accessorKey: "cost",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Cost
      </SortableHeader>
    ),
    cell: ({ row }) => moneyCell(row.original.cost),
  },
  {
    accessorKey: "conversions",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Conv.
      </SortableHeader>
    ),
    cell: ({ row }) => numberCell(row.original.conversions),
  },
  {
    accessorKey: "searchImpressionShare",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Impr. share
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const share = row.original.searchImpressionShare;
      if (share == null)
        return <div className="text-right text-muted-foreground">—</div>;
      return (
        <div className="flex flex-col items-end tabular-nums">
          <span>{percent(share)}</span>
          <span className="text-muted-foreground text-xs">
            −{percent(row.original.lostToBudget)} budget · −
            {percent(row.original.lostToRank)} rank
          </span>
        </div>
      );
    },
  },
];

export function AdsCampaignsTable({ data }: { data: AdsCampaignRow[] }) {
  const table = useReactTable({
    data,
    columns: campaignColumns,
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
      noun="campaigns"
      emptyMessage="No campaign data available for this range."
    />
  );
}

// ---------------------------------------------------------------------------
// Search terms
// ---------------------------------------------------------------------------

// Optimistic exclusions live in table state, keyed per campaign + term:
// search_term_view lags the mutate by hours, so a router.refresh() would
// reset pagination without even showing the new status. The badge flips
// locally instead, and the server catches up on its own schedule.
const termKey = (row: AdsSearchTermRow) => `${row.campaignId}~${row.term}`;

interface SearchTermsMeta {
  isExcluded: (row: AdsSearchTermRow) => boolean;
  markExcluded: (row: AdsSearchTermRow) => void;
}

const searchTermsMeta = (table: {
  options: { meta?: unknown };
}): SearchTermsMeta => table.options.meta as SearchTermsMeta;

function searchTermStatusBadge(status: string, excluded: boolean) {
  if (excluded) return <Badge variant="destructive">Excluded</Badge>;
  if (status === "ADDED") return <Badge variant="success">Added</Badge>;
  return null;
}

function SearchTermActions({
  row,
  excluded,
  onExcluded,
}: {
  row: AdsSearchTermRow;
  excluded: boolean;
  onExcluded: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const handleExclude = () => {
    startTransition(async () => {
      const result = await excludeSearchTerm({
        term: row.term,
        campaignId: row.campaignId,
      });
      if (result.success) {
        toast.success(`Excluded "${row.term}"`, {
          description: `Added as an exact-match negative to ${result.target}.`,
        });
        onExcluded();
      } else {
        toast.error(result.error ?? "Failed to exclude the search term.");
      }
    });
  };

  return (
    <TooltipDropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={isPending}>
          <MoreVertical className="size-4" />
          <span className="sr-only">Actions Menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem
            variant="destructive"
            disabled={excluded || isPending}
            onClick={handleExclude}
          >
            <Ban />
            Exclude Term
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </TooltipDropdownMenu>
  );
}

const searchTermColumns: ColumnDef<AdsSearchTermRow>[] = [
  {
    accessorKey: "term",
    header: ({ column }) => (
      <SortableHeader column={column}>Search term</SortableHeader>
    ),
    cell: ({ row, table }) => (
      <div className="flex items-center gap-2">
        <span className="font-medium wrap-break-word whitespace-normal">
          {row.original.term}
        </span>
        {searchTermStatusBadge(
          row.original.status,
          searchTermsMeta(table).isExcluded(row.original),
        )}
      </div>
    ),
  },
  {
    accessorKey: "keyword",
    header: ({ column }) => (
      <SortableHeader column={column}>Matched keyword</SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="text-muted-foreground wrap-break-word whitespace-normal">
        {row.original.keyword || "—"}
      </div>
    ),
  },
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
    cell: ({ row }) => numberCell(row.original.impressions),
  },
  {
    accessorKey: "cost",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Cost
      </SortableHeader>
    ),
    cell: ({ row }) => moneyCell(row.original.cost),
  },
  {
    accessorKey: "conversions",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Conv.
      </SortableHeader>
    ),
    cell: ({ row }) => numberCell(row.original.conversions),
  },
  {
    id: "actions",
    enableSorting: false,
    cell: ({ row, table }) => (
      <div className="text-right">
        <SearchTermActions
          row={row.original}
          excluded={searchTermsMeta(table).isExcluded(row.original)}
          onExcluded={() => searchTermsMeta(table).markExcluded(row.original)}
        />
      </div>
    ),
  },
];

export function AdsSearchTermsTable({ data }: { data: AdsSearchTermRow[] }) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const table = useReactTable({
    data,
    columns: searchTermColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
    meta: {
      isExcluded: (row: AdsSearchTermRow) =>
        excluded.has(termKey(row)) ||
        row.status === "EXCLUDED" ||
        row.status === "ADDED_EXCLUDED",
      markExcluded: (row: AdsSearchTermRow) =>
        setExcluded((prev) => new Set(prev).add(termKey(row))),
    } satisfies SearchTermsMeta,
  });

  return (
    <TanTable
      table={table}
      borderTop={false}
      pagination
      emptyMessage="No search term data available for this range."
    />
  );
}

// ---------------------------------------------------------------------------
// Keywords
// ---------------------------------------------------------------------------

const QS_COMPONENT_LABELS: Record<string, string> = {
  ABOVE_AVERAGE: "Above average",
  AVERAGE: "Average",
  BELOW_AVERAGE: "Below average",
};

const keywordColumns: ColumnDef<AdsKeywordRow>[] = [
  {
    accessorKey: "keyword",
    header: ({ column }) => (
      <SortableHeader column={column}>Keyword</SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium wrap-break-word whitespace-normal">
          {row.original.keyword}
        </span>
        <span className="text-muted-foreground text-xs">
          {titleCase(row.original.matchType)} · {row.original.adGroup}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "qualityScore",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        QS
      </SortableHeader>
    ),
    cell: ({ row }) => {
      const { qualityScore, expectedCtr, adRelevance, landingPageExperience } =
        row.original;
      if (qualityScore == null)
        return <div className="text-right text-muted-foreground">—</div>;
      const detail = [
        `Expected CTR: ${QS_COMPONENT_LABELS[expectedCtr ?? ""] ?? "—"}`,
        `Ad relevance: ${QS_COMPONENT_LABELS[adRelevance ?? ""] ?? "—"}`,
        `Landing page: ${QS_COMPONENT_LABELS[landingPageExperience ?? ""] ?? "—"}`,
      ].join("\n");
      return (
        <div className="text-right tabular-nums" title={detail}>
          {qualityScore}/10
        </div>
      );
    },
  },
  {
    accessorKey: "impressions",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Impr.
      </SortableHeader>
    ),
    cell: ({ row }) => numberCell(row.original.impressions),
  },
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
    accessorKey: "ctr",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        CTR
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="text-right text-muted-foreground tabular-nums">
        {percent(row.original.ctr)}
      </div>
    ),
  },
  {
    accessorKey: "cost",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Cost
      </SortableHeader>
    ),
    cell: ({ row }) => moneyCell(row.original.cost),
  },
  {
    accessorKey: "conversions",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Conv.
      </SortableHeader>
    ),
    cell: ({ row }) => numberCell(row.original.conversions),
  },
];

export function AdsKeywordsTable({ data }: { data: AdsKeywordRow[] }) {
  const table = useReactTable({
    data,
    columns: keywordColumns,
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
      noun="keywords"
      emptyMessage="No keyword data available for this range."
    />
  );
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

const locationColumns: ColumnDef<AdsLocationRow>[] = [
  {
    accessorKey: "city",
    header: ({ column }) => (
      <SortableHeader column={column}>City</SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <div className="flex flex-col">
          <span className="font-medium wrap-break-word whitespace-normal">
            {row.original.city}
          </span>
          {row.original.region && (
            <span className="text-muted-foreground text-xs">
              {row.original.region}
            </span>
          )}
        </div>
        {!row.original.inTargetedArea && (
          <Badge variant="destructive">Outside target</Badge>
        )}
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
    cell: ({ row }) => numberCell(row.original.impressions),
  },
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
    accessorKey: "ctr",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        CTR
      </SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="text-right text-muted-foreground tabular-nums">
        {percent(row.original.ctr)}
      </div>
    ),
  },
  {
    accessorKey: "cost",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Cost
      </SortableHeader>
    ),
    cell: ({ row }) => moneyCell(row.original.cost),
  },
  {
    accessorKey: "conversions",
    header: ({ column }) => (
      <SortableHeader column={column} align="right">
        Conv.
      </SortableHeader>
    ),
    cell: ({ row }) => numberCell(row.original.conversions),
  },
];

export function AdsLocationsTable({ data }: { data: AdsLocationRow[] }) {
  const table = useReactTable({
    data,
    columns: locationColumns,
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
      noun="locations"
      emptyMessage="No location data available for this range."
    />
  );
}
