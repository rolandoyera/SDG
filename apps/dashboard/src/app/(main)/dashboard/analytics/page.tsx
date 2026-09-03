import { Suspense } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AcquisitionSection } from "./_components/acquisition-section";
import { AnalyticsConnectionDot } from "./_components/analytics-connection-dot";
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
import { ConnectionDotPending } from "@/components/connection-dot";
import { FadeIn } from "@/components/fade-in";
import { GA4Icon } from "@/components/icons/icons";
import { LoadingState } from "@/components/loading-state";
import PageHeader from "@/components/page-header";
import { PageTitle } from "@/components/page-title-updater";
import { fetchCampaignOptions } from "@/server/analytics-actions";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

// The campaign dropdown needs one GA4 report. Fetch it here, behind its own
// boundary, so the toolbar renders at once (date picker usable, dropdown
// hidden) and the options populate when the report lands.
async function CampaignToolbar({ range }: { range: string }) {
  const campaignOptions = await fetchCampaignOptions(range);
  return <AnalyticsToolbar campaignOptions={campaignOptions} />;
}

// Nothing above the Suspense boundaries awaits GA4, so the page shell
// (header, tabs, toolbar) streams immediately on navigation. Every section
// sits inside ONE boundary: a single spinner shows until the slowest query
// resolves, then all panels reveal together with a fade-in. Awaiting a fetch
// at this level would hold the previous route on screen until it finished.
export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const range = (resolvedSearchParams.range as string) || "today";
  const campaign = (resolvedSearchParams.campaign as string) || undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Analytics" />
      <div className="flex items-start gap-3">
        <GA4Icon className="mt-1.25" size={24} />
        <PageHeader
          title="Analytics"
          description="Remove the guesswork and follow the data."
          titleAccessory={
            <Suspense fallback={<ConnectionDotPending />}>
              <AnalyticsConnectionDot />
            </Suspense>
          }
        />
      </div>

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

          <Suspense fallback={<AnalyticsToolbar campaignOptions={[]} />}>
            <CampaignToolbar range={range} />
          </Suspense>
        </div>

        <Suspense fallback={<LoadingState label="Analytics" />}>
          <FadeIn>
            <TabsContent value="overview" className="flex flex-col gap-6">
              <AnalyticsKpiStrip range={range} campaign={campaign} />

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                <div className="md:col-span-1 lg:col-span-4">
                  <TrafficTrend range={range} campaign={campaign} />
                </div>
                <div className="md:col-span-1 lg:col-span-3">
                  <RealtimeVisitors />
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                <div className="md:col-span-1 lg:col-span-4">
                  <TopPages range={range} campaign={campaign} />
                </div>
                <div className="md:col-span-1 lg:col-span-3">
                  <TopTrafficSources range={range} campaign={campaign} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="audience">
              <AudienceSection range={range} campaign={campaign} />
            </TabsContent>

            <TabsContent value="acquisition">
              <AcquisitionSection range={range} campaign={campaign} />
            </TabsContent>

            <TabsContent value="engagement">
              <div className="grid gap-6 lg:grid-cols-2">
                <TopPages range={range} campaign={campaign} />
                <LandingPages range={range} campaign={campaign} />
              </div>
            </TabsContent>

            <TabsContent value="conversions">
              <ConversionsSection range={range} campaign={campaign} />
            </TabsContent>

            <TabsContent value="google">
              <GoogleSearchSection range={range} />
            </TabsContent>
          </FadeIn>
        </Suspense>
      </Tabs>
    </div>
  );
}
