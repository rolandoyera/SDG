"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink, Loader2 } from "lucide-react";
import { type Control, Controller, useForm, useWatch } from "react-hook-form";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  analyzeExternalUrl,
  analyzeSitePage,
  fetchCompanyName,
  fetchCompetitors,
  fetchLiveBaseUrl,
  fetchSitemapForUrl,
  fetchSitemapPages,
  type PageAnalysis,
  type SeoCompetitor,
  type SeoResult,
  type SiteTarget,
} from "@/server/seo-actions";

import { type ScopeKey, ScopePhraseTables, ScopePicker } from "./scope-report";

// Source keys: "live" | "local" | "custom" | "none" | "comp:<index>".
const sideSchema = z.object({
  source: z.string(),
  path: z.string(),
  url: z.string().trim(),
});

const compareSchema = z
  .object({ left: sideSchema, right: sideSchema })
  .superRefine((data, ctx) => {
    for (const key of ["left", "right"] as const) {
      const side = data[key];
      if (side.source === "none") {
        if (key === "left") {
          ctx.addIssue({
            code: "custom",
            path: [key, "source"],
            message: "Choose a source.",
          });
        }
        continue;
      }
      if (side.source === "custom") {
        if (!side.url) {
          ctx.addIssue({
            code: "custom",
            path: [key, "url"],
            message: "Enter a URL.",
          });
        }
      } else if (!side.path.trim()) {
        ctx.addIssue({
          code: "custom",
          path: [key, "path"],
          message: "Pick a page.",
        });
      }
    }
  });

type CompareFormData = z.infer<typeof compareSchema>;
type SideKey = "left" | "right";

type SitemapState =
  | { status: "loading" }
  | { status: "ready"; paths: string[] }
  | { status: "error"; error: string };

const SUMMARY_METRICS: {
  label: string;
  value: (page: PageAnalysis) => string;
}[] = [
  { label: "Title", value: (page) => page.title || "—" },
  { label: "Title length", value: (page) => `${page.title.length} chars` },
  {
    label: "Meta description",
    value: (page) => page.metaDescription || "—",
  },
  {
    label: "Meta length",
    value: (page) => `${page.metaDescription.length} chars`,
  },
  {
    label: "Word count",
    value: (page) =>
      `${page.scopes.all.words.toLocaleString()} (${page.scopes.all.wordsWithStop.toLocaleString()} incl. stop words)`,
  },
  {
    label: "Unique words",
    value: (page) =>
      `${page.scopes.all.unique.toLocaleString()} (${page.scopes.all.uniqueWithStop.toLocaleString()} incl. stop words)`,
  },
  { label: "H1", value: (page) => page.h1s.join(" · ") || "—" },
  { label: "H2s", value: (page) => `${page.h2s.length}` },
  {
    label: "Links",
    value: (page) =>
      `${page.linkCount} (${page.internalLinkCount} internal / ${page.externalLinkCount} external)`,
  },
  {
    label: "Images",
    value: (page) => `${page.imageCount} (${page.missingAltCount} missing alt)`,
  },
];

function reportHeading(page: PageAnalysis): string {
  const url = new URL(page.url);
  return `${url.host}${url.pathname}`;
}

function leadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function SideFields({
  side,
  control,
  source,
  companyName,
  competitors,
  liveBaseUrl,
  sitemap,
  onSourceChange,
}: {
  side: SideKey;
  control: Control<CompareFormData>;
  source: string;
  companyName: string | null;
  competitors: SeoCompetitor[];
  liveBaseUrl: string | null;
  sitemap: SitemapState | undefined;
  onSourceChange: () => void;
}) {
  const usesSitemap =
    source === "live" || source === "local" || source.startsWith("comp:");

  // Resolve the URL the "Visit Page" button opens. With no page picked yet,
  // sitemap sources fall back to that site's homepage.
  const path = useWatch({ control, name: `${side}.path` }) ?? "";
  const urlValue = useWatch({ control, name: `${side}.url` }) ?? "";
  const suffix = path.trim() ? leadingSlash(path.trim()) : "";
  let visitHref: string | null = null;
  if (source === "custom") {
    const raw = urlValue.trim();
    visitHref = raw
      ? /^https?:\/\//i.test(raw)
        ? raw
        : `https://${raw}`
      : null;
  } else if (source === "live") {
    visitHref = liveBaseUrl ? `${liveBaseUrl}${suffix}` : null;
  } else if (source === "local") {
    visitHref = `http://localhost:3000${suffix}`;
  } else if (source.startsWith("comp:")) {
    const competitor = competitors[Number(source.slice(5))];
    visitHref = competitor ? `${competitor.url}${suffix}` : null;
  }

  return (
    // Source + page sit inline; the source select caps at max-w-46.
    <div className="flex flex-wrap items-start gap-4">
      <Controller
        control={control}
        name={`${side}.source`}
        render={({ field, fieldState }) => (
          <Field className="flex w-full max-w-54 flex-col gap-1.5">
            <Label>{side === "left" ? "Site" : "Against"}</Label>
            <Select
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value);
                onSourceChange();
              }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a source" />
              </SelectTrigger>
              <SelectContent>
                {side === "right" && <SelectItem value="none">None</SelectItem>}
                <SelectItem value="live">
                  {companyName ?? "Live site"}
                </SelectItem>
                <SelectItem value="local">Unpublished</SelectItem>
                {competitors.map((competitor, index) => (
                  <SelectItem key={competitor.url} value={`comp:${index}`}>
                    {competitor.name}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom URL</SelectItem>
              </SelectContent>
            </Select>
            {fieldState.error && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      {source === "custom" && (
        <Controller
          control={control}
          name={`${side}.url`}
          render={({ field, fieldState }) => (
            <Field className="flex min-w-56 flex-1 flex-col gap-1.5">
              <Label>URL</Label>
              <Input
                {...field}
                placeholder="https://example.com/page"
                inputMode="url"
              />
              {fieldState.error && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      )}

      {usesSitemap && (
        <Controller
          control={control}
          name={`${side}.path`}
          render={({ field, fieldState }) => (
            <Field className="flex min-w-56 flex-1 flex-col gap-1.5">
              <Label>Page</Label>
              {sitemap?.status === "error" ? (
                // Escape hatch: no sitemap — take the path by hand.
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
              {fieldState.error && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      )}

      <div className="flex flex-col gap-1.5">
        <Label className="invisible">Visit</Label>
        <Button
          type="button"
          variant="outline"
          disabled={!visitHref}
          onClick={() => {
            if (visitHref) window.open(visitHref, "_blank", "noopener");
          }}>
          <ExternalLink className="size-4" />
          Visit Page
        </Button>
      </div>
    </div>
  );
}

export function CompareTab() {
  const { control, handleSubmit, watch, setValue } = useForm<CompareFormData>({
    resolver: zodResolver(compareSchema),
    defaultValues: {
      left: { source: "live", path: "", url: "" },
      right: { source: "none", path: "", url: "" },
    },
  });
  const leftSource = watch("left.source");
  const rightSource = watch("right.source");

  const [companyName, setCompanyName] = useState<string | null>(null);
  const [liveBaseUrl, setLiveBaseUrl] = useState<string | null>(null);
  const [competitors, setCompetitors] = useState<SeoCompetitor[]>([]);
  const [sitemaps, setSitemaps] = useState<Record<string, SitemapState>>({});
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [left, setLeft] = useState<PageAnalysis | null>(null);
  const [right, setRight] = useState<PageAnalysis | null>(null);
  const [scope, setScope] = useState<ScopeKey>("all");

  useEffect(() => {
    let cancelled = false;
    fetchCompetitors()
      .then((result) => {
        if (!cancelled && result.success && result.data) {
          setCompetitors(result.data);
        }
      })
      .catch(() => {
        // The source dropdowns just won't list competitors.
      });
    fetchCompanyName()
      .then((result) => {
        if (!cancelled && result.success && result.data) {
          setCompanyName(result.data);
        }
      })
      .catch(() => {
        // Keep the "Live site" fallback label.
      });
    fetchLiveBaseUrl()
      .then((result) => {
        if (!cancelled && result.success && result.data) {
          setLiveBaseUrl(result.data);
        }
      })
      .catch(() => {
        // Live "Visit Page" just stays disabled.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the sitemap for any selected source that needs one, once per source.
  useEffect(() => {
    for (const source of [leftSource, rightSource]) {
      const isCompetitor = source.startsWith("comp:");
      if (source !== "live" && source !== "local" && !isCompetitor) continue;
      if (sitemaps[source]) continue;
      if (isCompetitor && !competitors[Number(source.slice(5))]) continue;

      setSitemaps((prev) => ({ ...prev, [source]: { status: "loading" } }));
      const request = isCompetitor
        ? fetchSitemapForUrl(competitors[Number(source.slice(5))].url)
        : fetchSitemapPages(source as SiteTarget);
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
            [source]: {
              status: "error",
              error: "Could not load the sitemap.",
            },
          }));
        });
    }
  }, [leftSource, rightSource, competitors, sitemaps]);

  const analyzeSide = async (
    side: CompareFormData["left"],
  ): Promise<SeoResult<PageAnalysis> | null> => {
    if (side.source === "none") return null;
    if (side.source === "custom") return analyzeExternalUrl(side.url);
    const path = leadingSlash(side.path.trim());
    if (side.source === "live" || side.source === "local") {
      return analyzeSitePage(side.source, path);
    }
    const competitor = competitors[Number(side.source.slice(5))];
    if (!competitor) {
      return { success: false, error: "Competitor not found." };
    }
    return analyzeExternalUrl(new URL(path, competitor.url).href);
  };

  const onSubmit = async (data: CompareFormData) => {
    setLoading(true);
    setErrors([]);
    try {
      const [leftResult, rightResult] = await Promise.all([
        analyzeSide(data.left),
        analyzeSide(data.right),
      ]);

      const problems: string[] = [];
      const unpack = (
        result: SeoResult<PageAnalysis> | null,
        fallback: string,
      ): PageAnalysis | null => {
        if (!result) return null;
        if (result.success && result.data) return result.data;
        problems.push(result.error ?? fallback);
        return null;
      };
      setLeft(unpack(leftResult, "Could not analyze the left page."));
      setRight(unpack(rightResult, "Could not analyze the right page."));
      setErrors(problems);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="gap-2 pt-0">
        <CardHeader className="bg-muted/50 py-3">
          <CardTitle>Page</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            noValidate>
            <div className="grid gap-6 lg:grid-cols-2">
              <SideFields
                side="left"
                control={control}
                source={leftSource}
                companyName={companyName}
                competitors={competitors}
                liveBaseUrl={liveBaseUrl}
                sitemap={sitemaps[leftSource]}
                onSourceChange={() => setValue("left.path", "")}
              />
              <SideFields
                side="right"
                control={control}
                source={rightSource}
                companyName={companyName}
                competitors={competitors}
                liveBaseUrl={liveBaseUrl}
                sitemap={sitemaps[rightSource]}
                onSourceChange={() => setValue("right.path", "")}
              />
            </div>

            <div>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="size-4 animate-spin" />}
                Analyze
              </Button>
            </div>
          </form>

          {errors.length > 0 && (
            <div className="mt-3 flex flex-col gap-1">
              {errors.map((message) => (
                <p key={message} className="text-destructive text-sm">
                  {message}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {left && (
        <>
          <Card className="gap-2 pt-0">
            <CardHeader className="bg-muted/50 py-3">
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40 pl-4">Metric</TableHead>
                    <TableHead>{reportHeading(left)}</TableHead>
                    {right && <TableHead>{reportHeading(right)}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SUMMARY_METRICS.map((metric) => (
                    <TableRow key={metric.label}>
                      <TableCell className="pl-4 font-medium">
                        {metric.label}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {metric.value(left)}
                      </TableCell>
                      {right && (
                        <TableCell className="whitespace-normal">
                          {metric.value(right)}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="gap-2 pt-0">
            <CardHeader className="bg-muted/50 py-3">
              <CardTitle>Keyword Report</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <ScopePicker value={scope} onChange={setScope} />
              <div className="grid gap-8 lg:grid-cols-2">
                <div className="flex flex-col gap-4">
                  <p className="font-medium text-sm">{reportHeading(left)}</p>
                  <ScopePhraseTables scope={left.scopes[scope]} />
                </div>
                {right && (
                  <div className="flex flex-col gap-4">
                    <p className="font-medium text-sm">
                      {reportHeading(right)}
                    </p>
                    <ScopePhraseTables scope={right.scopes[scope]} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
