"use client";

import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import * as React from "react";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface GeoTableRow {
  /** Display name (e.g. a city or country). */
  label: string;
  /** Numeric metric for the row. */
  value: number;
  /** Country code for a flag in the left gutter (e.g. "US"); omit for none. */
  flagCode?: string;
}

type SortColumn = "label" | "value";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 10;
// Fixed flag gutter so labels stay aligned even when a row has no flag (e.g. Unknown).
const FLAG_WIDTH = 21;
const FLAG_HEIGHT = 14;

function preventNavigation(event: React.MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
}

/**
 * Paginated, ranked list of geo rows (flag, label, value, share). Shows a fixed
 * page of rows so the card height stays constant while all data stays reachable.
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
  const [pageIndex, setPageIndex] = React.useState(0);
  // "percent" sorts identically to "value"; tracked separately so only the clicked column highlights.
  const [sort, setSort] = React.useState<{ key: SortColumn; dir: SortDir }>({
    key: "value",
    dir: "desc",
  });

  const total = rows.reduce((sum, r) => sum + r.value, 0);

  const sortedRows = React.useMemo(() => {
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) =>
      sort.key === "label"
        ? factor * a.label.localeCompare(b.label)
        : factor * (a.value - b.value),
    );
  }, [rows, sort]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const page = Math.min(pageIndex, pageCount - 1);
  const start = page * PAGE_SIZE;
  const pageRows = sortedRows.slice(start, start + PAGE_SIZE);

  function toggleSort(key: SortColumn) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "label" ? "asc" : "desc" },
    );
    setPageIndex(0);
  }

  function renderSortIcon(key: SortColumn) {
    if (sort.key !== key) {
      return <ChevronsUpDown className="size-3.5 opacity-40" />;
    }
    return sort.dir === "asc" ? (
      <ChevronUp className="size-3.5" />
    ) : (
      <ChevronDown className="size-3.5" />
    );
  }

  const pageNumbers = React.useMemo(() => {
    if (pageCount <= 3) {
      return Array.from({ length: pageCount }, (_, i) => i + 1);
    }
    const current = page + 1;
    if (current <= 2) return [1, 2, 3];
    if (current >= pageCount - 1)
      return [pageCount - 2, pageCount - 1, pageCount];
    return [current - 1, current, current + 1];
  }, [page, pageCount]);

  if (rows.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <Table>
        <TableHeader className="[&_tr]:border-border/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-8 font-normal">
              <button
                type="button"
                className="flex items-center gap-1 transition-colors hover:text-foreground"
                onClick={() => toggleSort("label")}>
                {labelHeader}
                {renderSortIcon("label")}
              </button>
            </TableHead>
            <TableHead className="h-8 w-24 font-normal">
              <button
                type="button"
                className="flex w-full items-center justify-end gap-1 transition-colors hover:text-foreground"
                onClick={() => toggleSort("value")}>
                {valueHeader}
                {renderSortIcon("value")}
              </button>
            </TableHead>
            <TableHead className="h-8 w-16 font-normal">
              <button
                type="button"
                className="flex w-full items-center justify-end gap-1 transition-colors hover:text-foreground"
                onClick={() => toggleSort("value")}>
                %{renderSortIcon("value")}
              </button>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_tr]:border-border/50">
          {pageRows.map((row) => (
            <TableRow className="hover:bg-transparent" key={row.label}>
              <TableCell className="py-2.5 font-medium text-foreground">
                <span className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className={
                      row.flagCode
                        ? `flag:${row.flagCode} shrink-0 rounded-xs ring-1 ring-foreground/5`
                        : "shrink-0"
                    }
                    style={{ height: FLAG_HEIGHT, width: FLAG_WIDTH }}
                  />
                  {row.label}
                </span>
              </TableCell>
              <TableCell className="py-2.5 text-right tabular-nums text-foreground">
                {row.value}
              </TableCell>
              <TableCell className="py-2.5 text-right tabular-nums">
                {total > 0 ? `${Math.round((row.value / total) * 100)}%` : "0%"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="mt-auto flex items-center justify-between gap-4 pb-1">
        <p className="text-muted-foreground text-sm">
          Viewing {pageRows.length} of {rows.length.toLocaleString()}
        </p>
        {pageCount > 1 ? (
          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent className="gap-1.5">
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  className={
                    page === 0 ? "pointer-events-none opacity-50" : undefined
                  }
                  onClick={(event) => {
                    preventNavigation(event);
                    setPageIndex(page - 1);
                  }}
                />
              </PaginationItem>
              {pageNumbers[0] > 1 ? (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : null}
              {pageNumbers.map((pageNumber) => (
                <PaginationItem key={`page-${pageNumber}`}>
                  <PaginationLink
                    href="#"
                    isActive={page === pageNumber - 1}
                    onClick={(event) => {
                      preventNavigation(event);
                      setPageIndex(pageNumber - 1);
                    }}>
                    {pageNumber}
                  </PaginationLink>
                </PaginationItem>
              ))}
              {pageNumbers[pageNumbers.length - 1] < pageCount ? (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : null}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  className={
                    page >= pageCount - 1
                      ? "pointer-events-none opacity-50"
                      : undefined
                  }
                  onClick={(event) => {
                    preventNavigation(event);
                    setPageIndex(page + 1);
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        ) : null}
      </div>
    </div>
  );
}
