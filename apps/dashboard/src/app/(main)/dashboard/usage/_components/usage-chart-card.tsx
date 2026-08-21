"use client";

import { useId, useState } from "react";

import { format } from "date-fns";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

export interface UsageSeries {
  key: string;
  label: string;
  color: string;
}

interface UsageChartCardProps {
  title: string;
  /** Caption under the chart, e.g. "Operations (per minute)". */
  caption: string;
  series: UsageSeries[];
  data: Record<string, number>[];
  /** "sum" totals the series (counts); "peak" takes its max (gauges); "last" reads the final point (cumulative series). */
  totalMode: "sum" | "peak" | "last";
  /** Window span, to pick time-only vs date tick labels. */
  rangeMs: number;
  loading: boolean;
  /** Grid span override; three-up rows pass "xl:col-span-4". */
  className?: string;
  /** Counts render as integers; currency renders USD and allows decimal ticks. */
  valueFormat?: "count" | "currency";
}

const DAY_MS = 86_400_000;

export function UsageChartCard({
  title,
  caption,
  series,
  data,
  totalMode,
  rangeMs,
  loading,
  className = "xl:col-span-6",
  valueFormat = "count",
}: UsageChartCardProps) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const idPrefix = useId();

  const toggle = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const chartConfig = Object.fromEntries(
    series.map((s) => [s.key, { label: s.label, color: s.color }]),
  ) satisfies ChartConfig;

  const totalOf = (key: string) => {
    if (totalMode === "last") {
      // Cumulative series may be padded with value-less future rows to extend
      // the axis — the total is the last row that actually has this key.
      for (let i = data.length - 1; i >= 0; i--) {
        const value = data[i][key];
        if (value !== undefined) return value;
      }
      return 0;
    }
    return totalMode === "sum"
      ? data.reduce((acc, row) => acc + (row[key] ?? 0), 0)
      : data.reduce((acc, row) => Math.max(acc, row[key] ?? 0), 0);
  };

  const tickFormat = rangeMs > DAY_MS ? "MMM d" : "h:mm a";
  const isCurrency = valueFormat === "currency";
  const formatValue = (value: number) =>
    isCurrency
      ? value.toLocaleString(undefined, {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
        })
      : value.toLocaleString();

  return (
    <Card variant="panel" className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col-reverse gap-6">
          <div className="flex justify-between">
            {series.map((s) => (
              <div key={s.key} className="flex flex-col gap-1.5">
                <span className="text-muted-foreground text-sm">{s.label}</span>
                <label
                  htmlFor={`${idPrefix}${s.key}`}
                  className="flex cursor-pointer items-center gap-2"
                >
                  <Checkbox
                    id={`${idPrefix}${s.key}`}
                    checked={!hidden.has(s.key)}
                    onCheckedChange={() => toggle(s.key)}
                    style={
                      hidden.has(s.key)
                        ? { borderColor: s.color }
                        : {
                            backgroundColor: s.color,
                            borderColor: s.color,
                          }
                    }
                  />
                  {loading ? (
                    <Skeleton className="h-6 w-12" />
                  ) : (
                    <span className="font-semibold text-xl tabular-nums">
                      {formatValue(totalOf(s.key))}
                    </span>
                  )}
                  <span className="text-muted-foreground text-xs">
                    {totalMode === "peak" ? "peak" : "total"}
                  </span>
                </label>
              </div>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            {loading ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <ChartContainer config={chartConfig} className="h-56 w-full">
                <LineChart
                  accessibilityLayer
                  data={data}
                  margin={{ bottom: 0, left: 0, right: 12, top: 8 }}
                >
                  <CartesianGrid vertical={false} strokeOpacity={0.4} />
                  <XAxis
                    dataKey="t"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={48}
                    tickFormatter={(t: number) => format(t, tickFormat)}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={4}
                    width={isCurrency ? 56 : 40}
                    allowDecimals={isCurrency}
                    tickFormatter={
                      isCurrency
                        ? (value: number) => formatValue(value)
                        : undefined
                    }
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        indicator="line"
                        labelFormatter={(_, payload) => {
                          const t = payload?.[0]?.payload?.t as
                            | number
                            | undefined;
                          return t ? format(t, "MMM d, h:mm a") : "";
                        }}
                      />
                    }
                  />
                  {series
                    .filter((s) => !hidden.has(s.key))
                    .map((s) => (
                      <Line
                        key={s.key}
                        dataKey={s.key}
                        type="monotone"
                        stroke={`var(--color-${s.key})`}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                </LineChart>
              </ChartContainer>
            )}
            <p className="mt-2 text-center text-muted-foreground text-xs">
              {caption}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
