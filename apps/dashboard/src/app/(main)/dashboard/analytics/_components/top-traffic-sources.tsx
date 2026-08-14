import { Ellipsis } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchTrafficSources } from "@/server/analytics-actions";

import { AnalyticsSetupRequired } from "./analytics-setup-required";
import { TrafficSourceBarChart } from "./traffic-source-chart";

export async function TopTrafficSources({
  range,
  campaign,
}: {
  range?: string;
  campaign?: string;
}) {
  const result = await fetchTrafficSources(range, campaign);

  return (
    <Card className="h-full gap-2 pt-0">
      <CardHeader className="bg-muted/50 py-3">
        <CardTitle>Traffic Sources</CardTitle>
        <CardAction>
          <Ellipsis className="size-4" />
        </CardAction>
      </CardHeader>

      <CardContent className="px-0 pt-2">
        {!result.success || !result.data ? (
          <AnalyticsSetupRequired
            error={result.error}
            title="Traffic Sources Error"
            className="h-64"
          />
        ) : (
          <Tabs defaultValue="channels" className="flex flex-col gap-3">
            <TabsList
              className="w-full justify-start border-b px-2.5 pt-2"
              variant="line"
            >
              <TabsTrigger
                className="flex-none font-normal text-card-foreground! text-sm"
                value="channels"
              >
                Channels
              </TabsTrigger>
              <TabsTrigger
                className="flex-none font-normal text-card-foreground! text-sm"
                value="referrers"
              >
                Referrers
              </TabsTrigger>
              <TabsTrigger
                className="flex-none font-normal text-card-foreground! text-sm"
                value="campaigns"
              >
                Campaigns
              </TabsTrigger>
            </TabsList>

            <TabsContent value="channels" className="px-4">
              <TrafficSourceBarChart data={result.data.channels} />
            </TabsContent>

            <TabsContent value="referrers" className="px-4">
              <TrafficSourceBarChart data={result.data.sources} />
            </TabsContent>
            <TabsContent value="campaigns" className="px-4">
              <TrafficSourceBarChart data={result.data.campaigns} />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
