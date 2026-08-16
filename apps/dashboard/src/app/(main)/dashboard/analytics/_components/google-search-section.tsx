import { Ellipsis } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Display,
  DisplayContent,
  DisplayHeader,
  DisplayTitle,
} from "@/components/ui/display";
import {
  fetchSearchTotals,
  fetchTopSearchPages,
  fetchTopSearchQueries,
} from "@/server/search-console-actions";

import { AnalyticsSetupRequired } from "./analytics-setup-required";
import { SearchPagesTable, SearchQueriesTable } from "./google-search-tables";

export async function GoogleSearchSection({ range }: { range?: string }) {
  const [totals, queries, pages] = await Promise.all([
    fetchSearchTotals(range),
    fetchTopSearchQueries(range),
    fetchTopSearchPages(range),
  ]);

  if (!totals.success && !queries.success && !pages.success) {
    return (
      <div className="rounded bg-card shadow-xs ring-1 ring-foreground/5">
        <AnalyticsSetupRequired
          error={totals.error}
          title="Search Console Error"
          className="min-h-50"
        />
      </div>
    );
  }

  const kpis = [
    { label: "Total Clicks", value: totals.data?.clicks ?? "—" },
    { label: "Impressions", value: totals.data?.impressions ?? "—" },
    { label: "Average CTR", value: totals.data?.ctr ?? "—" },
    { label: "Average Position", value: totals.data?.position ?? "—" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Display key={kpi.label}>
            <DisplayHeader>
              <DisplayTitle>{kpi.label}</DisplayTitle>
            </DisplayHeader>
            <DisplayContent>
              <div className="text-2xl leading-none tracking-tight tabular-nums">
                {kpi.value}
              </div>
            </DisplayContent>
          </Display>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top queries */}
        <Card variant="panel">
          <CardHeader>
            <CardTitle>Top Search Queries</CardTitle>
            <Ellipsis className="size-4" />
          </CardHeader>
          <CardContent className="flex flex-1 flex-col px-0 pt-0">
            {!queries.success ? (
              <AnalyticsSetupRequired
                error={queries.error}
                title="Queries Error"
                className="min-h-32"
              />
            ) : (
              <SearchQueriesTable data={queries.data} />
            )}
          </CardContent>
        </Card>

        {/* Top pages */}
        <Card variant="panel">
          <CardHeader>
            <CardTitle>Top Pages in Search</CardTitle>
            <Ellipsis className="size-4" />
          </CardHeader>
          <CardContent className="flex flex-1 flex-col px-0 pt-0">
            {!pages.success ? (
              <AnalyticsSetupRequired
                error={pages.error}
                title="Pages Error"
                className="min-h-32"
              />
            ) : (
              <SearchPagesTable data={pages.data} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
