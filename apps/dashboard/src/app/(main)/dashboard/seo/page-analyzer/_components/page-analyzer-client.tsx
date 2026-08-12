"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { SearchSelect } from "@/components/search-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  fetchCachedPagespeed,
  type PagespeedReport,
  runPagespeed,
} from "@/server/pagespeed-actions";
import {
  fetchCompanyName,
  fetchCompetitors,
  fetchSitemapForUrl,
  fetchSitemapPages,
  type SeoCompetitor,
} from "@/server/seo-actions";

// PSI only audits public URLs (Google fetches the page), so no
// local/"Unpublished" source here.
const baseSchema = z.object({
  source: z.string().regex(/^(live|custom|comp:\d+)$/),
  path: z.string(),
  url: z.string().trim(),
  strategy: z.enum(["mobile", "desktop"]),
});

const formSchema = baseSchema.superRefine((data, ctx) => {
  if (data.source === "custom") {
    if (!data.url) {
      ctx.addIssue({ code: "custom", path: ["url"], message: "Enter a URL." });
    }
  } else if (!data.path.trim()) {
    ctx.addIssue({ code: "custom", path: ["path"], message: "Pick a page." });
  }
});

type FormData = z.infer<typeof formSchema>;

const DEFAULTS: FormData = {
  source: "live",
  path: "",
  url: "",
  strategy: "mobile",
};

const STORAGE_KEY = "seo-pagespeed";

type SitemapState =
  | { status: "loading" }
  | { status: "ready"; paths: string[] }
  | { status: "error"; error: string };

/** Lighthouse's own bands: 90+ good, 50–89 needs work, below is failing. */
function scoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 90) return "text-green-600 dark:text-green-400";
  if (score >= 50) return "text-yellow-700 dark:text-yellow-300";
  return "text-destructive dark:text-red-400";
}

const FIELD_CATEGORY: Record<string, { label: string; className: string }> = {
  FAST: { label: "Good", className: "text-green-600 dark:text-green-400" },
  AVERAGE: {
    label: "Needs improvement",
    className: "text-yellow-700 dark:text-yellow-300",
  },
  SLOW: { label: "Poor", className: "text-destructive dark:text-red-400" },
};

