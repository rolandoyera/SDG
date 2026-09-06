"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { ChartLine, ChevronDownIcon, ListFilter } from "lucide-react";
import { toast } from "sonner";

import { LoadingState } from "@/components/loading-state";
import { FadeIn } from "@/components/fade-in";
import { useAuth } from "@/components/auth-context";
import { PageTitle } from "@/components/page-title-updater";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { H1 } from "@/components/ui/typography";
import {
  type AiUsage,
  type AiUsageCounters,
  type AiUsageDay,
  type AiUsageRange,
  type GeminiErrors,
  type GeminiSpend,
  getAiUsage,
  getGeminiErrors,
  getGeminiSpend,
} from "@/server/ai-usage-actions";
import {
  type FirestoreUsage,
  type UsagePeriod,
  type UsageRange,
  type UsageTotals,
  getFirestoreUsage,
  getFirestoreUsageTotals,
} from "@/server/monitoring-actions";

import { UsageChartCard } from "./_components/usage-chart-card";
import { UsageTotalsCard } from "./_components/usage-totals-card";

type RangeValue = UsageRange | UsagePeriod;

const RANGE_OPTIONS: { value: RangeValue; label: string; ms: number }[] = [
  { value: "60m", label: "Last 60 minutes", ms: 60 * 60_000 },
  { value: "24h", label: "Last 24 hours", ms: 24 * 3_600_000 },
  { value: "7d", label: "Last 7 days", ms: 7 * 86_400_000 },
  { value: "30d", label: "Last 30 days", ms: 30 * 86_400_000 },
  { value: "quota", label: "Current quota period", ms: 0 },
  { value: "billing", label: "Current billing period", ms: 0 },
];

// AI usage is stored per ET day, so only day-grained ranges are offered —
// sub-day windows would all collapse to "today" and mislead.
const AI_RANGE_OPTIONS: { value: AiUsageRange; label: string }[] = [
  { value: "quota", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "billing", label: "This month" },
];

// Series definitions shared by the rolling charts and the period totals.
const OPS_SERIES = [
  { key: "reads", label: "Reads", color: "var(--chart-1)" },
  { key: "writes", label: "Writes", color: "var(--chart-2)" },
  { key: "deletes", label: "Deletes", color: "var(--chart-3)" },
];
const SUBS_SERIES = [
  { key: "listeners", label: "Snapshot listeners", color: "var(--chart-1)" },
  { key: "connections", label: "Active connections", color: "var(--chart-2)" },
];
const RULES_SERIES = [
  { key: "allows", label: "Allows", color: "var(--chart-1)" },
  { key: "denies", label: "Denies", color: "var(--chart-2)" },
  { key: "errors", label: "Errors", color: "var(--chart-3)" },
];
const SPEND_SERIES = [
  { key: "cost", label: "Total cost", color: "var(--chart-1)" },
];
const AI_SERIES = [
  { key: "inputTokens", label: "Input tokens", color: "var(--chart-1)" },
  { key: "outputTokens", label: "Output tokens", color: "var(--chart-2)" },
  { key: "requests", label: "Requests", color: "var(--chart-3)" },
];

// Model and error-code series are both discovered from the data rather than
// declared, so a model that stops being called still charts its history and a
// response code we've never seen still gets a line. Colors go by position.
const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

// Matches the Gemini console's error legend; unlisted codes show bare.
const HTTP_STATUS_LABELS: Record<string, string> = {
  "400": "BadRequest",
  "401": "Unauthorized",
  "403": "Forbidden",
  "404": "NotFound",
  "429": "ResourceExhausted",
  "500": "Internal",
  "503": "Unavailable",
};

/**
 * Model ids can't be used as chart series keys directly. Recharts reads a dot
 * in `dataKey` as a nested property path, so "gemini-3.1-flash-lite" resolves
 * as row["gemini-3"]["1-flash-lite"], and ChartContainer emits `--color-<key>`,
 * which is not a valid custom property name with dots in it — the line loses
 * both its data and its stroke. Slug the key, keep the real id as the label.
 */
