"use client";

import { useTransition } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { FileDown, MoreVertical, RefreshCw } from "lucide-react";

import {
  type AppliedDateRange,
  DateRangePicker,
} from "@/components/date-range-picker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  TooltipDropdownMenu,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Radix Select items can't have an empty-string value, so "All campaigns"
// needs a sentinel; it maps to "no ?campaign= param" (no filter applied).
const ALL_CAMPAIGNS = "__all__";

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
    case "yesterday":
      return { from: daysAgo(1), to: daysAgo(1) };
    case "last-7-days":
      return { from: daysAgo(6), to: today };
    case "last-4-weeks":
      return { from: daysAgo(27), to: today };
    case "last-3-months":
      return { from: daysAgo(89), to: today };
    case "year-to-date":
      return { from: new Date(today.getFullYear(), 0, 1), to: today };
    default:
      return { from: today, to: today };
  }
}

/**
 * Encode picker dates into ?range=. Today/yesterday keep their named tokens so
 * GA4 resolves them in the property's timezone; anything else is explicit.
 */
function encodeRange({ from, to }: AppliedDateRange): string {
  const [start, end] = [toParam(from), toParam(to)];
  if (start === end) {
    if (start === toParam(startOfToday())) return "today";
    if (start === toParam(daysAgo(1))) return "yesterday";
  }
  return `${start}_${end}`;
}

export function AnalyticsToolbar({
  campaignOptions,
}: {
  campaignOptions: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isRefreshing, startRefresh] = useTransition();

  const currentRange = searchParams.get("range") || "today";
  const currentCampaign = searchParams.get("campaign") || "";

  // A campaign selected under another range may have no traffic in this one —
  // keep it listed so the trigger can still display it.
  const options =
    currentCampaign && !campaignOptions.includes(currentCampaign)
      ? [currentCampaign, ...campaignOptions]
      : campaignOptions;

  const handleRangeChange = (range: AppliedDateRange) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", encodeRange(range));
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleCampaignChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ALL_CAMPAIGNS) params.delete("campaign");
    else params.set("campaign", value);
    router.push(`${pathname}?${params.toString()}`);
  };

  const exportHref = `/reports/analytics?${new URLSearchParams({
    range: currentRange,
    ...(currentCampaign ? { campaign: currentCampaign } : {}),
  })}`;

  return (
    <div className="flex items-center gap-2">
      {options.length > 0 && (
        <Select
          value={currentCampaign || ALL_CAMPAIGNS}
          onValueChange={handleCampaignChange}
        >
          <SelectTrigger className="max-w-48">
            <SelectValue placeholder="Campaign" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL_CAMPAIGNS}>All campaigns</SelectItem>
              {options.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}

      <DateRangePicker
        value={decodeRange(currentRange)}
        onChange={handleRangeChange}
        presetKeys={[
          "today",
          "yesterday",
          "past-7-days",
          "past-30-days",
          "past-60-days",
          "past-90-days",
          "previous-month",
        ]}
      />

      <TooltipDropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreVertical className="size-4" />
            <span className="sr-only">Actions Menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => window.open(exportHref, "_blank")}>
            <FileDown />
            Export report
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isRefreshing}
            onSelect={(event) => {
              // Keep the menu from closing so the spinner stays visible while refreshing.
              event.preventDefault();
              startRefresh(() => router.refresh());
            }}
          >
            <RefreshCw className={cn(isRefreshing && "animate-spin")} />
            {isRefreshing ? "Refreshing…" : "Refresh metrics"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </TooltipDropdownMenu>
    </div>
  );
}
