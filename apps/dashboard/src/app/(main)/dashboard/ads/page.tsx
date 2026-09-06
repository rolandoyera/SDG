import { Suspense } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ConnectionDotPending } from "@/components/connection-dot";
import { FadeIn } from "@/components/fade-in";
import { LoadingState } from "@/components/loading-state";
import PageHeader from "@/components/page-header";
import { PageTitle } from "@/components/page-title-updater";

import { AdsConnectionDot } from "./_components/ads-connection-dot";
import { AdsDevices } from "./_components/ads-devices";
import { AdsKpiStrip } from "./_components/ads-kpi-strip";
import {
  AdsCampaignsSection,
  AdsKeywordsSection,
  AdsLocationsSection,
  AdsSearchTermsSection,
  AdsZipLocationsSection,
} from "./_components/ads-table-sections";
import { AdsToolbar } from "./_components/ads-toolbar";
import { AdsTrend } from "./_components/ads-trend";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

// Nothing above the Suspense boundary awaits the Google Ads API, so the page
// shell (header, tabs, toolbar) streams immediately on navigation. Every
// section sits inside ONE boundary: a single spinner shows until the slowest
// query resolves, then all panels reveal together with a fade-in. Awaiting a
// fetch at this level would hold the previous route on screen until it
// finished.
export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const range = (resolvedSearchParams.range as string) || "this-month";

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Google Ads" />
      <PageHeader
        title="Google Ads"
        description="What the ad budget buys, in plain sight."
        titleAccessory={
          <Suspense fallback={<ConnectionDotPending />}>
            <AdsConnectionDot />
          </Suspense>
        }
      />

      <Tabs defaultValue="overview" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="search-terms">Search Terms</TabsTrigger>
            <TabsTrigger value="keywords">Keywords</TabsTrigger>
            <TabsTrigger value="locations">Locations</TabsTrigger>
          </TabsList>

          <AdsToolbar />
        </div>

        <Suspense
          fallback={
            <LoadingState
              label="Loading Google Ads"
              className="min-h-[calc(100svh-18rem)]"
            />
          }
        >
          <FadeIn>
            <TabsContent value="overview" className="flex flex-col gap-6">
              <AdsKpiStrip range={range} />

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                <div className="md:col-span-1 lg:col-span-4">
                  <AdsTrend range={range} />
                </div>
                <div className="md:col-span-1 lg:col-span-3">
                  <AdsDevices range={range} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="campaigns">
              <AdsCampaignsSection range={range} />
            </TabsContent>

            <TabsContent value="search-terms">
              <AdsSearchTermsSection range={range} />
            </TabsContent>

            <TabsContent value="keywords">
              <AdsKeywordsSection range={range} />
            </TabsContent>

            <TabsContent value="locations">
              <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
                <AdsLocationsSection range={range} />
                <AdsZipLocationsSection range={range} />
              </div>
            </TabsContent>
          </FadeIn>
        </Suspense>
      </Tabs>
    </div>
  );
}
