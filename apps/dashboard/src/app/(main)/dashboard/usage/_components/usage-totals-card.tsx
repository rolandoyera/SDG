"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface UsageTotalSeries {
  key: string;
  label: string;
  color: string;
}

interface UsageTotalsCardProps {
  title: string;
  /** Caption under the totals, e.g. "Operations". */
  caption: string;
  series: UsageTotalSeries[];
  values: Record<string, number>;
  /** "sum" totals over the period (counts); "peak" is the max (gauges). */
  mode: "sum" | "peak";
  loading: boolean;
}

export function UsageTotalsCard({
  title,
  caption,
  series,
  values,
  mode,
  loading,
}: UsageTotalsCardProps) {
  return (
    <Card variant="panel" className="xl:col-span-6">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
          {series.map((s) => (
            <div key={s.key} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-muted-foreground text-sm">{s.label}</span>
              </div>
              {loading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <span className="font-semibold text-2xl tabular-nums">
                  {(values[s.key] ?? 0).toLocaleString()}
                </span>
              )}
              <span className="text-muted-foreground text-xs">
                {mode === "sum" ? "total" : "peak"}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-muted-foreground text-xs">{caption}</p>
      </CardContent>
    </Card>
  );
}
