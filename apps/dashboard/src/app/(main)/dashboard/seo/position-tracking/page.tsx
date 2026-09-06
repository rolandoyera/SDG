import { PageTitle } from "@/components/page-title-updater";

import { PositionTrackingClient } from "./_components/position-tracking-client";

// "Add & Check" and "Run Check Now" run live SERP checks (~6s each, 5 at a
// time) through this page's server actions — allow two minutes. Needs Fluid
// Compute (the default; Hobby classic caps at 60).
export const maxDuration = 120;

export default function Page() {
  return (
    <>
      <PageTitle title="Position Tracking" />
      <PositionTrackingClient />
    </>
  );
}
