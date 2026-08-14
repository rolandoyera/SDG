import { Ellipsis } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchAdsTrend } from "@/server/google-ads-actions";

import { AnalyticsSetupRequired } from "../../analytics/_components/analytics-setup-required";
import { AdsTrendChart } from "./ads-trend-chart";

export async function AdsTrend({ range }: { range?: string }) {
  const result = await fetchAdsTrend(range);
  const hasActivity = result.data.some(
    (point) => point.cost > 0 || point.clicks > 0,
  );

  return (
    <Card className="h-full pt-0">
      <CardHeader className="bg-muted/50 py-3">
        <CardTitle className="font-normal">Spend & Clicks</CardTitle>
        <CardAction>
          <Ellipsis className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent>
        {!result.success ? (
          <AnalyticsSetupRequired
            error={result.error}
            title="Spend Trend Error"
            className="h-64"
          />
        ) : !hasActivity ? (
          <div className="flex h-64 flex-col items-center justify-center gap-1 text-center text-muted-foreground text-sm">
            No ad activity in this range.
          </div>
        ) : (
          <AdsTrendChart data={result.data} />
        )}
      </CardContent>
    </Card>
  );
}
