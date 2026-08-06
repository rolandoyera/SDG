import { TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Display,
  DisplayContent,
  DisplayFooter,
  DisplayHeader,
  DisplayTitle,
} from "@/components/ui/display";
import { fetchKpiData } from "@/server/analytics-actions";

import { AnalyticsSetupRequired } from "./analytics-setup-required";
import { Label } from "@/components/ui/label";

interface AnalyticsKpiStripProps {
  range?: string;
}

export async function AnalyticsKpiStrip({
  range = "today",
}: AnalyticsKpiStripProps) {
  const result = await fetchKpiData(range);

  if (!result.success || !result.data) {
    return (
      <div className="rounded bg-card shadow-xs ring-1 ring-foreground/10">
        <AnalyticsSetupRequired
          error={result.error}
          title="Analytics KPI Error"
          className="min-h-35"
        />
      </div>
    );
  }

  const {
    uniqueVisitors,
    visitors,
    pageviews,
    engagementRate,
    conversionRate,
  } = result.data;
  const labelText = result.comparisonLabel;

  const kpis = [
    { title: "Unique Visitors", metric: uniqueVisitors },
    { title: "Visitors", metric: visitors },
    { title: "Pageviews", metric: pageviews },
    { title: "Engagement Rate", metric: engagementRate },
    { title: "Conversion Rate", metric: conversionRate },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
      {kpis.map(({ title, metric }) => {
        const noChange = Number.parseFloat(metric.change) === 0;

        return (
          <Display key={title}>
            <DisplayHeader>
              <DisplayTitle>{title}</DisplayTitle>
            </DisplayHeader>
            <DisplayContent>
              <div className="flex items-center justify-between gap-4">
                <div className="text-2xl leading-none tracking-tight">
                  {metric.value}
                </div>
                {noChange ? (
                  <span className="text-muted-foreground text-xs">
                    No change
                  </span>
                ) : (
                  <Badge
                    variant={metric.isPositive ? "trendingUp" : "trendingDown"}>
                    {metric.isPositive ? <TrendingUp /> : <TrendingDown />}
                    {metric.change}
                  </Badge>
                )}
              </div>
            </DisplayContent>
            <DisplayFooter>
              <Label>
                vs{" "}
                <span className="text-base text-card-foreground">
                  {metric.previousValue}
                </span>{" "}
                {labelText}
              </Label>
            </DisplayFooter>
          </Display>
        );
      })}
    </div>
  );
}
