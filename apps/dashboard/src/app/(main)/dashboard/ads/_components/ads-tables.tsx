"use client";
"use no memo";

import type * as React from "react";
import { useMemo, useState, useTransition } from "react";

import type {
  ColumnDef,
  ColumnFiltersState,
  FilterFn,
} from "@tanstack/react-table";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Ban,
  ChevronDownIcon,
  ExternalLink,
  ListFilter,
  MoreVertical,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  TooltipDropdownMenu,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { SortableHeader, TanTable } from "@/components/ui/tan-table";
import type {
  AdsCampaignRow,
  AdsKeywordRow,
  AdsLocationRow,
  AdsSearchTermRow,
} from "@/server/google-ads-actions";
import { excludeSearchTerm } from "@/server/google-ads-actions";

import { TableCard } from "./table-card";

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

/**
 * Triage state — what you've done about a term, not where it came from. Google's
 * five-value enum collapses to three: ADDED_EXCLUDED counts as excluded (it's
 * already negated somewhere), and NONE/UNKNOWN are the ones still to look at.
 */
type SearchTermState = "review" | "added" | "excluded";

/** Sort rank, so "Status" groups by triage order instead of alphabetically. */
const STATE_RANK: Record<SearchTermState, number> = {
  review: 0,
  added: 1,
  excluded: 2,
};

const STATE_BADGE: Record<
  SearchTermState,
  { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }
> = {
  review: { label: "Review", variant: "ghost" },
  added: { label: "Added", variant: "success" },
  excluded: { label: "Excluded", variant: "destructive" },
};

/** The row plus its derived triage state, which the Status column sorts on. */
type SearchTermTriageRow = AdsSearchTermRow & { state: SearchTermState };

/** Which text fields the header search box looks at. */
type SearchScope = "all" | "term" | "keyword";

const SCOPE_LABELS: Record<SearchScope, string> = {
  all: "All fields",
  term: "Search term",
  keyword: "Matched keyword",
};

interface SearchValue {
  query: string;
  scope: SearchScope;
}

/**
 * Scoped text search, hung off the term column. A column filter runs once per
 * row, where the global filter would re-run for every filterable column and
 * still need per-column opt-outs to keep the numeric columns out of the match.
 */
const searchFilter: FilterFn<SearchTermTriageRow> = (row, _columnId, value) => {
  const { query, scope } = value as SearchValue;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  const fields =
    scope === "term"
      ? [row.original.term]
      : scope === "keyword"
        ? [row.original.keyword]
        : [row.original.term, row.original.keyword];

  return fields.some((field) => field.toLowerCase().includes(needle));
};

/** Triage states in rank order — the filter's checkbox list and its "all" count. */
const SEARCH_TERM_STATES = Object.keys(STATE_RANK) as SearchTermState[];

/** Keeps the checked statuses; the filter value is this set, spread to an array. */
const statusFilter: FilterFn<SearchTermTriageRow> = (row, _columnId, value) =>
  (value as SearchTermState[]).includes(row.original.state);

function statusButtonLabel(statuses: Set<SearchTermState>) {
  if (statuses.size === SEARCH_TERM_STATES.length) return "Status";
  if (statuses.size === 0) return "No statuses";
  return SEARCH_TERM_STATES.filter((state) => statuses.has(state))
    .map((state) => STATE_BADGE[state].label)
    .join(", ");
}

