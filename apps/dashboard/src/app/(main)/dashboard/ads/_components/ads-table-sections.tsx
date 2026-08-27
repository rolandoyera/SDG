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
import { TableCard } from "./table-card";

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

  // The only section that doesn't own its card: the header search box needs the
  // table instance, so the table component renders the whole card itself.
  if (!result.success)
    return (
      <TableCard title="Search Terms">
        <AnalyticsSetupRequired
          error={result.error}
          title="Search Terms Error"
          className="min-h-32"
        />
      </TableCard>
    );

  return <AdsSearchTermsTable data={result.data} />;
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
    <TableCard title="By City">
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

export async function AdsZipLocationsSection({ range }: { range?: string }) {
  const result = await fetchAdsLocations(range, "zip");
  return (
    <TableCard title="By ZIP Code">
      {!result.success ? (
        <AnalyticsSetupRequired
          error={result.error}
          title="Locations Error"
          className="min-h-32"
        />
      ) : (
        <AdsLocationsTable data={result.data} locationHeader="ZIP" />
      )}
    </TableCard>
  );
}
