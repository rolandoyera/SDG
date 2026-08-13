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
  type PagespeedAuditRow,
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

/**
 * Lighthouse's shape coding: circle = good, square = average, triangle =
 * poor. Shape + color together, so the bands survive colorblindness. Color
 * comes from the parent's `scoreColor` via bg-current.
 */
function BandShape({ score }: { score: number | null }) {
  // inline-block: a plain span ignores size-3, so outside a flex parent
  // (the score legend) the shape silently collapses to nothing.
  if (score === null) {
    return (
      <span className="inline-block size-3 shrink-0 rounded-full border border-current" />
    );
  }
  if (score >= 90)
    return (
      <span className="inline-block size-3 shrink-0 rounded-full bg-current" />
    );
  if (score >= 50)
    return <span className="inline-block size-3 shrink-0 bg-current" />;
  return (
    <span className="inline-block size-3 shrink-0 bg-current [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
  );
}

const RING_RADIUS = 56;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Lighthouse-style gauge: tinted disc, arc for the score, number centered. */
function ScoreRing({
  score,
  size,
  textClassName,
}: {
  score: number | null;
  size: number;
  textClassName: string;
}) {
  return (
    <div
      className={cn("relative shrink-0", scoreColor(score))}
      style={{ width: size, height: size }}>
      {/* Decorative: the score is the real text node below. */}
      <svg
        viewBox="0 0 128 128"
        className="size-full -rotate-90"
        aria-hidden="true">
        <circle
          cx="64"
          cy="64"
          r={RING_RADIUS}
          className="fill-current opacity-10"
        />
        {score !== null && (
          <circle
            cx="64"
            cy="64"
            r={RING_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          />
        )}
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center font-semibold tabular-nums",
          textClassName,
        )}>
        {score ?? "—"}
      </span>
    </div>
  );
}

/** Lighthouse's own metric definitions, linked to the web.dev explainers. */
const METRIC_INFO: Record<string, { description: string; href: string }> = {
  "first-contentful-paint": {
    description:
      "First Contentful Paint marks the time at which the first text or image is painted.",
    href: "https://developer.chrome.com/docs/lighthouse/performance/first-contentful-paint/",
  },
  "largest-contentful-paint": {
    description:
      "Largest Contentful Paint marks the time at which the largest text or image is painted.",
    href: "https://developer.chrome.com/docs/lighthouse/performance/lighthouse-largest-contentful-paint/",
  },
  "total-blocking-time": {
    description:
      "Sum of all time periods between FCP and Time to Interactive, when task length exceeded 50 ms.",
    href: "https://developer.chrome.com/docs/lighthouse/performance/lighthouse-total-blocking-time/",
  },
  "cumulative-layout-shift": {
    description:
      "Cumulative Layout Shift measures the movement of visible elements within the viewport.",
    href: "https://web.dev/articles/cls",
  },
  "speed-index": {
    description:
      "Speed Index shows how quickly the contents of a page are visibly populated.",
    href: "https://developer.chrome.com/docs/lighthouse/performance/speed-index/",
  },
};

const SCORE_LEGEND: { shapeScore: number; range: string; className: string }[] =
  [
    {
      shapeScore: 0,
      range: "0–49",
      className: "text-destructive ",
    },
    {
      shapeScore: 50,
      range: "50–89",
      className: "text-yellow-700 dark:text-yellow-300",
    },
    {
      shapeScore: 90,
      range: "90–100",
      className: "text-green-600 dark:text-green-400",
    },
  ];

