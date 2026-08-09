"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eraser, ExternalLink, Loader2, MoreVertical } from "lucide-react";
import { type Control, Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { SearchSelect } from "@/components/search-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  TooltipDropdownMenu,
} from "@/components/ui/dropdown-menu";
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
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
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
type SideFormData = CompareFormData["left"];
type SideKey = "left" | "right";

// Each side's last-used source lives in its own localStorage key so the sides
// restore (and clear) independently; the analyses themselves come from the
// server-side page cache.
const SIDE_STORAGE_KEYS: Record<SideKey, string> = {
  left: "seo-compare-left",
  right: "seo-compare-right",
};

const SIDE_DEFAULTS: Record<SideKey, SideFormData> = {
  left: { source: "live", path: "", url: "" },
  right: { source: "none", path: "", url: "" },
};

// Stored sides must carry a source this build understands — stale keys from
// older builds fall back to the side's default instead of restoring blank.
const storedSideSchema = sideSchema.extend({
  source: z.string().regex(/^(live|local|custom|none|comp:\d+)$/),
});

type SitemapState =
  | { status: "loading" }
  | { status: "ready"; paths: string[] }
  | { status: "error"; error: string };

const SUMMARY_METRICS: {
  label: string;
  value: (page: PageAnalysis) => ReactNode;
}[] = [
  {
    label: "Title",
    value: (page) =>
      page.title || (
        <span className="text-destructive">
          Missing — pages need a title tag
        </span>
      ),
  },
  {
    label: "Title length",
    value: (page) => `${page.title.length} chars (50–60 max)`,
  },
  {
    label: "Meta description",
    value: (page) =>
      page.metaDescription || (
        <span className="text-destructive">
          Missing — pages need a meta description
        </span>
      ),
  },
  {
    label: "Meta length",
    value: (page) => `${page.metaDescription.length} chars (120–160 max)`,
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
  {
    label: "H1",
    value: (page) =>
      page.h1s.length ? (
        page.h1s.join(" · ")
      ) : (
        <span className="text-destructive">
          Missing — pages need one H1 heading
        </span>
      ),
  },
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
  onClearResults,
}: {
  side: SideKey;
  control: Control<CompareFormData>;
  source: string;
  companyName: string | null;
  competitors: SeoCompetitor[];
  liveBaseUrl: string | null;
  sitemap: SitemapState | undefined;
  onSourceChange: () => void;
  onClearResults: () => void;
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
              }}
            >
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
        <Label className="invisible">Actions</Label>
        <TooltipDropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon">
              <MoreVertical className="size-4" />
              <span className="sr-only">Actions Menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              disabled={!visitHref}
              onClick={() => {
                if (visitHref) window.open(visitHref, "_blank", "noopener");
              }}
            >
              <ExternalLink className="size-4" />
              Visit Page
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onClearResults}>
              <Eraser className="size-4" />
              Clear Results
            </DropdownMenuItem>
          </DropdownMenuContent>
        </TooltipDropdownMenu>
      </div>
    </div>
  );
}

