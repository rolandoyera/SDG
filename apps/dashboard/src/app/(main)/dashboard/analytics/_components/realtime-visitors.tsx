import { Ellipsis } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchRealtimeData } from "@/server/analytics-actions";

import { AnalyticsSetupRequired } from "./analytics-setup-required";
import { RealtimeCard } from "./realtime-card";

export async function RealtimeVisitors() {
  const result = await fetchRealtimeData();

  if (!result.success || !result.data) {
    return (
      <Card variant="panel" className="h-full">
        <CardHeader>
          <CardTitle>Realtime Visitors</CardTitle>
          <Ellipsis className="size-4" />
        </CardHeader>
        <CardContent>
          <AnalyticsSetupRequired
            error={result.error}
            title="Realtime Visitors Error"
            className="h-64"
          />
        </CardContent>
      </Card>
    );
  }

  // Hand the SSR snapshot to the client card, which keeps it live by polling.
  return <RealtimeCard initialData={result.data} />;
}
