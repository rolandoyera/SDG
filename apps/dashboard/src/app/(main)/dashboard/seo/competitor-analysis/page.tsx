import { PageTitle } from "@/components/page-title-updater";

import { CompetitorsForm } from "./_components/competitors-form";

export default function Page() {
  return (
    <>
      <PageTitle title="Competitor Analysis" />
      <CompetitorsForm />
    </>
  );
}
