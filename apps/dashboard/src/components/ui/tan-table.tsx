"use client";
"use no memo";

import type * as React from "react";
import { useId } from "react";

import type {
  Column,
  ColumnDef,
  Table as TanstackTable,
} from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface TanTableProps<TData> {
  table: TanstackTable<TData>;
  /** Message shown when there are no rows to display. */
  emptyMessage?: string;
  /** Render the count + pager footer below the table. */
  pagination?: boolean;
  /** Plural noun for the pagination count, e.g. "contracts" → "out of 12 contracts". */
  noun?: string;
  /** Render the top border above the header row. Defaults to `true`. */
  borderTop?: boolean;
  /** When set, rows become clickable and call this with the row's data. */
  onRowClick?: (row: TData) => void;
}

/**
 * A reusable checkbox column for row selection. Spread it into a table's
 * `columns` to opt into selection: `[selectionColumn(), ...myColumns]`.
 */
export function selectionColumn<TData>(): ColumnDef<TData> {
  return {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all rows"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  };
}

/**
 * Sortable column header: cycles asc/desc on click and shows the sort state.
 * Use inside a column def (with `getSortedRowModel()` on the table):
 * `header: ({ column }) => <SortableHeader column={column}>Views</SortableHeader>`
 */
export function SortableHeader<TData>({
  column,
  children,
  align = "left",
}: {
  column: Column<TData, unknown>;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const sorted = column.getIsSorted();
  const Icon =
    sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <Button
      variant="ghost"
      onClick={() => column.toggleSorting(sorted === "asc")}
      className={cn(
        "-mx-3 h-8 gap-1.5 px-3 font-medium text-foreground text-sm hover:bg-transparent",
        align === "right" && "-mx-3 ml-auto flex flex-row-reverse",
      )}
    >
      {children}
      <Icon
        className={cn(
          "size-3.5",
          sorted ? "text-foreground" : "text-muted-foreground/60",
        )}
      />
    </Button>
  );
}

/**
 * Renders a TanStack Table instance with the shared data-table theme (cell/head
 * padding, header sizing, row borders). Owns the `<Table>` markup and an optional
 * pagination footer — the surrounding card and toolbar stay with the caller.
 */
export function TanTable<TData>({
  table,
  emptyMessage = "No results.",
  pagination = false,
  noun = "rows",
  borderTop = true,
  onRowClick,
}: TanTableProps<TData>) {
  const currentPage = table.getState().pagination.pageIndex + 1;
  const pageCount = table.getPageCount();
  const filteredCount = table.getFilteredRowModel().rows.length;
  const visibleCount = table.getRowModel().rows.length;
  // Unique per instance so the "Rows per page" label targets its own select.
  const rowsPerPageId = useId();

  return (
    // Flex column so the pagination footer pins to the bottom (`mt-auto`) when
    // the parent stretches the table (e.g. side-by-side cards of equal height).
    <div className="flex h-full flex-col">
      <div className="overflow-hidden">
        <Table className="**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4 **:data-[slot='table-cell']:py-4">
          <TableHeader
            className={cn(
              "h-16 **:data-[slot='table-head']:h-11 **:data-[slot='table-head']:font-medium **:data-[slot='table-head']:text-foreground **:data-[slot='table-head']:text-sm",
              borderTop && "border-t",
            )}
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className="**:data-[slot='table-row']:border-border/50">
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  onClick={
                    onRowClick ? () => onRowClick(row.original) : undefined
                  }
                  className={onRowClick ? "cursor-pointer" : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className="h-24 text-center"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pagination ? (
        <div className="mt-auto flex items-center justify-between gap-4 px-4 pt-4 pb-1">
          <p className="hidden flex-1 text-muted-foreground text-sm lg:block">
            Viewing {visibleCount} out of {filteredCount.toLocaleString()}{" "}
            {noun}
          </p>

          <div className="flex w-full items-center gap-8 lg:w-fit">
            <div className="hidden items-center gap-2 lg:flex">
              <Label htmlFor={rowsPerPageId} className="font-medium text-sm">
                Rows per page
              </Label>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => {
                  table.setPageSize(Number(value));
                }}
              >
                <SelectTrigger size="sm" className="w-20" id={rowsPerPageId}>
                  <SelectValue
                    placeholder={table.getState().pagination.pageSize}
                  />
                </SelectTrigger>
                <SelectContent side="top">
                  <SelectGroup>
                    {[10, 20, 30, 40, 50].map((pageSize) => (
                      <SelectItem key={pageSize} value={`${pageSize}`}>
                        {pageSize}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-fit items-center justify-center font-medium text-sm">
              Page {currentPage} of {Math.max(pageCount, 1)}
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button
                variant="outline"
                className="hidden size-8 lg:flex"
                size="icon"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to first page</span>
                <ChevronsLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to previous page</span>
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to next page</span>
                <ChevronRight className="size-4" />
              </Button>
              <Button
                variant="outline"
                className="hidden size-8 lg:flex"
                size="icon"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to last page</span>
                <ChevronsRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
