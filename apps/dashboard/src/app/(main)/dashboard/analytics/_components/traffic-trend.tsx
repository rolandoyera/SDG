import { Ellipsis } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchTrafficTrend } from "@/server/analytics-actions";

import { AnalyticsSetupRequired } from "./analytics-setup-required";
import { TrafficTrendChart } from "./traffic-trend-chart";

export async function TrafficTrend({
  range,
  campaign,
}: {
  range?: string;
  campaign?: string;
}) {
  const result = await fetchTrafficTrend(range, campaign);

  return (
    <Card variant="panel" className="h-full">
      <CardHeader>
        <CardTitle className="font-normal">Traffic Trend</CardTitle>
        <Ellipsis className="size-4" />
      </CardHeader>
      <CardContent>
        {!result.success ? (
          <AnalyticsSetupRequired
            error={result.error}
            title="Traffic Trend Error"
            className="h-64"
          />
        ) : result.data.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-1 text-center text-muted-foreground text-sm">
            No traffic data available for this range.
          </div>
        ) : (
          <TrafficTrendChart data={result.data} />
        )}
      </CardContent>
    </Card>
  );
}
