"use client";

import { useState } from "react";

import { CalendarIcon } from "lucide-react";
import type { DateRange, Modifiers } from "react-day-picker";

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

/** "Jul 2 – Aug 9, 2026" (years shown only where needed); single days as "Aug 9, 2026". */
export function formatDateRange({ from, to }: AppliedDateRange): string {
  if (sameDay(from, to)) return fmt(to, true);
  return `${fmt(from, from.getFullYear() !== to.getFullYear())} – ${fmt(to, true)}`;
}

export type DateRangePresetKey =
  | "today"
  | "yesterday"
  | "past-2-days"
  | "past-7-days"
  | "past-30-days"
  | "past-60-days"
  | "past-90-days"
  | "this-month"
  | "previous-month";

const DEFAULT_PRESET_KEYS: DateRangePresetKey[] = [
  "past-2-days",
  "past-7-days",
  "past-30-days",
  "past-60-days",
  "past-90-days",
  "previous-month",
];

function presetFor(
  key: DateRangePresetKey,
  today: Date,
): { label: string; range: AppliedDateRange } {
  const presets: Record<
    DateRangePresetKey,
    { label: string; range: AppliedDateRange }
  > = {
    today: { label: "Today", range: { from: today, to: today } },
    yesterday: {
      label: "Yesterday",
      range: { from: daysAgo(1), to: daysAgo(1) },
    },
    "past-2-days": {
      label: "Past 2 days",
      range: { from: daysAgo(1), to: today },
    },
    "past-7-days": {
      label: "Past 7 days",
      range: { from: daysAgo(6), to: today },
    },
    "past-30-days": {
      label: "Past 30 days",
      range: { from: daysAgo(29), to: today },
    },
    "past-60-days": {
      label: "Past 60 days",
      range: { from: daysAgo(59), to: today },
    },
    "past-90-days": {
      label: "Past 90 days",
      range: { from: daysAgo(89), to: today },
    },
    "this-month": {
      label: "This month",
      range: {
        from: new Date(today.getFullYear(), today.getMonth(), 1),
        to: today,
      },
    },
    "previous-month": {
      label: "Previous month",
      range: {
        from: new Date(today.getFullYear(), today.getMonth() - 1, 1),
        to: new Date(today.getFullYear(), today.getMonth(), 0),
      },
    },
  };
  return presets[key];
}

/**
 * Shared date-range picker: two-month calendar plus quick presets. Presets
 * apply immediately; calendar selections apply only on "Apply" so browsing
 * never disturbs the caller's state. Pass `earliest` (first day with data)
 * to enable the "All time" preset.
 */
export function DateRangePicker({
  value,
  onChange,
  earliest,
  presetKeys = DEFAULT_PRESET_KEYS,
  align = "end",
  className,
}: {
  value: AppliedDateRange;
  onChange: (range: AppliedDateRange) => void;
  earliest?: Date;
  /** Which quick presets to offer, in order. Defaults to the past-N-days set. */
  presetKeys?: DateRangePresetKey[];
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(value);
  // Two-click selection: the first click anchors a single-day range (already
  // appliable); while it's set, hovering previews anchor→cursor and days
  // before the anchor are disabled. The second click completes the range.
  const [anchor, setAnchor] = useState<Date | undefined>(undefined);

  const today = startOfDay(new Date());

  const handleDayClick = (day: Date) => {
    if (anchor) {
      setDraft({ from: anchor, to: day });
      setAnchor(undefined);
    } else {
      setDraft({ from: day, to: day });
      setAnchor(day);
    }
  };

  const handleDayMouseEnter = (day: Date, modifiers: Modifiers) => {
    if (!anchor || modifiers.disabled) return;
    setDraft({ from: anchor, to: day });
  };
  const presets: { label: string; range: AppliedDateRange }[] = [
    ...presetKeys.map((key) => presetFor(key, today)),
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
        if (next) {
          setDraft(value);
          setAnchor(undefined);
        }
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
        {/* Leaving the grid mid-selection collapses the hover preview back to
            the anchored day, so moving to Apply applies just that day. */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: mouse-only hover-preview cleanup, not an interactive control — keyboard users never see hover previews. */}
        <div
          onMouseLeave={() => {
            if (anchor) setDraft({ from: anchor, to: anchor });
          }}
        >
          <Calendar
            mode="range"
            numberOfMonths={2}
            showOutsideDays={false}
            selected={draft}
            // Selection renders from `selected` only when an onSelect prop is
            // present (react-day-picker falls back to internal state without
            // one). The no-op keeps it controlled; onDayClick owns the logic.
            onSelect={() => undefined}
            onDayClick={handleDayClick}
            onDayMouseEnter={handleDayMouseEnter}
            defaultMonth={
              new Date(value.from.getFullYear(), value.from.getMonth(), 1)
            }
            disabled={
              anchor ? [{ after: today }, { before: anchor }] : { after: today }
            }
            className="p-3"
          />
        </div>
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
              onClick={() => {
                setAnchor(undefined);
                setDraft(preset.range);
                apply(preset.range);
              }}
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAnchor(undefined);
                setDraft(value);
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
