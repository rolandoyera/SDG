import { TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Display,
  DisplayContent,
  DisplayFooter,
  DisplayHeader,
  DisplayTitle,
} from "@/components/ui/display";
import { Label } from "@/components/ui/label";
import { fetchAdsKpis } from "@/server/google-ads-actions";

import { AnalyticsSetupRequired } from "../../analytics/_components/analytics-setup-required";

export async function AdsKpiStrip({ range }: { range?: string }) {
  const result = await fetchAdsKpis(range);

  if (!result.success || !result.data) {
    return (
      <div className="rounded bg-card shadow-xs ring-1 ring-foreground/5">
        <AnalyticsSetupRequired
          error={result.error}
          title="Google Ads KPI Error"
          className="min-h-35"
        />
      </div>
    );
  }

  const { spend, clicks, ctr, avgCpc, conversions } = result.data;
  const labelText = result.comparisonLabel;

  // Spend and CPC going up are not wins — flip their badge color.
  const kpis = [
    { title: "Spend", metric: spend, upIsGood: false },
    { title: "Clicks", metric: clicks, upIsGood: true },
    { title: "CTR", metric: ctr, upIsGood: true },
    { title: "Avg. CPC", metric: avgCpc, upIsGood: false },
    { title: "Conversions", metric: conversions, upIsGood: true },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
      {kpis.map(({ title, metric, upIsGood }) => {
        const noChange = Number.parseFloat(metric.change) === 0;
        const isGood = metric.isPositive === upIsGood;

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
                  <Badge variant={isGood ? "trendingUp" : "trendingDown"}>
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
