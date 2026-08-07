import { HatchBarChart } from "@/components/charts/hatch-bar-chart";
import { ReportSection, ReportShell } from "@/components/reports/report-shell";
import type {
  AnalyticsKpis,
  AudienceData,
  KpiCardData,
  TopPageItem,
  TrafficSourcesData,
  TrendPoint,
} from "@/server/analytics-actions";

import { TrafficTrendChart } from "@/app/(main)/dashboard/analytics/_components/traffic-trend-chart";

const DEVICE_LABELS: Record<string, string> = {
  desktop: "Desktop",
  mobile: "Mobile",
  tablet: "Tablet",
  smarttv: "Smart TV",
};

export interface AnalyticsReportData {
  /** Human range, e.g. "Last 28 days". */
  rangeLabel: string;
  /** Comparison window label from the KPI fetch, e.g. "vs previous 28 days". */
  comparisonLabel?: string;
  kpis?: AnalyticsKpis;
  trend: TrendPoint[];
  topPages: TopPageItem[];
  trafficSources?: TrafficSourcesData;
  audience?: AudienceData;
}

const KPI_ORDER: { key: keyof AnalyticsKpis; label: string }[] = [
  { key: "uniqueVisitors", label: "Unique visitors" },
  { key: "visits", label: "Visits" },
  { key: "pageviews", label: "Pageviews" },
  { key: "engagementRate", label: "Engagement rate" },
  { key: "conversionRate", label: "Conversion rate" },
];

function Stat({ label, kpi }: { label: string; kpi: KpiCardData }) {
  return (
    <div className="flex flex-col gap-1 border-border border-l pl-4">
      <span className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </span>
      <span className="font-semibold text-2xl tabular-nums leading-none">
        {kpi.value}
      </span>
      <span
        className={
          kpi.isPositive
            ? "text-emerald-600 text-xs"
            : "text-destructive text-xs"
        }
      >
        {kpi.change}
      </span>
    </div>
  );
}

function EmptyNote({ children }: { children: string }) {
  return <p className="text-muted-foreground text-sm italic">{children}</p>;
}

/**
 * The Analytics document — a branded, client-facing report built from the same
 * GA4 data as the dashboard but with its own document layout, typography, and
 * chart sizing. Purely presentational: the `/reports/analytics` route fetches
 * the data and passes it in, mirroring how ProposalReport / InvoiceReport will
 * receive their data. Rendered inside the shared ReportShell.
 */
export function AnalyticsReport({ data }: { data: AnalyticsReportData }) {
  const {
    rangeLabel,
    comparisonLabel,
    kpis,
    trend,
    topPages,
    trafficSources,
    audience,
  } = data;
  const channels = trafficSources?.channels ?? [];
  const countries = audience?.countries ?? [];
  const devices = audience?.devices ?? [];

  return (
    <ReportShell title="Analytics Report" subtitle={rangeLabel}>
      <ReportSection
        title="Performance summary"
        description={
          comparisonLabel
            ? `Key metrics ${comparisonLabel}.`
            : "Key metrics for the selected period."
        }
      >
        {kpis ? (
          <div className="grid grid-cols-2 gap-6 md:grid-cols-5">
            {KPI_ORDER.map(({ key, label }) => (
              <Stat key={key} label={label} kpi={kpis[key]} />
            ))}
          </div>
        ) : (
          <EmptyNote>No metrics available for this period.</EmptyNote>
        )}
      </ReportSection>

      <ReportSection
        title="Traffic over time"
        description="Active users and sessions across the period."
      >
        {trend.length > 0 ? (
          <TrafficTrendChart data={trend} />
        ) : (
          <EmptyNote>No traffic recorded.</EmptyNote>
        )}
      </ReportSection>

      <ReportSection
        title="Top pages"
        description="Most-viewed pages, ranked by views."
        keepTogether={false}
        breakBefore
      >
        {topPages.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b text-left text-muted-foreground text-xs uppercase tracking-wide">
                <th className="py-2 font-medium">Page</th>
                <th className="py-2 text-right font-medium">Views</th>
                <th className="py-2 text-right font-medium">Avg. time</th>
                <th className="py-2 text-right font-medium">Bounce</th>
              </tr>
            </thead>
            <tbody>
              {/* The action now returns every page; the document shows the top 10. */}
              {topPages.slice(0, 10).map((page) => (
                <tr
                  key={page.path}
                  className="border-border/60 border-b last:border-0"
                >
                  <td className="max-w-[40ch] truncate py-2 font-medium">
                    {page.path}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {page.views.toLocaleString()}
                  </td>
                  <td className="py-2 text-right tabular-nums">{page.time}</td>
                  <td className="py-2 text-right tabular-nums">
                    {`${(page.bounceRate * 100).toFixed(0)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyNote>No page data for this period.</EmptyNote>
        )}
      </ReportSection>

      <div className="grid gap-12 lg:grid-cols-2">
        <ReportSection
          title="Top channels"
          description="Where visitors came from."
          keepTogether={false}
        >
          {channels.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b text-left text-muted-foreground text-xs uppercase tracking-wide">
                  <th className="py-2 font-medium">Channel</th>
                  <th className="py-2 text-right font-medium">Visitors</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((channel) => (
                  <tr
                    key={channel.source}
                    className="border-border/60 border-b last:border-0"
                  >
                    <td className="py-2 font-medium">{channel.source}</td>
                    <td className="py-2 text-right tabular-nums">
                      {channel.visitors.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyNote>No traffic-source data for this period.</EmptyNote>
          )}
        </ReportSection>

        <ReportSection
          title="Top countries"
          description="Visitors by country."
          keepTogether={false}
        >
          {countries.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border border-b text-left text-muted-foreground text-xs uppercase tracking-wide">
                  <th className="py-2 font-medium">Country</th>
                  <th className="py-2 text-right font-medium">Visitors</th>
                </tr>
              </thead>
              <tbody>
                {countries.slice(0, 10).map((country) => (
                  <tr
                    key={country.countryId || country.country}
                    className="border-border/60 border-b last:border-0"
                  >
                    <td className="py-2 font-medium">{country.country}</td>
                    <td className="py-2 text-right tabular-nums">
                      {country.users.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyNote>No audience data for this period.</EmptyNote>
          )}
        </ReportSection>
      </div>

      <ReportSection
        title="Devices"
        description="Visitors by device category."
        keepTogether={false}
      >
        {devices.length > 0 ? (
          <HatchBarChart
            seriesLabel="Users"
            showPercentage
            data={devices.map((device) => ({
              barText: DEVICE_LABELS[device.device] || device.device,
              value: device.users,
              valueLabel: String(device.users),
            }))}
          />
        ) : (
          <EmptyNote>No device data for this period.</EmptyNote>
        )}
      </ReportSection>
    </ReportShell>
  );
}