export function PageAnalyzerClient() {
  const { control, handleSubmit, watch, reset } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULTS,
  });
  const source = watch("source");

  const [companyName, setCompanyName] = useState<string | null>(null);
  const [competitors, setCompetitors] = useState<SeoCompetitor[]>([]);
  const [competitorsReady, setCompetitorsReady] = useState(false);
  const [sitemaps, setSitemaps] = useState<Record<string, SitemapState>>({});
  const [report, setReport] = useState<PagespeedReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingRestore, setPendingRestore] = useState<FormData | null>(null);

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
        // The source dropdown just won't list competitors.
      })
      .finally(() => {
        if (!cancelled) setCompetitorsReady(true);
      });
    try {
      const saved = baseSchema.safeParse(
        JSON.parse(localStorage.getItem(STORAGE_KEY) ?? ""),
      );
      if (saved.success) setPendingRestore(saved.data);
    } catch {
      // Nothing saved yet.
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the sitemap for the picked source (once per source).
  useEffect(() => {
    const isCompetitor = source.startsWith("comp:");
    if (source !== "live" && !isCompetitor) return;
    if (isCompetitor && !competitors[Number(source.slice(5))]) return;
    if (sitemaps[source]) return;

    setSitemaps((prev) => ({ ...prev, [source]: { status: "loading" } }));
    const request = isCompetitor
      ? fetchSitemapForUrl(competitors[Number(source.slice(5))].url)
      : fetchSitemapPages("live");
    request
      .then((result) => {
        setSitemaps((prev) => ({
          ...prev,
          [source]:
            result.success && result.data
              ? { status: "ready", paths: result.data }
              : {
                  status: "error",
                  error: result.error ?? "Could not load the sitemap.",
                },
        }));
      })
      .catch(() => {
        setSitemaps((prev) => ({
          ...prev,
          [source]: { status: "error", error: "Could not load the sitemap." },
        }));
      });
  }, [source, competitors, sitemaps]);

  // Apply the saved form once competitors are in (comp:<i> SelectItems must
  // exist before reset), then pull this instance's cached report — never a
  // fresh 15–30s run the user didn't ask for.
  useEffect(() => {
    if (!pendingRestore || !competitorsReady) return;
    const saved = pendingRestore;
    setPendingRestore(null);
    if (
      saved.source.startsWith("comp:") &&
      !competitors[Number(saved.source.slice(5))]
    ) {
      return;
    }
    reset(saved);
    fetchCachedPagespeed(saved)
      .then((result) => {
        if (result.success && result.data) setReport(result.data);
      })
      .catch(() => {
        // Cold cache is a normal state.
      });
  }, [pendingRestore, competitorsReady, competitors, reset]);

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setError("");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    const result = await runPagespeed(data);
    if (result.success && result.data) {
      setReport(result.data);
    } else {
      setError(result.error ?? "The Lighthouse run failed.");
    }
    setLoading(false);
  };

  const sitemap = sitemaps[source];

  return (
    <div className="flex flex-col gap-6">
      <Card className="gap-2 pt-0">
        <CardHeader className="bg-muted/50 py-3">
          <CardTitle>Target</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-wrap items-start gap-4"
            noValidate
          >
            <Controller
              control={control}
              name="source"
              render={({ field, fieldState }) => (
                <Field className="flex w-full max-w-54 flex-col gap-1.5">
                  <Label>Site</Label>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="live">
                        {companyName ?? "Live site"}
                      </SelectItem>
                      {competitors.map((competitor, index) => (
                        <SelectItem
                          key={competitor.url}
                          value={`comp:${index}`}
                        >
                          {competitor.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">Custom URL</SelectItem>
                    </SelectContent>
                  </Select>
                  {fieldState.error && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {source === "custom" ? (
              <Controller
                control={control}
                name="url"
                render={({ field, fieldState }) => (
                  <Field className="flex min-w-56 flex-1 flex-col gap-1.5">
                    <Label>URL</Label>
                    <Input
                      {...field}
                      placeholder="https://example.com/page"
                      inputMode="url"
                    />
                    {fieldState.error && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            ) : (
              <Controller
                control={control}
                name="path"
                render={({ field, fieldState }) => (
                  <Field className="flex min-w-56 flex-1 flex-col gap-1.5">
                    <Label>Page</Label>
                    {sitemap?.status === "error" ? (
                      <>
                        <Input {...field} placeholder="/about" />
                        <p className="text-muted-foreground text-xs">
                          Sitemap unavailable — enter a page path manually.
                        </p>
                      </>
                    ) : (
                      <SearchSelect
                        items={
                          sitemap?.status === "ready"
                            ? sitemap.paths.map((path) => ({
                                code: path,
                                name: path,
                              }))
                            : []
                        }
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={
                          sitemap?.status === "ready"
                            ? "Pick a page"
                            : "Loading sitemap…"
                        }
                        searchPlaceholder="Search pages…"
                        emptyText="No matching pages."
                      />
                    )}
                    {fieldState.error && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            )}

            <Controller
              control={control}
              name="strategy"
              render={({ field }) => (
                <Field className="flex w-32 flex-col gap-1.5">
                  <Label>Device</Label>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mobile">Mobile</SelectItem>
                      <SelectItem value="desktop">Desktop</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />

            <div className="flex flex-col gap-1.5">
              <Label className="invisible">Run</Label>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="size-4 animate-spin" />}
                {loading ? "Auditing…" : "Analyze"}
              </Button>
            </div>
          </form>
          {loading && (
            <p className="mt-3 text-muted-foreground text-sm">
              Google is running a full Lighthouse audit — this takes 15–30
              seconds.
            </p>
          )}
          {error && <p className="mt-3 text-destructive text-sm">{error}</p>}
        </CardContent>
      </Card>

      {report && (
        <>
          <p className="text-muted-foreground text-sm">
            {report.url} · {report.strategy} · analyzed{" "}
            {formatDistanceToNow(report.fetchedAt, { addSuffix: true })}
          </p>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="gap-2 pt-0 lg:col-span-2">
              <CardHeader className="bg-muted/50 py-3">
                <CardTitle>Lighthouse Scores</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-6 py-4 sm:grid-cols-4">
                {report.scores.map((item) => (
                  <div
                    key={item.label}
                    className="flex flex-col items-center gap-1"
                  >
                    <span
                      className={cn(
                        "font-semibold text-4xl tabular-nums",
                        scoreColor(item.score),
                      )}
                    >
                      {item.score ?? "—"}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {item.label}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="gap-2 pt-0">
              <CardHeader className="bg-muted/50 py-3">
                <CardTitle>Lab Metrics</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2.5">
                {report.metrics.map((metric) => (
                  <div
                    key={metric.id}
                    className="flex items-center justify-between gap-4 text-sm"
                  >
                    <span>{metric.label}</span>
                    <span
                      className={cn(
                        "tabular-nums",
                        scoreColor(
                          metric.score === null
                            ? null
                            : Math.round(metric.score * 100),
                        ),
                      )}
                    >
                      {metric.displayValue}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="gap-2 pt-0">
              <CardHeader className="bg-muted/50 py-3">
                <CardTitle>Real-User Data (CrUX)</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2.5">
                {report.fieldData ? (
                  <>
                    {report.fieldData.originFallback && (
                      <p className="text-muted-foreground text-xs">
                        Not enough traffic on this page — showing site-wide data
                        instead.
                      </p>
                    )}
                    {report.fieldData.metrics.map((metric) => {
                      const category = FIELD_CATEGORY[metric.category];
                      return (
                        <div
                          key={metric.label}
                          className="flex items-center justify-between gap-4 text-sm"
                        >
                          <span>{metric.label}</span>
                          <span className="tabular-nums">
                            {metric.displayValue}{" "}
                            {category && (
                              <span
                                className={cn("text-xs", category.className)}
                              >
                                {category.label}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No real-user Chrome data for this page yet — Google needs
                    more traffic before CrUX reports it.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="gap-2 pt-0 lg:col-span-2">
              <CardHeader className="bg-muted/50 py-3">
                <CardTitle>Opportunities</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2.5">
                {report.opportunities.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No savings opportunities flagged.
                  </p>
                ) : (
                  report.opportunities.map((opportunity) => (
                    <div
                      key={opportunity.title}
                      className="flex items-center justify-between gap-4 text-sm"
                    >
                      <span>{opportunity.title}</span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {opportunity.displayValue}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
