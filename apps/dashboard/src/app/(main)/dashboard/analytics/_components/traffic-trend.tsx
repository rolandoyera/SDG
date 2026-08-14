import { Ellipsis } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <Card className="h-full pt-0">
      <CardHeader className="bg-muted/50 py-3">
        <CardTitle className="font-normal">Traffic Trend</CardTitle>
        <CardAction>
          <Ellipsis className="size-4" />
        </CardAction>
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
