"use client";

import { useEffect, useState } from "react";

import type { RowSelectionState } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import {
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import {
  type AppliedDateRange,
  DateRangePicker,
} from "@/components/date-range-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  TooltipDropdownMenu,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  fetchPositionTracking,
  type PositionTrackingData,
  removeTrackedKeywords,
  runPositionCheckNow,
} from "@/server/position-tracking-actions";

import { AddKeywordsDialog } from "./add-keywords-dialog";
import { PositionChart, type PositionPoint } from "./position-chart";
import { type RankingRow, RankingsTable } from "./rankings-table";

/** Effective position for "not found within depth" in averages. */
const NOT_FOUND_POSITION = 100;

/** Approximate organic CTR by position, used for the visibility share. */
const CTR_TOP_10 = [
  0.3945, 0.1874, 0.1085, 0.0723, 0.0512, 0.0397, 0.0308, 0.0247, 0.0202,
  0.0166,
];

function ctr(position: number | null): number {
  if (position === null || position > 50) return 0;
  if (position <= 10) return CTR_TOP_10[position - 1];
  if (position <= 20) return 0.01;
  if (position <= 30) return 0.005;
  return 0.002;
}

function localDateKey(d: Date): string {
  return d.toLocaleDateString("en-CA");
}

function shortDate(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function defaultRange(): AppliedDateRange {
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from, to };
}

export function PositionTrackingClient() {
  const [data, setData] = useState<PositionTrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [range, setRange] = useState<AppliedDateRange>(defaultRange);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPositionTracking()
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data) {
          setData(result.data);
        } else {
          setLoadError(result.error ?? "Could not load position tracking.");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("The request failed — refresh the page and try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const keywords = data?.keywords ?? [];
  const snapshots = data?.snapshots ?? [];

  const fromKey = localDateKey(range.from);
  const toKey = localDateKey(range.to);
  const inRange = snapshots.filter(
    (snapshot) =>
      snapshot.date >= fromKey &&
      snapshot.date <= toKey &&
      snapshot.results.length > 0,
  );

  const chartData: PositionPoint[] = inRange.map((snapshot) => ({
    label: shortDate(snapshot.date),
    avgPosition: round2(
      snapshot.results.reduce(
        (sum, row) => sum + (row.position ?? NOT_FOUND_POSITION),
        0,
      ) / snapshot.results.length,
    ),
  }));
  const latestAvg = chartData.at(-1)?.avgPosition ?? null;
  const delta =
    chartData.length >= 2 && latestAvg !== null
      ? round2(chartData[0].avgPosition - latestAvg)
      : null;

  const rows: RankingRow[] = keywords.map((entry) => {
    const series = inRange
      .map((snapshot) =>
        snapshot.results.find((row) => row.keyword === entry.keyword),
      )
      .filter((row) => row !== undefined);
    const first = series[0];
    const last = series.at(-1);
    return {
      keyword: entry.keyword,
      location: entry.location,
      intent: entry.intent,
      difficulty: entry.difficulty,
      posStart: first ? first.position : undefined,
      posLatest: last ? last.position : undefined,
      diff:
        first && last
          ? (first.position ?? NOT_FOUND_POSITION) -
            (last.position ?? NOT_FOUND_POSITION)
          : null,
      visibility: last
        ? round2(((ctr(last.position) / ctr(1)) * 100) / keywords.length)
        : null,
      volume: entry.volume,
      cpc: entry.cpc,
      url: last?.url ?? null,
    };
  });

  const startLabel = inRange[0] ? shortDate(inRange[0].date) : "start";
  const latestLabel = inRange.at(-1)
    ? shortDate(inRange.at(-1)?.date ?? "")
    : "latest";
  const earliest = snapshots[0]
    ? new Date(`${snapshots[0].date}T00:00:00`)
    : undefined;
  const lastUpdated =
    snapshots.length > 0
      ? Math.max(...snapshots.map((snapshot) => snapshot.createdAt))
      : null;
  const selectedKeywords = Object.keys(rowSelection).filter(
    (key) => rowSelection[key],
  );

  const handleRunNow = async () => {
    setRunning(true);
    try {
      const result = await runPositionCheckNow();
      if (result.success && result.data) {
        setData(result.data);
        toast.success("Positions checked.");
      } else {
        toast.error(result.error ?? "The position check failed.");
      }
    } finally {
      setRunning(false);
    }
  };

  const handleRemoveSelected = async () => {
    const result = await removeTrackedKeywords(selectedKeywords);
    if (result.success && result.data) {
      setData((current) =>
        current ? { ...current, keywords: result.data ?? [] } : current,
      );
      setRowSelection({});
      toast.success("Keywords removed.");
    } else {
      toast.error(result.error ?? "Could not remove keywords.");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (loadError) {
    return <p className="text-destructive text-sm">{loadError}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="gap-2 pt-0">
        <CardHeader className="flex flex-row items-center justify-between bg-muted/50 py-3">
          <CardTitle>Average Position</CardTitle>
          <DateRangePicker
            value={range}
            onChange={setRange}
            earliest={earliest}
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-2">
          {chartData.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground text-sm">
              No position data in this range yet — snapshots accrue daily.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-3xl tracking-tight">
                  {latestAvg}
                </span>
                {delta !== null && delta !== 0 && (
                  <Badge variant={delta > 0 ? "trendingUp" : "trendingDown"}>
                    {delta > 0 ? <TrendingUp /> : <TrendingDown />}
                    {Math.abs(delta)}
                  </Badge>
                )}
              </div>
              <PositionChart data={chartData} />
            </>
          )}
        </CardContent>
      </Card>

      <Card className="gap-2 pt-0">
        <CardHeader className="flex flex-row items-center justify-between bg-muted/50 py-3">
          <CardTitle>
            Rankings Overview{" "}
            <span className="font-normal text-muted-foreground text-sm">
              ({keywords.length})
              {lastUpdated !== null &&
                ` · Updated ${formatDistanceToNow(lastUpdated, { addSuffix: true })}`}
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" />
              Keywords
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="bg-red-500 hover:bg-red-600 disabled:bg-transparent disabled:text-gray-400 text-white disabled:font-normal font-medium"
              disabled={selectedKeywords.length === 0}
              onClick={() => void handleRemoveSelected()}>
              <Trash2 className="size-4" />
              Remove
            </Button>
            <TooltipDropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="size-4" />
                  <span className="sr-only">Actions Menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  disabled={running || keywords.length === 0}
                  onSelect={(event) => {
                    // Keep the menu open so the spinner stays visible.
                    event.preventDefault();
                    void handleRunNow();
                  }}>
                  <RefreshCw className={cn(running && "animate-spin")} />
                  {running ? "Checking…" : "Run Check Now"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </TooltipDropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <RankingsTable
            rows={rows}
            startLabel={startLabel}
            latestLabel={latestLabel}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
          />
        </CardContent>
      </Card>

      <AddKeywordsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAdded={setData}
      />
    </div>
  );
}