export function CompareTab() {
  const { control, handleSubmit, watch, setValue, reset } =
    useForm<CompareFormData>({
      resolver: zodResolver(compareSchema),
      defaultValues: { left: SIDE_DEFAULTS.left, right: SIDE_DEFAULTS.right },
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
  const [pendingRestore, setPendingRestore] = useState<{
    left?: SideFormData;
    right?: SideFormData;
  } | null>(null);
  const [competitorsReady, setCompetitorsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Restore each side independently — a stale or unreadable side falls back
    // to its default without blocking the other. The auto-rerun waits for the
    // competitor list below (comp:<i> sources resolve against it).
    localStorage.removeItem("seo-compare-form"); // pre-split blob
    const restored: { left?: SideFormData; right?: SideFormData } = {};
    for (const key of ["left", "right"] as const) {
      try {
        const saved = storedSideSchema.safeParse(
          JSON.parse(localStorage.getItem(SIDE_STORAGE_KEYS[key]) ?? ""),
        );
        if (
          saved.success &&
          !(key === "left" && saved.data.source === "none")
        ) {
          restored[key] = saved.data;
        }
      } catch {
        // Nothing saved for this side.
      }
    }
    if (restored.left || restored.right) {
      reset({
        left: restored.left ?? SIDE_DEFAULTS.left,
        right: restored.right ?? SIDE_DEFAULTS.right,
      });
      setPendingRestore(restored);
    }

    fetchCompetitors()
      .then((result) => {
        if (!cancelled && result.success && result.data) {
          setCompetitors(result.data);
        }
      })
      .catch(() => {
        // The source dropdowns just won't list competitors.
      })
      .finally(() => {
        if (!cancelled) setCompetitorsReady(true);
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
  }, [reset]);

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

  // fresh=true bypasses the server's page cache — the cache only exists to
  // make the leave-and-return restore instant; an explicit Analyze refetches.
  const analyzeSide = useCallback(
    async (
      side: SideFormData,
      fresh: boolean,
    ): Promise<SeoResult<PageAnalysis> | null> => {
      if (side.source === "custom") return analyzeExternalUrl(side.url, fresh);
      const path = leadingSlash(side.path.trim());
      if (side.source === "live" || side.source === "local") {
        return analyzeSitePage(side.source, path, fresh);
      }
      if (side.source.startsWith("comp:")) {
        const competitor = competitors[Number(side.source.slice(5))];
        if (!competitor) {
          return { success: false, error: "Competitor not found." };
        }
        return analyzeExternalUrl(new URL(path, competitor.url).href, fresh);
      }
      // "none" or an unrecognized source — nothing to analyze.
      return null;
    },
    [competitors],
  );

  // Analyze the given sides; a side left out keeps its current results.
  const runSides = useCallback(
    async (
      sides: { left?: SideFormData; right?: SideFormData },
      fresh: boolean,
    ) => {
      setLoading(true);
      setErrors([]);
      try {
        const [leftResult, rightResult] = await Promise.all([
          sides.left ? analyzeSide(sides.left, fresh) : undefined,
          sides.right ? analyzeSide(sides.right, fresh) : undefined,
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
        if (sides.left) {
          setLeft(
            unpack(leftResult ?? null, "Could not analyze the left page."),
          );
        }
        if (sides.right) {
          setRight(
            unpack(rightResult ?? null, "Could not analyze the right page."),
          );
        }
        setErrors(problems);
      } finally {
        setLoading(false);
      }
    },
    [analyzeSide],
  );

  const onSubmit = useCallback(
    async (data: CompareFormData) => {
      try {
        localStorage.setItem(SIDE_STORAGE_KEYS.left, JSON.stringify(data.left));
        localStorage.setItem(
          SIDE_STORAGE_KEYS.right,
          JSON.stringify(data.right),
        );
      } catch {
        // Storage unavailable — the analysis still runs, it just won't restore.
      }
      await runSides({ left: data.left, right: data.right }, true);
    },
    [runSides],
  );

  // Clear one side: results, form selection, and its saved restore state.
  const clearResults = useCallback(
    (side: SideKey) => {
      setValue(side, SIDE_DEFAULTS[side]);
      (side === "left" ? setLeft : setRight)(null);
      setErrors([]);
      try {
        localStorage.removeItem(SIDE_STORAGE_KEYS[side]);
      } catch {
        // Storage unavailable — nothing saved to clear.
      }
    },
    [setValue],
  );

  // Re-run the restored sides once the competitor list is in (comp:<i>
  // resolves against it). A side whose competitor was since deleted skips its
  // rerun alone — the other side still repopulates.
  useEffect(() => {
    if (!pendingRestore || !competitorsReady) return;
    setPendingRestore(null);
    const resolvable = (side?: SideFormData) =>
      side &&
      (!side.source.startsWith("comp:") ||
        competitors[Number(side.source.slice(5))])
        ? side
        : undefined;
    const sides = {
      left: resolvable(pendingRestore.left),
      right: resolvable(pendingRestore.right),
    };
    if (sides.left || sides.right) {
      runSides(sides, false).catch(() => {
        // runSides reports its own errors; nothing extra to do here.
      });
    }
  }, [pendingRestore, competitorsReady, competitors, runSides]);

  // Whichever sides have results — left alone, right alone, or both.
  const pages = [left, right].filter((page): page is PageAnalysis => !!page);

  return (
    <div className="flex flex-col gap-6">
      <Card className="gap-2 pt-0">
        <CardHeader className="bg-muted/50 py-3">
          <CardTitle>Site Page</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            noValidate
          >
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
                onClearResults={() => clearResults("left")}
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
                onClearResults={() => clearResults("right")}
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

      {pages.length > 0 && (
        <>
          <Card className="gap-2 pt-0">
            <CardHeader className="bg-muted/50 py-3">
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Same grid as the Keyword Report: one block per page, so long
                  values wrap inside their own half instead of pushing the
                  other page's column. */}
              <div className="grid gap-8 lg:grid-cols-2">
                {pages.map((page) => (
                  <div key={page.url} className="flex flex-col gap-4">
                    <p className="font-medium text-sm">{reportHeading(page)}</p>
                    <Table className="table-fixed">
                      <TableBody>
                        {SUMMARY_METRICS.map((metric) => (
                          <TableRow key={metric.label}>
                            <TableCell className="w-40 align-top font-medium">
                              {metric.label}
                            </TableCell>
                            <TableCell className="wrap-break-word whitespace-normal">
                              {metric.value(page)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="gap-2 pt-0">
            <CardHeader className="bg-muted/50 py-3">
              <CardTitle>Keyword Report</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <ScopePicker value={scope} onChange={setScope} />
              <div className="grid gap-8 lg:grid-cols-2">
                {pages.map((page) => (
                  <div key={page.url} className="flex flex-col gap-4">
                    <p className="font-medium text-sm">{reportHeading(page)}</p>
                    <ScopePhraseTables scope={page.scopes[scope]} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
