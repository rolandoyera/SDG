"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  type LabelProps,
  XAxis,
  YAxis,
} from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

export interface HatchBarDatum {
  /** Text shown inside the bar (e.g. a channel name or country code). */
  barText: string;
  /** Numeric value driving the bar width. */
  value: number;
  /** Text shown at the right end of the row. */
  valueLabel: string;
  /** Tooltip heading; falls back to `barText` when omitted. */
  tooltipLabel?: string;
  /** Country code for a flag rendered in the left gutter (e.g. "US"). */
  flagCode?: string;
}

const PATTERN_ID = "hatch-bar-background-pattern";
// Left gutter reserved for flags so rows align even when one has no flag (e.g. Unknown).
const FLAG_SLOT = 28;
const FLAG_HEIGHT = 14;
const FLAG_WIDTH = 21; // flags render at a 3:2 ratio

/**
 * Horizontal bar chart with the label rendered inside the bar, the value at the
 * right, and a 45° hatch pattern filling the unused portion of each bar.
 */
export function HatchBarChart({
  data,
  seriesLabel,
  barSize = 40,
  rowHeight = 56,
  showPercentage = false,
  className = "w-full",
  emptyMessage = "No data for this range.",
}: {
  data: HatchBarDatum[];
  seriesLabel: string;
  barSize?: number;
  /** Height per bar (bar + gap), keeps spacing constant regardless of count. */
  rowHeight?: number;
  /** Append each row's share of the total to the tooltip heading. */
  showPercentage?: boolean;
  className?: string;
  emptyMessage?: string;
}) {
  const config = {
    value: { color: "var(--chart-1)", label: seriesLabel },
  } satisfies ChartConfig;

  const renderValueLabel = (props: LabelProps) => {
    const { height, value, y } = props;

    return (
      <text
        className="fill-foreground"
        dominantBaseline="middle"
        dx={-6}
        fontSize={14}
        textAnchor="end"
        x="100%"
        y={Number(y) + Number(height) / 2}>
        {value}
      </text>
    );
  };

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
        {emptyMessage}
      </div>
    );
  }

  // YAxis category drives the tooltip's heading, so resolve the fallback up front.
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const rows = data.map((d) => ({
    ...d,
    tooltipLabel: d.tooltipLabel ?? d.barText,
    pct: total > 0 ? Math.round((d.value / total) * 100) : 0,
  }));

  const hasFlags = data.some((d) => d.flagCode !== undefined);

  const renderFlag = (props: LabelProps & { index?: number }) => {
    const { x, y, height, index } = props;
    if (typeof index !== "number") {
      return null;
    }

    const row = rows[index];
    if (!row?.flagCode) {
      return null;
    }

    return (
      <foreignObject
        x={Number(x) - FLAG_SLOT + 2}
        y={Number(y) + (Number(height) - FLAG_HEIGHT) / 2}
        width={FLAG_WIDTH}
        height={FLAG_HEIGHT}>
        <span
          aria-hidden="true"
          className={`flag:${row.flagCode} block rounded-xs ring-1 ring-foreground/5`}
          style={{ height: FLAG_HEIGHT, width: FLAG_WIDTH }}
        />
      </foreignObject>
    );
  };

  return (
    <ChartContainer
      config={config}
      className={className}
      style={{ height: rows.length * rowHeight }}>
      <BarChart
        accessibilityLayer
        data={rows}
        layout="vertical"
        margin={{ left: hasFlags ? FLAG_SLOT : 0, right: 48 }}>
        <defs>
          <pattern
            height="4"
            id={PATTERN_ID}
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
            width="4">
            <rect height="6" width="6" fill="var(--muted)" fillOpacity="0.5" />
            <line
              stroke="var(--muted-foreground)"
              strokeOpacity="0.10"
              strokeWidth="1.25"
              x1="0"
              x2="0"
              y1="0"
              y2="6"
            />
          </pattern>
        </defs>
        <CartesianGrid horizontal={false} vertical={false} />
        <YAxis
          dataKey="tooltipLabel"
          hide
          tickLine={false}
          tickMargin={10}
          type="category"
        />
        <XAxis dataKey="value" hide type="number" />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="line"
              labelFormatter={
                showPercentage
                  ? (value, payload) => {
                      const pct = payload?.[0]?.payload?.pct;
                      return (
                        <span>
                          {value as string}
                          {typeof pct === "number" && (
                            <span className="ml-1 text-muted-foreground">
                              ({pct}%)
                            </span>
                          )}
                        </span>
                      );
                    }
                  : undefined
              }
            />
          }
        />
        <Bar
          background={{ fill: `url(#${PATTERN_ID})`, radius: 8 }}
          barSize={barSize}
          dataKey="value"
          fill="var(--color-value)"
          fillOpacity={0.5}
          radius={8}>
          <LabelList
            className="fill-foreground"
            dataKey="barText"
            fontSize={14}
            offset={12}
            position="insideLeft"
          />
          {hasFlags && <LabelList content={renderFlag} dataKey="flagCode" />}
          <LabelList content={renderValueLabel} dataKey="valueLabel" />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
