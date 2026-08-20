"use client";

import { useTransition } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { RefreshCw } from "lucide-react";

import {
  type AppliedDateRange,
  DateRangePicker,
} from "@/components/date-range-picker";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CUSTOM_RANGE = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/;

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysAgo(n: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - n);
  return d;
}

/** Local date → "YYYY-MM-DD" (toISOString would shift across the UTC line). */
function toParam(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromParam(s: string): Date {
  const [year, month, day] = s.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Decode ?range= (named preset or "from_to") into picker dates. */
function decodeRange(param: string): AppliedDateRange {
  const custom = CUSTOM_RANGE.exec(param);
  if (custom) return { from: fromParam(custom[1]), to: fromParam(custom[2]) };
  const today = startOfToday();
  switch (param) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: daysAgo(1), to: daysAgo(1) };
    case "last-7-days":
      return { from: daysAgo(6), to: today };
    case "last-3-months":
      return { from: daysAgo(89), to: today };
    case "last-4-weeks":
      return { from: daysAgo(27), to: today };
    case "year-to-date":
      return { from: new Date(today.getFullYear(), 0, 1), to: today };
    default:
      // this-month — this page's default.
      return {
        from: new Date(today.getFullYear(), today.getMonth(), 1),
        to: today,
      };
  }
}

/**
 * Encode picker dates into ?range=. Today/yesterday keep their named tokens so
 * the server resolves them in the ads account's timezone; anything else is
 * explicit.
 */
function encodeRange({ from, to }: AppliedDateRange): string {
  const [start, end] = [toParam(from), toParam(to)];
  if (start === end) {
    if (start === toParam(startOfToday())) return "today";
    if (start === toParam(daysAgo(1))) return "yesterday";
  }
  return `${start}_${end}`;
}

export function AdsToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isRefreshing, startRefresh] = useTransition();

  const currentRange = searchParams.get("range") || "this-month";

  const handleRangeChange = (range: AppliedDateRange) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", encodeRange(range));
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <DateRangePicker
        value={decodeRange(currentRange)}
        onChange={handleRangeChange}
        presetKeys={[
          "today",
          "yesterday",
          "past-7-days",
          "past-30-days",
          "past-90-days",
          "this-month",
          "previous-month",
        ]}
      />

      <Button
        variant="ghost"
        size="icon"
        disabled={isRefreshing}
        onClick={() => startRefresh(() => router.refresh())}
      >
        <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
        <span className="sr-only">Refresh metrics</span>
      </Button>
    </div>
  );
}
