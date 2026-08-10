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

      <Tabs defaultValue="page" className="flex flex-col gap-6">
        <TabsList className="gap-1">
          <TabsTrigger value="page">Page</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
          <TabsTrigger value="crawl">Site</TabsTrigger>
        </TabsList>

        {/* forceMount keeps the inactive tabs alive so switching tabs doesn't
            wipe their results; with forceMount Radix leaves hiding to us. */}
        <TabsContent
          value="page"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <CompareTab single />
        </TabsContent>

        <TabsContent
          value="compare"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <CompareTab />
        </TabsContent>

        <TabsContent
          value="crawl"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <CrawlTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
