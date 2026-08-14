import { Ellipsis } from "lucide-react";
import type { ReactNode } from "react";

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  fetchAdsCampaigns,
  fetchAdsKeywords,
  fetchAdsLocations,
  fetchAdsSearchTerms,
} from "@/server/google-ads-actions";

import { AnalyticsSetupRequired } from "../../analytics/_components/analytics-setup-required";
import {
  AdsCampaignsTable,
  AdsKeywordsTable,
  AdsLocationsTable,
  AdsSearchTermsTable,
} from "./ads-tables";

function TableCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="gap-2 pt-0 pb-0">
      <CardHeader className="bg-muted/50 py-3">
        <CardTitle>{title}</CardTitle>
        <CardAction>
          <Ellipsis className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-0 pt-0">
        {children}
      </CardContent>
    </Card>
  );
}

export async function AdsCampaignsSection({ range }: { range?: string }) {
  const result = await fetchAdsCampaigns(range);
  return (
    <TableCard title="Campaigns">
      {!result.success ? (
        <AnalyticsSetupRequired
          error={result.error}
          title="Campaigns Error"
          className="min-h-32"
        />
      ) : (
        <AdsCampaignsTable data={result.data} />
      )}
    </TableCard>
  );
}

export async function AdsSearchTermsSection({ range }: { range?: string }) {
  const result = await fetchAdsSearchTerms(range);
  return (
    <TableCard title="Search Terms">
      {!result.success ? (
        <AnalyticsSetupRequired
          error={result.error}
          title="Search Terms Error"
          className="min-h-32"
        />
      ) : (
        <AdsSearchTermsTable data={result.data} />
      )}
    </TableCard>
  );
}

export async function AdsKeywordsSection({ range }: { range?: string }) {
  const result = await fetchAdsKeywords(range);
  return (
    <TableCard title="Keywords">
      {!result.success ? (
        <AnalyticsSetupRequired
          error={result.error}
          title="Keywords Error"
          className="min-h-32"
        />
      ) : (
        <AdsKeywordsTable data={result.data} />
      )}
    </TableCard>
  );
}

export async function AdsLocationsSection({ range }: { range?: string }) {
  const result = await fetchAdsLocations(range);
  return (
    <TableCard title="Where Your Ads Were Seen">
      {!result.success ? (
        <AnalyticsSetupRequired
          error={result.error}
          title="Locations Error"
          className="min-h-32"
        />
      ) : (
        <AdsLocationsTable data={result.data} />
      )}
    </TableCard>
  );
}
