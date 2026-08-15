"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { FollowerTrendPoint } from "@/server/meta-actions";

const chartConfig = {
  followers: {
    color: "var(--chart-2)",
    label: "Followers",
  },
} satisfies ChartConfig;

export function InstagramFollowerChart({
  data,
}: {
  data: FollowerTrendPoint[];
}) {
  return (
    <ChartContainer config={chartConfig} className="h-64 w-full">
      <AreaChart
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
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          width={40}
          allowDecimals={false}
          // A follower total is a level, not a flow — scale to the data's own
          // range so a +5 week reads as a climb, not a flat line above zero.
          domain={["auto", "auto"]}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent className="gap-2 px-3.5 py-3" />}
        />
        <Area
          dataKey="followers"
          type="monotone"
          fill="var(--color-followers)"
          fillOpacity={0.15}
          stroke="var(--color-followers)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
