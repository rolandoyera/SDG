"use client";

import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

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
  fetchSitemapPages,
  type PageAnalysis,
  type SiteTarget,
} from "@/server/seo-actions";

import { type ScopeKey, ScopePhraseTables, ScopePicker } from "./scope-report";

const compareSchema = z.object({
  target: z.enum(["live", "local"]),
  ownPath: z.string().min(1, "Pick a page to analyze."),
  competitorUrl: z.string().trim(),
});

type CompareFormData = z.infer<typeof compareSchema>;

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

export function CompareTab() {
  const { control, handleSubmit, watch } = useForm<CompareFormData>({
    resolver: zodResolver(compareSchema),
    defaultValues: { target: "live", ownPath: "", competitorUrl: "" },
  });
  const target = watch("target");

  const [paths, setPaths] = useState<string[]>([]);
  const [pathsError, setPathsError] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [own, setOwn] = useState<PageAnalysis | null>(null);
  const [competitor, setCompetitor] = useState<PageAnalysis | null>(null);
  const [scope, setScope] = useState<ScopeKey>("all");

  useEffect(() => {
    let cancelled = false;
    setPaths([]);
    setPathsError("");
    fetchSitemapPages(target)
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data) {
          setPaths(result.data);
        } else {
          setPathsError(result.error ?? "Could not load the sitemap.");
        }
      })
      .catch(() => {
        if (!cancelled) setPathsError("Could not load the sitemap.");
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  const onSubmit = async (data: CompareFormData) => {
    setLoading(true);
    setErrors([]);
    try {
      const ownPath = data.ownPath.startsWith("/")
        ? data.ownPath
        : `/${data.ownPath}`;
      const [ownResult, competitorResult] = await Promise.all([
        analyzeSitePage(data.target as SiteTarget, ownPath),
        data.competitorUrl
          ? analyzeExternalUrl(data.competitorUrl)
          : Promise.resolve(null),
      ]);

      const problems: string[] = [];
      if (ownResult.success && ownResult.data) {
        setOwn(ownResult.data);
      } else {
        setOwn(null);
        problems.push(ownResult.error ?? "Could not analyze your page.");
      }
      if (competitorResult) {
        if (competitorResult.success && competitorResult.data) {
          setCompetitor(competitorResult.data);
        } else {
          setCompetitor(null);
          problems.push(
            competitorResult.error ?? "Could not analyze the competitor URL.",
          );
        }
      } else {
        setCompetitor(null);
      }
      setErrors(problems);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="gap-2 pt-0">
        <CardHeader className="bg-muted/50 py-3">
          <CardTitle>Compare Pages</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="grid items-start gap-4 lg:grid-cols-[10rem_1fr_1fr_auto]"
            noValidate
          >
            <Controller
              control={control}
              name="target"
              render={({ field }) => (
                <Field className="flex flex-col gap-1.5">
                  <Label>Site</Label>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="live">Live site</SelectItem>
                      <SelectItem value="local">Localhost</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />

            <Controller
              control={control}
              name="ownPath"
              render={({ field, fieldState }) => (
                <Field className="flex flex-col gap-1.5">
                  <Label>Your page</Label>
                  {pathsError ? (
                    // Escape hatch: no sitemap — take the path by hand.
                    <>
                      <Input {...field} placeholder="/about" />
                      <p className="text-muted-foreground text-xs">
                        Sitemap unavailable — enter a page path manually.
                      </p>
                    </>
                  ) : (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={
                            paths.length > 0
                              ? "Pick a page"
                              : "Loading sitemap…"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {paths.map((path) => (
                          <SelectItem key={path} value={path}>
                            {path}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {fieldState.error && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              control={control}
              name="competitorUrl"
              render={({ field, fieldState }) => (
                <Field className="flex flex-col gap-1.5">
                  <Label>Competitor URL (optional)</Label>
                  <Input
                    {...field}
                    placeholder="https://competitor.com/page"
                    inputMode="url"
                  />
                  {fieldState.error && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <div className="flex flex-col gap-1.5">
              <Label className="invisible hidden lg:block">Run</Label>
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

      {own && (
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
                    <TableHead>{reportHeading(own)}</TableHead>
                    {competitor && (
                      <TableHead>{reportHeading(competitor)}</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SUMMARY_METRICS.map((metric) => (
                    <TableRow key={metric.label}>
                      <TableCell className="pl-4 font-medium">
                        {metric.label}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {metric.value(own)}
                      </TableCell>
                      {competitor && (
                        <TableCell className="whitespace-normal">
                          {metric.value(competitor)}
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
                  <p className="font-medium text-sm">{reportHeading(own)}</p>
                  <ScopePhraseTables scope={own.scopes[scope]} />
                </div>
                {competitor && (
                  <div className="flex flex-col gap-4">
                    <p className="font-medium text-sm">
                      {reportHeading(competitor)}
                    </p>
                    <ScopePhraseTables scope={competitor.scopes[scope]} />
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
