"use client";

import { useEffect, useState } from "react";

import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchCachedCrawl,
  fetchCompanyName,
  fetchCompetitors,
  type PageAnalysis,
  runSiteCrawl,
  type SeoCompetitor,
  type SiteCrawl,
  type SiteTarget,
} from "@/server/seo-actions";

import { CrawlTable } from "./crawl-table";
import { PageDetailDialog } from "./page-detail-dialog";
import { SiteChecks } from "./site-checks";

export function CrawlTab() {
  const [target, setTarget] = useState<SiteTarget>("live");
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [competitors, setCompetitors] = useState<SeoCompetitor[]>([]);
  const [crawl, setCrawl] = useState<SiteCrawl | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [detailPage, setDetailPage] = useState<PageAnalysis | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCompanyName()
      .then((result) => {
        if (!cancelled && result.success && result.data) {
          setCompanyName(result.data);
        }
      })
      .catch(() => {
        // Keep the "Live site" fallback label.
      });
    fetchCompetitors()
      .then((result) => {
        if (!cancelled && result.success && result.data) {
          setCompetitors(result.data);
        }
      })
      .catch(() => {
        // The target dropdown just won't list competitors.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Pull the server's cached crawl (if this instance has one) on mount and
  // whenever the target changes.
  useEffect(() => {
    let cancelled = false;
    setCrawl(null);
    fetchCachedCrawl(target)
      .then((result) => {
        if (!cancelled && result.success) {
          setCrawl(result.data ?? null);
        }
      })
      .catch(() => {
        // No cached crawl is a normal state; leave the empty-state card up.
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  // Calling a page an orphan needs a complete sitemap crawl. Link-following
  // can't reach a page nothing links to, so every page it finds has an inbound
  // link by construction; and once the cap drops pages, the link that would
  // have saved a page may well live on one we never fetched.
  const orphansKnown = crawl?.discovery === "sitemap" && crawl.skipped === 0;
  const orphanCount = orphansKnown
    ? Object.values(crawl.inboundLinks).filter((count) => count === 0).length
    : 0;

  const run = async () => {
    setRunning(true);
    setError("");
    const result = await runSiteCrawl(target);
    if (result.success && result.data) {
      setCrawl(result.data);
    } else {
      setError(result.error ?? "The crawl failed.");
    }
    setRunning(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={target}
          onValueChange={(value) => setTarget(value as SiteTarget)}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="live">{companyName ?? "Live site"}</SelectItem>
            <SelectItem value="local">Unpublished</SelectItem>
            {competitors.map((competitor, index) => (
              <SelectItem key={competitor.url} value={`comp:${index}`}>
                {competitor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={run} disabled={running}>
          {running && <Loader2 className="size-4 animate-spin" />}
          {running ? "Crawling…" : "Run Crawl"}
        </Button>

        {crawl && !running && (
          <p className="text-muted-foreground text-sm">
            Crawled {crawl.pages.length} pages{" "}
            {formatDistanceToNow(crawl.fetchedAt, { addSuffix: true })}
            {crawl.errors.length > 0 && ` · ${crawl.errors.length} failed`}
            {crawl.redirects.length > 0 &&
              ` · ${crawl.redirects.length} redirected`}
            {orphanCount > 0 && ` · ${orphanCount} orphaned`}
            {crawl.skipped > 0 &&
              ` · ${crawl.skipped} more in the sitemap not crawled`}
            {crawl.discovery === "links" &&
              " · no sitemap found, pages discovered by following links"}
          </p>
        )}
        {running && (
          <p className="text-muted-foreground text-sm">
            Fetching every sitemap page — this takes about half a minute.
          </p>
        )}
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>

      {crawl ? (
        <>
          <Card className="gap-2 pt-0">
            <CardHeader className="bg-muted/50 py-3">
              <CardTitle>Pages</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col px-0 pt-0">
              <CrawlTable
                pages={crawl.pages}
                duplicatePhrases={crawl.duplicatePhrases}
                inboundLinks={crawl.inboundLinks}
                flagOrphans={orphansKnown}
                onSelectPage={setDetailPage}
              />
            </CardContent>
          </Card>

          {crawl.errors.length > 0 && (
            <p className="text-muted-foreground text-sm">
              Failed to fetch:{" "}
              {crawl.errors.map((item) => item.path).join(", ")}
            </p>
          )}

          {crawl.redirects.length > 0 && (
            <p className="text-muted-foreground text-sm">
              Sitemap URLs that redirect (crawled where they land):{" "}
              {crawl.redirects
                .map((item) => `${item.path} → ${item.to}`)
                .join(", ")}
            </p>
          )}

          <SiteChecks crawl={crawl} />
        </>
      ) : (
        <Card>
          <CardContent className="flex h-40 items-center justify-center text-muted-foreground text-sm">
            {running
              ? "Crawling…"
              : "No crawl yet for this target — run one to build the report."}
          </CardContent>
        </Card>
      )}

      <PageDetailDialog page={detailPage} onClose={() => setDetailPage(null)} />
    </div>
  );
}
