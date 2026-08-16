import { Ellipsis } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchTopPagesData } from "@/server/analytics-actions";

import { AnalyticsSetupRequired } from "./analytics-setup-required";
import { TopPagesTable } from "./top-pages-table";

export async function TopPages({
  range,
  campaign,
}: {
  range?: string;
  campaign?: string;
}) {
  const result = await fetchTopPagesData(range, campaign);

  return (
    <Card variant="panel" className="h-full">
      <CardHeader>
        <CardTitle>Top Pages</CardTitle>
        <Ellipsis className="size-4" />
      </CardHeader>

      <CardContent className="flex flex-1 flex-col px-0 pt-0">
        {!result.success ? (
          <AnalyticsSetupRequired
            error={result.error}
            title="Page Performance Error"
            className="min-h-32"
          />
        ) : (
          <TopPagesTable data={result.data} />
        )}
      </CardContent>
    </Card>
  );
}
