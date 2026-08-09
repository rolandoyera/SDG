"use client";

import { useState } from "react";

import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** An applied (complete) range — both ends always set. */
export interface AppliedDateRange {
  from: Date;
  to: Date;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysAgo(n: number): Date {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() - n);
  return d;
}

function sameDay(a: Date | undefined, b: Date | undefined): boolean {
  return (
    !!a &&
    !!b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function fmt(d: Date, withYear: boolean): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

/** "Jul 2 – Aug 9, 2026" (years shown only where needed). */
export function formatDateRange({ from, to }: AppliedDateRange): string {
  return `${fmt(from, from.getFullYear() !== to.getFullYear())} – ${fmt(to, true)}`;
}

/**
 * Shared date-range picker: two-month calendar plus quick presets, applied
 * only on "Apply" so browsing never disturbs the caller's state. Pass
 * `earliest` (first day with data) to enable the "All time" preset.
 */
export function DateRangePicker({
  value,
  onChange,
  earliest,
  align = "end",
  className,
}: {
  value: AppliedDateRange;
  onChange: (range: AppliedDateRange) => void;
  earliest?: Date;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(value);

  const today = startOfDay(new Date());
  const presets: { label: string; range: AppliedDateRange }[] = [
    { label: "Past 2 days", range: { from: daysAgo(1), to: today } },
    { label: "Past 7 days", range: { from: daysAgo(6), to: today } },
    { label: "Past 30 days", range: { from: daysAgo(29), to: today } },
    { label: "Past 60 days", range: { from: daysAgo(59), to: today } },
    { label: "Past 90 days", range: { from: daysAgo(89), to: today } },
    {
      label: "Previous month",
      range: {
        from: new Date(today.getFullYear(), today.getMonth() - 1, 1),
        to: new Date(today.getFullYear(), today.getMonth(), 0),
      },
    },
    ...(earliest
      ? [
          {
            label: "All time",
            range: { from: startOfDay(earliest), to: today },
          },
        ]
      : []),
  ];

  const apply = (range: AppliedDateRange) => {
    onChange(range);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(value);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("font-normal", className)}>
          <CalendarIcon className="size-4" />
          {formatDateRange(value)}
        </Button>
      </PopoverTrigger>
      {/* The shared PopoverContent stacks children (flex-col); force a row so
          the presets sit beside the calendar, SEMrush-style. */}
      <PopoverContent align={align} className="w-auto flex-row gap-0 p-0">
        <Calendar
          mode="range"
          numberOfMonths={2}
          showOutsideDays={false}
          selected={draft}
          onSelect={setDraft}
          defaultMonth={
            new Date(value.from.getFullYear(), value.from.getMonth(), 1)
          }
          disabled={{ after: today }}
          className="p-3"
        />
        <div className="flex w-40 flex-col gap-0.5 border-l p-3">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              variant="ghost"
              size="sm"
              className={cn(
                "justify-start font-normal",
                sameDay(draft?.from, preset.range.from) &&
                  sameDay(draft?.to, preset.range.to) &&
                  "bg-muted font-medium",
              )}
              onClick={() => setDraft(preset.range)}
            >
              {preset.label}
            </Button>
          ))}
          <div className="mt-auto flex items-center gap-2 pt-3">
            <Button
              size="sm"
              disabled={!draft?.from || !draft?.to}
              onClick={() => {
                if (draft?.from && draft?.to) {
                  apply({ from: draft.from, to: draft.to });
                }
              }}
            >
              Apply
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDraft(value)}>
              Reset
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
