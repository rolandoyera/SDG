import { Ellipsis } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAcquisitionData } from "@/server/analytics-actions";

import { AnalyticsSetupRequired } from "./analytics-setup-required";
import { ChannelsTable, SourceMediumTable } from "./acquisition-tables";

export async function AcquisitionSection({
  range,
  campaign,
}: {
  range?: string;
  campaign?: string;
}) {
  const result = await fetchAcquisitionData(range, campaign);

  if (!result.success || !result.data) {
    return (
      <div className="rounded bg-card shadow-xs ring-1 ring-foreground/5">
        <AnalyticsSetupRequired
          error={result.error}
          title="Acquisition Error"
          className="min-h-50"
        />
      </div>
    );
  }

  const { channels, sourceMedium } = result.data;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card variant="panel">
        <CardHeader>
          <CardTitle>Channels</CardTitle>
          <Ellipsis className="size-4" />
        </CardHeader>
        <CardContent className="flex flex-1 flex-col px-0 pt-0">
          <ChannelsTable data={channels} />
        </CardContent>
      </Card>

      <Card variant="panel">
        <CardHeader>
          <CardTitle>Source / Medium</CardTitle>
          <Ellipsis className="size-4" />
        </CardHeader>
        <CardContent className="flex flex-1 flex-col px-0 pt-0">
          <SourceMediumTable data={sourceMedium} />
        </CardContent>
      </Card>
    </div>
  );
}