function modelSeriesKey(model: string): string {
  return `model-${model.replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

/** One chart row per ET day, zero-filled so a quiet day breaks no line. */
function modelPoints(
  daily: AiUsageDay[],
  metric: keyof AiUsageCounters,
  modelKeys: string[],
): Record<string, number>[] {
  return daily.map((day) => {
    // Parsed as local midnight: the axis then labels the ET date as written,
    // whatever timezone the viewer is in.
    const row: Record<string, number> = {
      t: Date.parse(`${day.date}T00:00:00`),
    };
    for (const key of modelKeys) {
      row[modelSeriesKey(key)] = day.byModel[key]?.[metric] ?? 0;
    }
    return row;
  });
}

const REFRESH_MS = 60_000;

function isPeriod(value: RangeValue): value is UsagePeriod {
  return value === "quota" || value === "billing";
}

function bucketLabel(bucketSeconds: number): string {
  if (bucketSeconds === 60) return "per minute";
  if (bucketSeconds < 3_600) return `per ${bucketSeconds / 60} minutes`;
  return `per ${bucketSeconds / 3_600} hours`;
}

// Pacific-time wall-clock date for the period start, so the "midnight PT" note
// stays accurate regardless of the viewer's own timezone.
function pacificDate(ms: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
  }).format(ms);
}

function periodCaption(totals: UsageTotals): string {
  const start = pacificDate(totals.periodStartMs);
  return totals.period === "quota"
    ? `Today so far — since ${start}, midnight PT (resets daily)`
    : `This month — since ${start}, midnight PT`;
}

// aiUsage docs are whole ET calendar days, so this footer's span is coarser
// than the sub-day ranges on the Data tab — say so instead of implying a
// 60m/24h window. No cost estimate: flat rates ignore cached-input and
// fallback SKUs, and billed truth lives in the Cloud Billing export.
function aiUsageCaption(ai: AiUsage): string {
  const span =
    ai.range === "billing"
      ? "This month"
      : ai.days === 1
        ? "Today so far"
        : `Last ${ai.days} days`;
  return `${span} (ET days), every model combined`;
}

export default function UsagePage() {
  const { uid, role, loading: authLoading } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<"ai" | "data">("ai");
  const [range, setRange] = useState<RangeValue>("60m");
  const [aiRange, setAiRange] = useState<AiUsageRange>("billing");
  const [usage, setUsage] = useState<FirestoreUsage | null>(null);
  const [totals, setTotals] = useState<UsageTotals | null>(null);
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);
  const [geminiErrors, setGeminiErrors] = useState<GeminiErrors | null>(null);
  const [spend, setSpend] = useState<GeminiSpend | null>(null);
  // Empty = every model charted ("All Models"); entries hide that model.
  const [hiddenModels, setHiddenModels] = useState<Set<string>>(new Set());

  // Deep-link entry from other pages (/dashboard/usage?tab=data). Tab state is
  // URL-synced like the project detail tabs: handleTabChange mirrors clicks
  // back into the URL so refresh and copied links land on the same tab.
  useEffect(() => {
    const linked = new URLSearchParams(window.location.search).get("tab");
    if (linked === "ai" || linked === "data") setTab(linked);
  }, []);

  const handleTabChange = (value: string) => {
    const next = value as "ai" | "data";
    setTab(next);
    window.history.replaceState(
      null,
      "",
      next === "ai" ? "/dashboard/usage" : `/dashboard/usage?tab=${next}`,
    );
  };

  // Access check & redirect
  useEffect(() => {
    if (authLoading) return;
    if (!uid) {
      router.push("/auth/login");
      return;
    }
    if (role !== "SuperAdmin") {
      toast.error("Access denied. SuperAdmin privileges required.");
      router.push("/dashboard/home");
    }
  }, [uid, role, authLoading, router]);

  // Load + auto-refresh while the tab is visible. The server action caches per
  // range for 60s, so refreshes and extra viewers share one upstream call.
  useEffect(() => {
    if (authLoading || role !== "SuperAdmin") return;

    let cancelled = false;
    // Only the active tab fetches; the inactive tab's last results stay in
    // page state and refresh on its next activation.
    const load = async () => {
      try {
        if (tab === "ai") {
          const [ai, errors, billed] = await Promise.all([
            getAiUsage(aiRange),
            getGeminiErrors(aiRange),
            getGeminiSpend(aiRange),
          ]);
          if (!cancelled) {
            setAiUsage(ai);
            setGeminiErrors(errors);
            setSpend(billed);
          }
        } else if (isPeriod(range)) {
          const data = await getFirestoreUsageTotals(range);
          if (!cancelled) setTotals(data);
        } else {
          const data = await getFirestoreUsage(range);
          if (!cancelled) setUsage(data);
        }
      } catch (error) {
        console.error("Failed to load usage metrics:", error);
        if (!cancelled) toast.error("Failed to load usage metrics.");
      }
    };

    void load();
    const interval = setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    const onVisibilityChange = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [tab, range, aiRange, role, authLoading]);

  if (authLoading || role !== "SuperAdmin") {
    return <LoadingState label="Verifying Authority" />;
  }

  const periodMode = isPeriod(range);
  // Stale data from the previous selection renders as loading, not as
  // mislabeled charts/totals.
  const chartLoading = !usage || usage.range !== range;
  const totalsLoading = !totals || totals.period !== range;
  const aiLoading = !aiUsage || aiUsage.range !== aiRange;
  // Period charts span the quota day / billing month, so tick labels come from
  // the period length rather than the (zero) ms on those range options.
  const DAY_MS = 86_400_000;
  const rangeMs = periodMode
    ? range === "quota"
      ? DAY_MS
      : 30 * DAY_MS
    : (RANGE_OPTIONS.find((o) => o.value === range)?.ms ?? 0);
  const opsCaption = usage ? bucketLabel(usage.bucketSeconds) : "";
  const periodNote = totals && !totalsLoading ? periodCaption(totals) : "";
  // Calls recorded before per-model tracking shipped land in the day totals but
  // in no model bucket, so the two disagree until those days age out of range.
  const untrackedRequests = aiUsage
    ? aiUsage.requests -
      Object.values(aiUsage.byModel).reduce((sum, c) => sum + c.requests, 0)
    : 0;
  const modelKeys = aiUsage ? Object.keys(aiUsage.byModel).sort() : [];
  const modelSeries = modelKeys.map((key, i) => ({
    key: modelSeriesKey(key),
    label: key,
    color: SERIES_COLORS[i % SERIES_COLORS.length],
  }));
  const visibleModelSeries = modelSeries.filter(
    (s) => !hiddenModels.has(s.key),
  );
  const modelFilterLabel =
    hiddenModels.size === 0
      ? "All models"
      : visibleModelSeries.length === 1
        ? visibleModelSeries[0].label
        : `${visibleModelSeries.length} models`;
  const aiDaily = aiUsage?.daily ?? [];
  const aiRangeMs = (aiUsage?.days ?? 1) * DAY_MS;
  const errorsLoading = !geminiErrors || geminiErrors.range !== aiRange;
  const spendLoading = !spend || spend.range !== aiRange;
  const spendCaption = spend?.billedThrough
    ? `Billed, per ET day — through ${spend.billedThrough} (lags ~1 day)`
    : "Billed, per ET day — nothing exported for this range yet";
  // A clean window has no codes at all, which would draw a legend-less empty
  // card — give it one flat zero line so "no errors" reads as a result.
  const errorSeries = geminiErrors?.codes.length
    ? geminiErrors.codes.map((code, i) => ({
        key: code,
        label: `${code} ${HTTP_STATUS_LABELS[code] ?? ""}`.trim(),
        color: SERIES_COLORS[i % SERIES_COLORS.length],
      }))
    : [{ key: "none", label: "Errors", color: SERIES_COLORS[0] }];
  const errorData = geminiErrors?.codes.length
    ? geminiErrors.daily
    : (geminiErrors?.daily ?? []).map((row) => ({ ...row, none: 0 }));

  return (
    <>
      <PageTitle title="Usage" />
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-1">
          <H1 className="flex items-center gap-2">
            <ChartLine className="size-8 text-primary" />
            Usage
          </H1>
          <p className="text-muted-foreground text-sm">
            Firestore activity and Gemini token usage across all tenants.
          </p>
        </div>

        <Tabs
          value={tab}
          onValueChange={handleTabChange}
          className="flex flex-col gap-6"
        >
          <TabsList className="gap-1">
            <TabsTrigger value="ai">AI</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>

          {/* No forceMount (unlike the keyword-analyzer tabs): results live in
              page-level state, so remounting a tab shows them instantly — and
              keeping hidden charts mounted makes Recharts warn about their
              0×0 display:none containers on every switch. */}
          <TabsContent value="ai">
            <div className="flex flex-col gap-6">
              {/* One control row: the range drives the whole tab, the model
                  menu only the per-model charts. That menu does not touch the
                  errors card, which is keyed by response code, not model — and
                  each chart keeps its own series toggles for one-off drilling. */}
              <div className="flex flex-wrap items-center justify-end gap-4">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild disabled={!modelKeys.length}>
                    <Button variant="outline">
                      <ListFilter data-icon="inline-start" />
                      {modelFilterLabel}
                      <ChevronDownIcon data-icon="inline-end" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-fit">
                    {modelSeries.map((s) => (
                      <DropdownMenuCheckboxItem
                        key={s.key}
                        checked={!hiddenModels.has(s.key)}
                        onCheckedChange={(checked) =>
                          setHiddenModels((prev) => {
                            const next = new Set(prev);
                            if (checked) {
                              next.delete(s.key);
                            } else {
                              next.add(s.key);
                            }
                            return next;
                          })
                        }
                        // Multi-select: without this the menu closes on every toggle.
                        onSelect={(event) => event.preventDefault()}
                      >
                        {s.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Select
                  value={aiRange}
                  onValueChange={(value) => setAiRange(value as AiUsageRange)}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" side="bottom" align="end">
                    {AI_RANGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {aiLoading || errorsLoading || spendLoading ? (
                <LoadingState
                  label="Loading AI Usage"
                  className="min-h-[calc(100svh-18rem)]"
                />
              ) : (
                <FadeIn className="flex flex-col gap-6">
                  {/* Two-up: input / output on the first row, requests / errors on
                  the second. Cards default to xl:col-span-6. */}
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                    {modelKeys.length === 0 ? (
                      <p className="text-muted-foreground text-sm xl:col-span-12">
                        No per-model data in this range yet — it starts
                        accumulating with the next Gemini call.
                      </p>
                    ) : (
                      <>
                        <UsageChartCard
                          title="Gemini spend"
                          caption={spendCaption}
                          totalMode="sum"
                          rangeMs={aiRangeMs}
                          className="xl:col-span-4"
                          valueFormat="currency"
                          data={spend?.daily ?? []}
                          series={SPEND_SERIES}
                        />
                        <UsageChartCard
                          title="Input tokens per model"
                          caption="Per ET day"
                          totalMode="sum"
                          rangeMs={aiRangeMs}
                          className="xl:col-span-4"
                          data={modelPoints(aiDaily, "inputTokens", modelKeys)}
                          series={visibleModelSeries}
                        />
                        <UsageChartCard
                          title="Output tokens per model"
                          caption="Per ET day"
                          totalMode="sum"
                          rangeMs={aiRangeMs}
                          className="xl:col-span-4"
                          data={modelPoints(aiDaily, "outputTokens", modelKeys)}
                          series={visibleModelSeries}
                        />
                        <UsageChartCard
                          title="Requests per model"
                          caption="Per ET day"
                          totalMode="sum"
                          rangeMs={aiRangeMs}
                          data={modelPoints(aiDaily, "requests", modelKeys)}
                          series={visibleModelSeries}
                        />
                      </>
                    )}
                    <UsageChartCard
                      title="API errors"
                      caption="Per ET day — server key only"
                      totalMode="sum"
                      rangeMs={aiRangeMs}
                      data={errorData}
                      series={errorSeries}
                    />
                  </div>

                  {untrackedRequests > 0 ? (
                    <p className="text-muted-foreground text-sm">
                      {untrackedRequests.toLocaleString()} request
                      {untrackedRequests === 1 ? "" : "s"} in this range predate
                      per-model tracking and aren&apos;t attributed to a model.
                    </p>
                  ) : null}

                  {/* Footer summary: the one place the models are added back up,
                  and the only place calls made before per-model tracking
                  shipped are counted. */}
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                    <UsageTotalsCard
                      title="AI metrics"
                      caption={aiUsage ? aiUsageCaption(aiUsage) : ""}
                      mode="sum"
                      className="xl:col-span-12"
                      series={AI_SERIES}
                      values={
                        aiUsage
                          ? {
                              inputTokens: aiUsage.inputTokens,
                              outputTokens: aiUsage.outputTokens,
                              requests: aiUsage.requests,
                            }
                          : {}
                      }
                    />
                  </div>
                </FadeIn>
              )}
            </div>
          </TabsContent>

          <TabsContent value="data">
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-muted-foreground text-sm">
                  {periodMode && periodNote ? periodNote : ""}
                </p>
                <Select
                  value={range}
                  onValueChange={(value) => setRange(value as RangeValue)}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" side="bottom" align="end">
                    {RANGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(periodMode ? totalsLoading : chartLoading) ? (
                <LoadingState
                  label="Loading Data Usage"
                  className="min-h-[calc(100svh-18rem)]"
                />
              ) : (
                <FadeIn className="flex flex-col gap-6">
                  {periodMode ? (
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                      <UsageChartCard
                        title="Billable metrics"
                        caption="Operations (cumulative)"
                        totalMode="last"
                        rangeMs={rangeMs}
                        data={totals?.operations ?? []}
                        series={OPS_SERIES}
                      />
                      <UsageChartCard
                        title="Subscription metrics"
                        caption="Peak subscriptions"
                        totalMode="peak"
                        rangeMs={rangeMs}
                        data={totals?.subscriptions ?? []}
                        series={SUBS_SERIES}
                      />
                      <UsageChartCard
                        title="Rules metrics"
                        caption="Rules evaluations (cumulative)"
                        totalMode="last"
                        rangeMs={rangeMs}
                        data={totals?.rules ?? []}
                        series={RULES_SERIES}
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                      <UsageChartCard
                        title="Billable metrics"
                        caption={`Operations (${opsCaption})`}
                        totalMode="sum"
                        rangeMs={rangeMs}
                        data={usage?.operations ?? []}
                        series={OPS_SERIES}
                      />
                      <UsageChartCard
                        title="Subscription metrics"
                        caption={`Peak subscriptions (${opsCaption})`}
                        totalMode="peak"
                        rangeMs={rangeMs}
                        data={usage?.subscriptions ?? []}
                        series={SUBS_SERIES}
                      />
                      <UsageChartCard
                        title="Rules metrics"
                        caption={`Rules evaluations (${opsCaption})`}
                        totalMode="sum"
                        rangeMs={rangeMs}
                        data={usage?.rules ?? []}
                        series={RULES_SERIES}
                      />
                    </div>
                  )}
                </FadeIn>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
