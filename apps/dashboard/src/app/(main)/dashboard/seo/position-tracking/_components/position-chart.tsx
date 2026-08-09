"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

export interface PositionPoint {
  label: string;
  avgPosition: number;
}

const chartConfig = {
  avgPosition: {
    color: "var(--chart-1)",
    label: "Avg. Position",
  },
} satisfies ChartConfig;

/**
 * Average-position trend. Y axis is reversed (rank 1 on top) and the line
 * uses straight segments instead of the app's usual smoothing — rank moves
 * are step changes and read better sharp.
 */
export function PositionChart({ data }: { data: PositionPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="h-64 w-full">
      <LineChart
        accessibilityLayer
        data={data}
        margin={{ bottom: 0, left: 0, right: 12, top: 8 }}
      >
        <CartesianGrid vertical={false} strokeOpacity={0.4} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
        />
        <YAxis
          reversed
          domain={[1, "auto"]}
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
        <Line
          dataKey="avgPosition"
          type="linear"
          stroke="var(--color-avgPosition)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
