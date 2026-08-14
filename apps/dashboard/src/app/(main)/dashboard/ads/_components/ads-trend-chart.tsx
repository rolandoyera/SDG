"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { AdsTrendPoint } from "@/server/google-ads-actions";

const chartConfig = {
  cost: {
    color: "var(--chart-1)",
    label: "Spend",
  },
  clicks: {
    color: "var(--chart-3)",
    label: "Clicks",
  },
} satisfies ChartConfig;

export function AdsTrendChart({ data }: { data: AdsTrendPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="h-64 w-full">
      <AreaChart
        accessibilityLayer
        data={data}
        margin={{ bottom: 0, left: 0, right: 0, top: 8 }}
      >
        <CartesianGrid vertical={false} strokeOpacity={0.4} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
        />
        {/* Dollars and click counts live on different scales — two axes. */}
        <YAxis
          yAxisId="cost"
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          width={40}
          tickFormatter={(value: number) => `$${value}`}
        />
        <YAxis
          yAxisId="clicks"
          orientation="right"
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          width={32}
          allowDecimals={false}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent indicator="line" />}
        />
        <Area
          yAxisId="cost"
          dataKey="cost"
          type="monotone"
          fill="var(--color-cost)"
          fillOpacity={0.15}
          stroke="var(--color-cost)"
          strokeWidth={2}
        />
        <Area
          yAxisId="clicks"
          dataKey="clicks"
          type="monotone"
          fill="var(--color-clicks)"
          fillOpacity={0.1}
          stroke="var(--color-clicks)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
