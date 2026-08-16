import PageHeader from "@/components/page-header";
import { PageTitle } from "@/components/page-title-updater";

import { PageVitalsClient } from "./_components/page-vitals-client";

// A PSI run is a full Lighthouse audit on Google's side (~15–30s, sometimes
// far longer under load) — allow two minutes so a slow run can finish instead
// of aborting. Needs Fluid Compute (the default; Hobby classic caps at 60),
// where waiting on Google's API is idle time and billed as such.
export const maxDuration = 120;

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
