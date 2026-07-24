"use client";

import { useTransition } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { FileDown, MoreVertical, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
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

export function AnalyticsToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isRefreshing, startRefresh] = useTransition();

  const currentRange = searchParams.get("range") || "today";

  const handleRangeChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", value);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={currentRange} onValueChange={handleRangeChange}>
        <SelectTrigger className="w-34">
          <SelectValue placeholder="Select range" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="yesterday">Yesterday</SelectItem>
            <SelectItem value="last-7-days">Last 7 days</SelectItem>
            <SelectItem value="last-4-weeks">Last 4 weeks</SelectItem>
            <SelectItem value="last-3-months">Last 3 months</SelectItem>
            <SelectItem value="year-to-date">Year to date</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <TooltipDropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreVertical className="size-4" />
            <span className="sr-only">Actions Menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onClick={() =>
              window.open(`/reports/analytics?range=${currentRange}`, "_blank")
            }
          >
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
