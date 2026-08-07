import PageHeader from "@/components/page-header";
import { PageTitle } from "@/components/page-title-updater";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { CompareTab } from "./_components/compare-tab";
import { CrawlTab } from "./_components/crawl-tab";

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Keyword Analyzer" />
      <PageHeader
        title="Keyword Analyzer"
        description="Keyword reports for your pages — and your competitors'."
      />

      <Tabs defaultValue="compare" className="flex flex-col gap-6">
        <TabsList className="gap-1">
          <TabsTrigger value="compare">Page</TabsTrigger>
          <TabsTrigger value="crawl">Site</TabsTrigger>
        </TabsList>

        <TabsContent value="compare">
          <CompareTab />
        </TabsContent>

        <TabsContent value="crawl">
          <CrawlTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
