import { Ellipsis } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchAcquisitionData } from "@/server/analytics-actions";

import { AnalyticsSetupRequired } from "./analytics-setup-required";
import { ChannelsTable, SourceMediumTable } from "./acquisition-tables";

export async function AcquisitionSection({ range }: { range?: string }) {
  const result = await fetchAcquisitionData(range);

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
      <Card className="gap-2 pt-0">
        <CardHeader className="bg-muted/50 py-3">
          <CardTitle>Channels</CardTitle>
          <CardAction>
            <Ellipsis className="size-4" />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col px-0 pt-0">
          <ChannelsTable data={channels} />
        </CardContent>
      </Card>

      <Card className="gap-2 pt-0">
        <CardHeader className="bg-muted/50 py-3">
          <CardTitle>Source / Medium</CardTitle>
          <CardAction>
            <Ellipsis className="size-4" />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col px-0 pt-0">
          <SourceMediumTable data={sourceMedium} />
        </CardContent>
      </Card>
    </div>
  );
}
