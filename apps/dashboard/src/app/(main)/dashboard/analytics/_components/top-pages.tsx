import { Ellipsis } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchTopPagesData } from "@/server/analytics-actions";

import { AnalyticsSetupRequired } from "./analytics-setup-required";
import { TopPagesTable } from "./top-pages-table";

export async function TopPages({ range }: { range?: string }) {
  const result = await fetchTopPagesData(range);

  return (
    <Card className="h-full gap-2 pt-0">
      <CardHeader className="bg-muted/50 py-3">
        <CardTitle>Top Pages</CardTitle>
        <CardAction>
          <Ellipsis className="size-4" />
        </CardAction>
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
