import PageHeader from "@/components/page-header";
import { PageTitle } from "@/components/page-title-updater";

import { PageAnalyzerClient } from "./_components/page-analyzer-client";

// A PSI run is a full Lighthouse audit on Google's side (~15–30s) — allow up
// to a minute. 60 is the ceiling on every Vercel plan, so this is safe.
export const maxDuration = 60;

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Page Analyzer" />
      <PageHeader
        title="Page Analyzer"
        description="Lighthouse scores and Core Web Vitals for any page — yours or a competitor's."
      />
      <PageAnalyzerClient />
    </div>
  );
}
