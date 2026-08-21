"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  type AppliedDateRange,
  DateRangePicker,
} from "@/components/date-range-picker";

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

const CUSTOM_RANGE = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/;
const LEGACY_DAYS: Record<string, number> = {
  "last-7-days": 7,
  "last-14-days": 14,
  "last-30-days": 30,
  "last-60-days": 60,
  "last-90-days": 90,
};

/** Decode ?range= ("from_to" or a legacy last-N-days name) into picker dates. */
function decodeRange(param: string): AppliedDateRange {
  const custom = CUSTOM_RANGE.exec(param);
  if (custom) return { from: fromParam(custom[1]), to: fromParam(custom[2]) };
  const days = LEGACY_DAYS[param] ?? 30;
  return { from: daysAgo(days - 1), to: startOfToday() };
}

export function InstagramToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentRange = searchParams.get("range") || "last-30-days";

  const handleRangeChange = ({ from, to }: AppliedDateRange) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", `${toParam(from)}_${toParam(to)}`);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <DateRangePicker
      value={decodeRange(currentRange)}
      onChange={handleRangeChange}
    />
  );
}
