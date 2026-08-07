"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SiteCrawl } from "@/server/seo-actions";

/**
 * The two checks a single-page analyzer can't do: paragraph reuse between
 * pages and internal-link anchors repeated across source pages (each city
 * page should link to its hubs with a unique keyword anchor).
 */
export function SiteChecks({ crawl }: { crawl: SiteCrawl }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="gap-2 pt-0">
        <CardHeader className="bg-muted/50 py-3">
          <CardTitle>Duplicated Content</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {crawl.duplicatePhrases.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No duplicated content runs detected between pages.
            </p>
          ) : (
            crawl.duplicatePhrases.map((finding) => (
              <div
                key={`${finding.pageA}|${finding.pageB}`}
                className="flex flex-col gap-1"
              >
                <p className="font-medium text-sm">
                  {finding.pageA} ↔ {finding.pageB}
                </p>
                <p className="text-muted-foreground text-xs">
                  {finding.count} shared 8-word{" "}
                  {finding.count === 1 ? "run" : "runs"} · “{finding.sample}…”
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="gap-2 pt-0">
        <CardHeader className="bg-muted/50 py-3">
          <CardTitle>Repeated Link Anchors</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {crawl.anchorReuse.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No internal link target is reached with the same anchor text from
              multiple pages.
            </p>
          ) : (
            crawl.anchorReuse.map((finding) => (
              <div key={finding.target} className="flex flex-col gap-1">
                <p className="font-medium text-sm">{finding.target}</p>
                {finding.anchors.map((anchor) => (
                  <p
                    key={anchor.text}
                    className="text-muted-foreground text-xs"
                  >
                    “{anchor.text}” used by {anchor.sources.length} pages:{" "}
                    {anchor.sources.join(", ")}
                  </p>
                ))}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
