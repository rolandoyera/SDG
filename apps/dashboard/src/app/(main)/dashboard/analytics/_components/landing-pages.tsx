import { Ellipsis } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchLandingPages } from "@/server/analytics-actions";

import { AnalyticsSetupRequired } from "./analytics-setup-required";
import { LandingPagesTable } from "./landing-pages-table";

export async function LandingPages({
  range,
  campaign,
}: {
  range?: string;
  campaign?: string;
}) {
  const result = await fetchLandingPages(range, campaign);

  return (
    <Card variant="panel" className="h-full">
      <CardHeader>
        <CardTitle>Top Landing Pages</CardTitle>
        <Ellipsis className="size-4" />
      </CardHeader>

      <CardContent className="flex flex-1 flex-col px-0 pt-0">
        {!result.success ? (
          <AnalyticsSetupRequired
            error={result.error}
            title="Landing Pages Error"
            className="min-h-32"
          />
        ) : (
          <LandingPagesTable data={result.data} />
        )}
      </CardContent>
    </Card>
  );
}
