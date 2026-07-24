import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AcquisitionSection } from "./_components/acquisition-section";
import { AnalyticsKpiStrip } from "./_components/analytics-kpi-strip";
import { AnalyticsToolbar } from "./_components/analytics-toolbar";
import { AudienceSection } from "./_components/audience-section";
import { ConversionsSection } from "./_components/conversions-section";
import { GoogleSearchSection } from "./_components/google-search-section";
import { LandingPages } from "./_components/landing-pages";
import { RealtimeVisitors } from "./_components/realtime-visitors";
import { TopPages } from "./_components/top-pages";
import { TopTrafficSources } from "./_components/top-traffic-sources";
import { TrafficTrend } from "./_components/traffic-trend";

// Import this stylesheet in any page or component that renders country flag classes.
import "@/styles/flag-icons/flags.css";
import PageHeader from "@/components/page-header";
import { PageTitle } from "@/components/page-title-updater";
import { testGA4Connection } from "@/server/analytics-actions";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const range = (resolvedSearchParams.range as string) || "today";
  const connection = await testGA4Connection();
  const connected = connection.success;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Analytics" />
      <PageHeader
        title="Analytics"
        description="Remove the guesswork and follow the data."
        titleAccessory={
          <span
            role="img"
            className="relative flex size-2.5"
            title={connected ? "Connected" : "Not connected"}
            aria-label={connected ? "Connected" : "Not connected"}
          >
            <span
              className={`absolute inline-flex size-full animate-ping rounded-full opacity-75 ${
                connected ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span
              className={`relative inline-flex size-2.5 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
            />
          </span>
        }
      />

      <Tabs defaultValue="overview" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="audience">Audience</TabsTrigger>
            <TabsTrigger value="acquisition">Acquisition</TabsTrigger>
            <TabsTrigger value="engagement">Engagement</TabsTrigger>
            <TabsTrigger value="conversions">Conversions</TabsTrigger>
            <TabsTrigger value="google">Google</TabsTrigger>
          </TabsList>

          <AnalyticsToolbar />
        </div>

        <TabsContent value="overview" className="flex flex-col gap-6">
          <AnalyticsKpiStrip range={range} />

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
            <div className="md:col-span-1 lg:col-span-4">
              <TrafficTrend range={range} />
            </div>
            <div className="md:col-span-1 lg:col-span-3">
              <RealtimeVisitors />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
            <div className="md:col-span-1 lg:col-span-4">
              <TopPages range={range} />
            </div>
            <div className="md:col-span-1 lg:col-span-3">
              <TopTrafficSources range={range} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="audience">
          <AudienceSection range={range} />
        </TabsContent>

        <TabsContent value="acquisition">
          <AcquisitionSection range={range} />
        </TabsContent>

        <TabsContent value="engagement">
          <div className="grid gap-6 lg:grid-cols-2">
            <TopPages range={range} />
            <LandingPages range={range} />
          </div>
        </TabsContent>

        <TabsContent value="conversions">
          <ConversionsSection range={range} />
        </TabsContent>

        <TabsContent value="google">
          <GoogleSearchSection range={range} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
