import { Ellipsis } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchAdsDevices } from "@/server/google-ads-actions";

import { AnalyticsSetupRequired } from "../../analytics/_components/analytics-setup-required";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export async function AdsDevices({ range }: { range?: string }) {
  const result = await fetchAdsDevices(range);
  const totalCost = result.data.reduce((sum, row) => sum + row.cost, 0);

  return (
    <Card className="h-full pt-0">
      <CardHeader className="bg-muted/50 py-3">
        <CardTitle className="font-normal">Devices</CardTitle>
        <CardAction>
          <Ellipsis className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent>
        {!result.success ? (
          <AnalyticsSetupRequired
            error={result.error}
            title="Devices Error"
            className="h-64"
          />
        ) : result.data.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-1 text-center text-muted-foreground text-sm">
            No device data available for this range.
          </div>
        ) : (
          <div className="flex flex-col divide-y">
            {result.data.map((row) => (
              <div
                key={row.device}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{row.device}</span>
                  <span className="text-muted-foreground text-xs">
                    {row.clicks.toLocaleString()} clicks ·{" "}
                    {row.impressions.toLocaleString()} impr.
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm tabular-nums">
                    {usd.format(row.cost)}
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {totalCost > 0
                      ? `${((row.cost / totalCost) * 100).toFixed(0)}% of spend`
                      : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
