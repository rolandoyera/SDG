import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import PageHeader from "@/components/page-header";
import { PageTitle } from "@/components/page-title-updater";
import { testGoogleAdsConnection } from "@/server/google-ads-actions";

import { AdsDevices } from "./_components/ads-devices";
import { AdsKpiStrip } from "./_components/ads-kpi-strip";
import {
  AdsCampaignsSection,
  AdsKeywordsSection,
  AdsLocationsSection,
  AdsSearchTermsSection,
} from "./_components/ads-table-sections";
import { AdsToolbar } from "./_components/ads-toolbar";
import { AdsTrend } from "./_components/ads-trend";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  // Default to 4 weeks, not "today" — Ads reporting (search terms especially)
  // lags, so a same-day default would render mostly empty tables.
  const range = (resolvedSearchParams.range as string) || "last-4-weeks";
  const connection = await testGoogleAdsConnection();
  const connected = connection.success;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Google Ads" />
      <PageHeader
        title="Google Ads"
        description="What the ad budget buys, in plain sight."
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
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="search-terms">Search Terms</TabsTrigger>
            <TabsTrigger value="keywords">Keywords</TabsTrigger>
            <TabsTrigger value="locations">Locations</TabsTrigger>
          </TabsList>

          <AdsToolbar />
        </div>

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
          <AdsLocationsSection range={range} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
