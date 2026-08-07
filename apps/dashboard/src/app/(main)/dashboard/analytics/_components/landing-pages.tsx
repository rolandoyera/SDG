import { Ellipsis } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchLandingPages } from "@/server/analytics-actions";

import { AnalyticsSetupRequired } from "./analytics-setup-required";
import { LandingPagesTable } from "./landing-pages-table";

export async function LandingPages({ range }: { range?: string }) {
  const result = await fetchLandingPages(range);

  return (
    <Card className="h-full gap-2 pt-0">
      <CardHeader className="bg-muted/50 py-3">
        <CardTitle>Top Landing Pages</CardTitle>
        <CardAction>
          <Ellipsis className="size-4" />
        </CardAction>
      </CardHeader>

      <CardContent className="px-0">
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
