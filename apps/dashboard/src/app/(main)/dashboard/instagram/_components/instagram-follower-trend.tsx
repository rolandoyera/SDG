import { TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchInstagramFollowerTrend } from "@/server/meta-actions";

import { InstagramFollowerChart } from "./instagram-follower-chart";

export async function InstagramFollowerTrend({ range }: { range?: string }) {
  const result = await fetchInstagramFollowerTrend(range);

  if (!result.success || !result.data) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Followers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 items-center justify-center text-center text-muted-foreground text-sm">
            {result.error ?? "Couldn't load followers."}
          </div>
        </CardContent>
      </Card>
    );
  }

  const { points, netChange } = result.data;
  // A single snapshot can't draw a trend — treat it like no data.
  const hasData = points.length >= 2;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Followers</CardTitle>
        {hasData ? (
          <CardAction>
            {netChange === 0 ? (
              <span className="text-muted-foreground text-xs">No change</span>
            ) : (
              <Badge variant={netChange > 0 ? "trendingUp" : "trendingDown"}>
                {netChange > 0 ? <TrendingUp /> : <TrendingDown />}
                {netChange > 0 ? "+" : ""}
                {netChange.toLocaleString()}
              </Badge>
            )}
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!hasData ? (
          <div className="flex h-64 flex-col items-center justify-center gap-1 text-center text-muted-foreground text-sm">
            Not enough follower history in this range yet — the daily snapshot
            adds one point per day.
          </div>
        ) : (
          <InstagramFollowerChart data={points} />
        )}
      </CardContent>
    </Card>
  );
}