/** One Lighthouse Insights/Diagnostics section: band shape, title, savings. */
function AuditSection({
  title,
  rows,
}: {
  title: string;
  rows: PagespeedAuditRow[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="py-2 text-muted-foreground text-sm">Nothing flagged.</p>
      ) : (
        rows.map((row) => {
          const pct = row.score === null ? null : Math.round(row.score * 100);
          return (
            <div
              key={row.id}
              className="flex items-center gap-3 border-border/50 border-b py-3 text-sm">
              <span className={scoreColor(pct)}>
                <BandShape score={pct} />
              </span>
              <span>{row.title}</span>
              {row.displayValue && (
                <span
                  className={cn("ml-auto shrink-0 text-xs", scoreColor(pct))}>
                  {row.displayValue}
                </span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

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

  // Filmstrip frames can be byte-identical (steady loading states), so key
  // by content + occurrence, matching the repo's repeated-content pattern.
  const frameSeen = new Map<string, number>();
  const filmstrip = (report?.filmstrip ?? []).map((data) => {
    const nth = frameSeen.get(data) ?? 0;
    frameSeen.set(data, nth + 1);
    return { data, key: `${data.length}.${data.slice(-24)}#${nth}` };
  });

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
            noValidate>
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
                          value={`comp:${index}`}>
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
                    className="flex flex-col items-center gap-2">
                    <ScoreRing
                      score={item.score}
                      size={80}
                      textClassName="text-xl"
                    />
                    <span className="text-center text-sm">{item.label}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="gap-2 pt-0 lg:col-span-2">
              <CardHeader className="bg-muted/50 py-3">
                <CardTitle>Performance</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-8 py-4">
                <div className="flex flex-wrap items-center justify-center gap-x-16 gap-y-6">
                  <div className="flex flex-col items-center gap-4">
                    <ScoreRing
                      score={
                        report.scores.find((s) => s.label === "Performance")
                          ?.score ?? null
                      }
                      size={144}
                      textClassName="text-4xl"
                    />
                    <p className="max-w-sm text-center text-muted-foreground text-xs">
                      Values are estimated and may vary. The performance score
                      is{" "}
                      <a
                        href="https://googlechrome.github.io/lighthouse/scorecalc/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline">
                        calculated
                      </a>{" "}
                      directly from these metrics.
                    </p>
                    <div className="flex items-center gap-6 text-muted-foreground text-xs">
                      {SCORE_LEGEND.map((item) => (
                        <span
                          key={item.range}
                          className="flex items-center gap-1.5">
                          <span className={item.className}>
                            <BandShape score={item.shapeScore} />
                          </span>
                          {item.range}
                        </span>
                      ))}
                    </div>
                  </div>
                  {report.screenshot && (
                    // biome-ignore lint/performance/noImgElement: PSI returns a data: URI, which next/image cannot optimize.
                    <img
                      src={report.screenshot}
                      alt="Page as Lighthouse rendered it"
                      className="w-32 rounded border"
                    />
                  )}
                </div>

                <div className="grid gap-x-10 sm:grid-cols-2">
                  {report.metrics.map((metric) => {
                    const pct =
                      metric.score === null
                        ? null
                        : Math.round(metric.score * 100);
                    const info = METRIC_INFO[metric.id];
                    return (
                      <div
                        key={metric.id}
                        className="flex flex-col gap-1 border-border/50 border-b py-4">
                        <div
                          className={cn(
                            "flex items-center gap-2",
                            scoreColor(pct),
                          )}>
                          <BandShape score={pct} />
                          <span className="text-foreground text-sm">
                            {metric.label}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "font-semibold text-2xl tabular-nums",
                            scoreColor(pct),
                          )}>
                          {metric.displayValue}
                        </span>
                        {info && (
                          <p className="text-muted-foreground text-xs">
                            {info.description}{" "}
                            <a
                              href={info.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline">
                              Learn more
                            </a>
                            .
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {filmstrip.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {filmstrip.map((frame, index) => (
                      // biome-ignore lint/performance/noImgElement: PSI returns data: URIs, which next/image cannot optimize.
                      <img
                        key={frame.key}
                        src={frame.data}
                        alt={`Loading frame ${index + 1} of ${filmstrip.length}`}
                        className="w-20 rounded border"
                      />
                    ))}
                  </div>
                )}

                <AuditSection title="Insights" rows={report.insights} />
                <AuditSection title="Diagnostics" rows={report.diagnostics} />

                <p className="text-muted-foreground text-sm">
                  Passed audits ({report.passedCount}) ·{" "}
                  <a
                    href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(report.url)}&form_factor=${report.strategy}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline">
                    Full report on PageSpeed Insights
                  </a>
                </p>
              </CardContent>
            </Card>

            <Card className="gap-2 pt-0 lg:col-span-2">
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
                          className="flex items-center justify-between gap-4 text-sm">
                          <span>{metric.label}</span>
                          <span className="tabular-nums">
                            {metric.displayValue}{" "}
                            {category && (
                              <span
                                className={cn("text-xs", category.className)}>
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
          </div>
        </>
      )}
    </div>
  );
}
