"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SiteCrawl } from "@/server/seo-actions";

/**
 * The two checks a single-page analyzer can't do: paragraph reuse between
 * pages and internal-link anchors repeated across source pages (each city
 * page should link to its hubs with a unique keyword anchor).
 */
const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;

/**
 * There are only so many ways to talk about interior design: overlap at this
 * level or below is accepted as normal. Pairs under it are hidden here, and
 * the table's Duplicate column shows a dash for pages that never exceed it.
 */
export const SIGNIFICANT_DUPLICATE_PERCENT = 15;

export function SiteChecks({ crawl }: { crawl: SiteCrawl }) {
  const duplicates = crawl.duplicatePhrases.filter(
    (finding) =>
      Math.round(finding.ratioA * 100) > SIGNIFICANT_DUPLICATE_PERCENT ||
      Math.round(finding.ratioB * 100) > SIGNIFICANT_DUPLICATE_PERCENT,
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="gap-2 pt-0">
        <CardHeader className="bg-muted/50 py-3">
          <CardTitle>Duplicated Content</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {duplicates.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No page-level duplicated content detected between pages.
            </p>
          ) : (
            duplicates.map((finding) => (
              <div
                key={`${finding.pageA}|${finding.pageB}`}
                className="flex flex-col gap-1"
              >
                <p className="font-medium text-sm">
                  {finding.pageA} ↔ {finding.pageB}
                </p>
                <p className="text-muted-foreground text-xs">
                  {percent(finding.ratioA)} of {finding.pageA},{" "}
                  {percent(finding.ratioB)} of {finding.pageB}
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
