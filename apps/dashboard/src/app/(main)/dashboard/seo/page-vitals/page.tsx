import PageHeader from "@/components/page-header";
import { PageTitle } from "@/components/page-title-updater";

import { PageVitalsClient } from "./_components/page-vitals-client";

// A PSI run is a full Lighthouse audit on Google's side (~15–30s) — allow up
// to a minute. 60 is the ceiling on every Vercel plan, so this is safe.
export const maxDuration = 60;

export default function Page() {
  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      <PageTitle title="Page Vitals" />
      <PageHeader
        title="Page Vitals"
        description="Core Web Vitals for your website pages."
      />
      <PageVitalsClient />
    </div>
  );
}
