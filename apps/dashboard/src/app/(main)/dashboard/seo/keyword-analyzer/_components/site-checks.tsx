"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SiteCrawl } from "@/server/seo-actions";

/**
 * The two checks a single-page analyzer can't do: paragraph reuse between
 * pages and internal-link anchors repeated across source pages (each city
 * page should link to its hubs with a unique keyword anchor).
 */
const PREVIEW_WORDS = 14;

function preview(text: string) {
  const words = text.split(" ");
  if (words.length <= PREVIEW_WORDS) return text;
  return `${words.slice(0, PREVIEW_WORDS).join(" ")}…`;
}

const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;

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
              No page-level duplicated content detected between pages.
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
                  {finding.sharedWords} words copied across{" "}
                  {finding.passageCount}{" "}
                  {finding.passageCount === 1 ? "passage" : "passages"} ·{" "}
                  {percent(finding.ratioA)} of {finding.pageA},{" "}
                  {percent(finding.ratioB)} of {finding.pageB}
                </p>
                {finding.passages.map((passage) => (
                  <p
                    key={passage.text}
                    className="text-muted-foreground/80 text-xs italic"
                  >
                    {passage.words} words: “{preview(passage.text)}”
                  </p>
                ))}
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
