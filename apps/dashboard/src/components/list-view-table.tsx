"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { Columns3, Grid, Rows3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type ViewMode = "grid" | "list";

export interface ListViewColumn<T> {
  id: string;
  /** Shown in the Columns menu, and as the header unless `header` overrides it. */
  label: string;
  /** Overrides `label` in the table header (e.g. an sr-only span for thumbnails). */
  header?: ReactNode;
  /** false = always rendered and left out of the Columns menu. Default true. */
  hideable?: boolean;
  /** Start unchecked in the Columns menu. Default true. */
  defaultVisible?: boolean;
  headClassName?: string;
  cellClassName?: string;
  cell: (row: T) => ReactNode;
}

/**
 * View-mode state remembered per page in localStorage. Starts as "grid" and
 * loads the stored choice after mount — localStorage can't be read during
 * prerender, and reading it in the initializer would mismatch the server HTML.
 */
export function useViewMode(storageKey: string) {
  const [view, setView] = useState<ViewMode>("grid");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "grid" || stored === "list") setView(stored);
    } catch {
      // localStorage unavailable (private mode etc.) — keep the default.
    }
  }, [storageKey]);

  const setAndStore = useCallback(
    (next: ViewMode) => {
      setView(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // Best-effort persistence — the in-memory state still applies.
      }
    },
    [storageKey],
  );

  return [view, setAndStore] as const;
}

/**
 * Column visibility state seeded from each column's `defaultVisible`, with the
 * user's toggles remembered per page in localStorage (same mount-time load as
 * `useViewMode`). Stored choices merge over the defaults, so columns added
 * later still appear with their declared default.
 */
export function useColumnVisibility<T>(
  columns: ListViewColumn<T>[],
  storageKey: string,
) {
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      columns
        .filter((col) => col.hideable !== false)
        .map((col) => [col.id, col.defaultVisible !== false]),
    ),
  );

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(
        window.localStorage.getItem(storageKey) ?? "null",
      );
      if (stored && typeof stored === "object") {
        setVisibility((prev) => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(stored).filter(
              ([id, checked]) => id in prev && typeof checked === "boolean",
            ),
          ),
        }));
      }
    } catch {
      // Unavailable or unparsable — keep the defaults.
    }
  }, [storageKey]);

  const setAndStore = useCallback(
    (next: Record<string, boolean>) => {
      setVisibility(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Best-effort persistence — the in-memory state still applies.
      }
    },
    [storageKey],
  );

  return [visibility, setAndStore] as const;
}

/** Grid/list display-mode switch (same control the Projects items tab uses). */
export function ViewModeTabs({
  view,
  onViewChange,
}: {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}) {
  return (
    <Tabs
      value={view}
      onValueChange={(value) => onViewChange(value as ViewMode)}
    >
      <TabsList>
        <TabsTrigger value="grid" aria-label="Grid view">
          <Grid />
        </TabsTrigger>
        <TabsTrigger value="list" aria-label="List view">
          <Rows3 />
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

/** Checkbox dropdown toggling which hideable columns the list view shows. */
export function ColumnsMenu<T>({
  columns,
  visibility,
  onVisibilityChange,
}: {
  columns: ListViewColumn<T>[];
  visibility: Record<string, boolean>;
  onVisibilityChange: (visibility: Record<string, boolean>) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Columns3 className="size-4" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-96 w-52 overflow-y-auto"
      >
        <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns
          .filter((col) => col.hideable !== false)
          .map((col) => (
            <DropdownMenuCheckboxItem
              key={col.id}
              checked={visibility[col.id]}
              onCheckedChange={(checked) =>
                onVisibilityChange({ ...visibility, [col.id]: !!checked })
              }
              onSelect={(event) => event.preventDefault()}
            >
              {col.label}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The list display mode: the standard `ui/table` inside a Card. Fixed columns
 * (no resizing, no drag-sort) filtered by the shared visibility state; when
 * `rowHref` is set, clicking a row navigates (links/buttons inside cells still
 * win the click).
 */
export function ListViewTable<T>({
  columns,
  rows,
  rowKey,
  visibility,
  rowHref,
}: {
  columns: ListViewColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  visibility: Record<string, boolean>;
  rowHref?: (row: T) => string;
}) {
  const router = useRouter();
  const visibleColumns = columns.filter(
    (col) => col.hideable === false || visibility[col.id] !== false,
  );

  return (
    <Card className="py-0">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {visibleColumns.map((col) => (
              <TableHead
                key={col.id}
                className={cn(
                  "text-muted-foreground text-xs uppercase tracking-widest",
                  col.headClassName,
                )}
              >
                {col.header ?? col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={rowKey(row)}
              className={cn(rowHref && "cursor-pointer")}
              onClick={
                rowHref
                  ? (event) => {
                      // Let in-cell links/buttons handle their own clicks.
                      if ((event.target as HTMLElement).closest("a,button"))
                        return;
                      router.push(rowHref(row));
                    }
                  : undefined
              }
            >
              {visibleColumns.map((col) => (
                <TableCell key={col.id} className={col.cellClassName}>
                  {col.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
