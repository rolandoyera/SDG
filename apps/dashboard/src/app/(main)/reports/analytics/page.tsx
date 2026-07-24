import Link from "next/link";

import { ArrowLeft } from "lucide-react";

import { AnalyticsReport } from "@/components/reports/analytics/AnalyticsReport";
import { PrintReportButton } from "@/components/reports/print-button";
import { Button } from "@/components/ui/button";
import {
  fetchAudienceData,
  fetchKpiData,
  fetchTopPagesData,
  fetchTrafficSources,
  fetchTrafficTrend,
} from "@/server/analytics-actions";

const RANGE_LABELS: Record<string, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "last-7-days": "Last 7 days",
  "last-4-weeks": "Last 4 weeks",
  "last-3-months": "Last 3 months",
  "year-to-date": "Year to date",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AnalyticsReportPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const range = (resolvedSearchParams.range as string) || "today";
  const rangeLabel = RANGE_LABELS[range] ?? RANGE_LABELS.today;

  // The report consumes the same GA4 data as the dashboard, fetched here and
  // handed to the presentational document component.
  const [kpi, trend, topPages, trafficSources, audience] = await Promise.all([
    fetchKpiData(range),
    fetchTrafficTrend(range),
    fetchTopPagesData(range),
    fetchTrafficSources(range),
    fetchAudienceData(range),
  ]);

  return (
    <>
      <div className="report-no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur md:px-8">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/dashboard/analytics?range=${range}`}>
            <ArrowLeft className="size-4" />
            Back to analytics
          </Link>
        </Button>
        <PrintReportButton />
      </div>

      <AnalyticsReport
        data={{
          rangeLabel,
          comparisonLabel: kpi.comparisonLabel,
          kpis: kpi.success ? kpi.data : undefined,
          trend: trend.data,
          topPages: topPages.data,
          trafficSources: trafficSources.data,
          audience: audience.data,
        }}
      />
    </>
  );
}
