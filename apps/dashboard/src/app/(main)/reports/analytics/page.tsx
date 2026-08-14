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

/** Label for the picker's custom encoding ("YYYY-MM-DD_YYYY-MM-DD"). */
function customRangeLabel(range: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(range);
  if (!match) return null;
  const pretty = (value: string) =>
    new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  return match[1] === match[2]
    ? pretty(match[1])
    : `${pretty(match[1])} – ${pretty(match[2])}`;
}

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AnalyticsReportPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const range = (resolvedSearchParams.range as string) || "today";
  const campaign = (resolvedSearchParams.campaign as string) || undefined;
  const baseLabel =
    customRangeLabel(range) ?? RANGE_LABELS[range] ?? RANGE_LABELS.today;
  const rangeLabel = campaign ? `${baseLabel} · ${campaign}` : baseLabel;

  // The report consumes the same GA4 data as the dashboard, fetched here and
  // handed to the presentational document component.
  const [kpi, trend, topPages, trafficSources, audience] = await Promise.all([
    fetchKpiData(range, campaign),
    fetchTrafficTrend(range, campaign),
    fetchTopPagesData(range, campaign),
    fetchTrafficSources(range, campaign),
    fetchAudienceData(range, campaign),
  ]);

  return (
    <>
      <div className="report-no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur md:px-8">
        <Button asChild variant="ghost" size="sm">
          <Link
            href={`/dashboard/analytics?${new URLSearchParams({
              range,
              ...(campaign ? { campaign } : {}),
            })}`}
          >
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
