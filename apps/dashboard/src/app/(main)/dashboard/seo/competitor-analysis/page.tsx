import PageHeader from "@/components/page-header";
import { PageTitle } from "@/components/page-title-updater";

import { CompetitorsForm } from "./_components/competitors-form";

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Competitor Analysis" />
      <PageHeader
        title="Competitor Analysis"
        description="Keep your competitors on hand — the Keyword Analyzer can compare against any of them."
      />

      <CompetitorsForm />
    </div>
  );
}