function SearchTermsToolbar({
  query,
  scope,
  statuses,
  onQueryChange,
  onScopeChange,
  onStatusToggle,
}: {
  query: string;
  scope: SearchScope;
  statuses: Set<SearchTermState>;
  onQueryChange: (query: string) => void;
  onScopeChange: (scope: SearchScope) => void;
  onStatusToggle: (state: SearchTermState, checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <InputGroup className="min-w-72 bg-background">
        <InputGroupInput
          placeholder="Enter search query"
          aria-label={`Search ${SCOPE_LABELS[scope]}`}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <InputGroupAddon align="inline-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <InputGroupButton variant="ghost" className="pr-1.5! text-xs">
                {SCOPE_LABELS[scope]}
                <ChevronDownIcon className="size-3" />
              </InputGroupButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={8}
              alignOffset={-4}
              className="w-fit"
            >
              <DropdownMenuRadioGroup
                value={scope}
                onValueChange={(value) => onScopeChange(value as SearchScope)}
              >
                {(Object.keys(SCOPE_LABELS) as SearchScope[]).map((option) => (
                  <DropdownMenuRadioItem key={option} value={option}>
                    {SCOPE_LABELS[option]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </InputGroupAddon>
      </InputGroup>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <ListFilter data-icon="inline-start" />
            {statusButtonLabel(statuses)}
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-fit">
          {SEARCH_TERM_STATES.map((state) => (
            <DropdownMenuCheckboxItem
              key={state}
              checked={statuses.has(state)}
              onCheckedChange={(checked) => onStatusToggle(state, !!checked)}
              // Multi-select: without this the menu closes on every toggle.
              onSelect={(event) => event.preventDefault()}
            >
              {STATE_BADGE[state].label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface SearchTermsMeta {
  markExcluded: (row: AdsSearchTermRow) => void;
}

const searchTermsMeta = (table: {
  options: { meta?: unknown };
}): SearchTermsMeta => table.options.meta as SearchTermsMeta;

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

const searchTermColumns: ColumnDef<SearchTermTriageRow>[] = [
  {
    accessorKey: "term",
    header: ({ column }) => (
      <SortableHeader column={column}>Search term</SortableHeader>
    ),
    filterFn: searchFilter,
    cell: ({ row }) => (
      <span className="font-medium wrap-break-word whitespace-normal">
        {row.original.term}
      </span>
    ),
  },
  {
    accessorKey: "state",
    header: ({ column }) => (
      <SortableHeader column={column}>Status</SortableHeader>
    ),
    // Rank order, not the label's alphabetical order — sorting the column is
    // the point of it, and "Review" first is the useful direction.
    sortingFn: (a, b) =>
      STATE_RANK[a.original.state] - STATE_RANK[b.original.state],
    filterFn: statusFilter,
    cell: ({ row }) => {
      const { label, variant } = STATE_BADGE[row.original.state];
      return <Badge variant={variant}>{label}</Badge>;
    },
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
          excluded={row.original.state === "excluded"}
          onExcluded={() => searchTermsMeta(table).markExcluded(row.original)}
        />
      </div>
    ),
  },
];

export function AdsSearchTermsTable({ data }: { data: AdsSearchTermRow[] }) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [statuses, setStatuses] = useState<Set<SearchTermState>>(
    () => new Set(SEARCH_TERM_STATES),
  );

  // Derived onto the row so the badge and the Status sort agree — an optimistic
  // exclusion has to be able to move the row, not just recolor it.
  const rows = useMemo<SearchTermTriageRow[]>(
    () =>
      data.map((row) => ({
        ...row,
        state:
          excluded.has(termKey(row)) ||
          row.status === "EXCLUDED" ||
          row.status === "ADDED_EXCLUDED"
            ? "excluded"
            : row.status === "ADDED"
              ? "added"
              : "review",
      })),
    [data, excluded],
  );

  // The toolbar owns the filters; the table just reads them. Nothing inside the
  // table sets a column filter, so there's no state to hand back.
  const columnFilters = useMemo<ColumnFiltersState>(() => {
    const filters: ColumnFiltersState = [];
    if (query.trim()) filters.push({ id: "term", value: { query, scope } });
    // Only when something is unchecked — and an empty set really does mean
    // "show nothing", which is the honest read of unchecking every status.
    if (statuses.size < SEARCH_TERM_STATES.length)
      filters.push({ id: "state", value: [...statuses] });
    return filters;
  }, [query, scope, statuses]);

  const table = useReactTable({
    data: rows,
    columns: searchTermColumns,
    state: { columnFilters },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
    meta: {
      markExcluded: (row: AdsSearchTermRow) =>
        setExcluded((prev) => new Set(prev).add(termKey(row))),
    } satisfies SearchTermsMeta,
  });

  return (
    <TableCard
      title="Search Terms"
      action={
        <SearchTermsToolbar
          query={query}
          scope={scope}
          statuses={statuses}
          onQueryChange={(value) => {
            setQuery(value);
            table.setPageIndex(0);
          }}
          onScopeChange={(value) => {
            setScope(value);
            table.setPageIndex(0);
          }}
          onStatusToggle={(state, checked) => {
            setStatuses((prev) => {
              const next = new Set(prev);
              if (checked) next.add(state);
              else next.delete(state);
              return next;
            });
            table.setPageIndex(0);
          }}
        />
      }
    >
      <TanTable
        table={table}
        borderTop={false}
        pagination
        noun="search terms"
        emptyMessage={
          columnFilters.length
            ? "No search terms match these filters."
            : "No search term data available for this range."
        }
      />
    </TableCard>
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

const locationColumns = (
  locationHeader: string,
  zip: boolean,
): ColumnDef<AdsLocationRow>[] => [
  {
    accessorKey: "city",
    header: ({ column }) => (
      <SortableHeader column={column}>{locationHeader}</SortableHeader>
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <div className="flex flex-col">
          {zip ? (
            <a
              href={`https://www.zillow.com/${encodeURIComponent(row.original.city)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium hover:text-primary hover:underline"
            >
              {row.original.city}
              <ExternalLink className="size-3 text-muted-foreground" />
            </a>
          ) : (
            <span className="font-medium wrap-break-word whitespace-normal">
              {row.original.city}
            </span>
          )}
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

export function AdsLocationsTable({
  data,
  locationHeader = "City",
  zip = false,
}: {
  data: AdsLocationRow[];
  locationHeader?: string;
  /** ZIP granularity: link each ZIP out to its Zillow page. */
  zip?: boolean;
}) {
  const columns = useMemo(
    () => locationColumns(locationHeader, zip),
    [locationHeader, zip],
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
      noun="locations"
      emptyMessage="No location data available for this range."
    />
  );
}
