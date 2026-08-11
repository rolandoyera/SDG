"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { ChartLine } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-context";
import { PageTitle } from "@/components/page-title-updater";
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
  type AiUsageRange,
  getAiUsage,
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
const AI_SERIES = [
  { key: "inputTokens", label: "Input tokens", color: "var(--chart-1)" },
  { key: "outputTokens", label: "Output tokens", color: "var(--chart-2)" },
  { key: "requests", label: "Requests", color: "var(--chart-3)" },
];

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

// aiUsage docs are whole ET calendar days, so the card's span is coarser than
// the sub-day chart ranges — say so instead of implying a 60m/24h window.
function aiUsageCaption(ai: AiUsage): string {
  const span =
    ai.range === "billing"
      ? "This month"
      : ai.days === 1
        ? "Today so far"
        : `Last ${ai.days} days`;
  return `${span} (ET days) — est. $${ai.estimatedCostUsd.toFixed(2)} at Gemini 3.1 Flash Lite rates`;
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
    // Only the active tab fetches; the inactive tab keeps its last results
    // (forceMount) and refreshes on its next activation.
    const load = async () => {
      try {
        if (tab === "ai") {
          const ai = await getAiUsage(aiRange);
          if (!cancelled) setAiUsage(ai);
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
    return (
      <div className="flex h-[60vh] w-full items-center justify-center">
        <div className="relative flex flex-col items-center gap-4">
          <div className="relative size-12">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
          <p className="animate-pulse font-medium text-muted-foreground text-xs uppercase tracking-widest">
            Verifying Authority
          </p>
        </div>
      </div>
    );
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
            Firestore activity and Gemini token usage across the whole project
            (all tenants). Firestore metrics arrive with a ~4 minute delay.
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

          {/* forceMount keeps the inactive tab alive so switching doesn't
              wipe loaded results; with forceMount Radix leaves hiding to us. */}
          <TabsContent
            value="ai"
            forceMount
            className="data-[state=inactive]:hidden"
          >
            <div className="flex flex-col gap-6">
              <div className="flex justify-end">
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
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <UsageTotalsCard
                  title="AI metrics"
                  caption={aiUsage && !aiLoading ? aiUsageCaption(aiUsage) : ""}
                  mode="sum"
                  loading={aiLoading}
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
            </div>
          </TabsContent>

          <TabsContent
            value="data"
            forceMount
            className="data-[state=inactive]:hidden"
          >
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

              {periodMode ? (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                  <UsageChartCard
                    title="Billable metrics"
                    caption="Operations (cumulative)"
                    totalMode="last"
                    rangeMs={rangeMs}
                    loading={totalsLoading}
                    data={totals?.operations ?? []}
                    series={OPS_SERIES}
                  />
                  <UsageChartCard
                    title="Subscription metrics"
                    caption="Peak subscriptions"
                    totalMode="peak"
                    rangeMs={rangeMs}
                    loading={totalsLoading}
                    data={totals?.subscriptions ?? []}
                    series={SUBS_SERIES}
                  />
                  <UsageChartCard
                    title="Rules metrics"
                    caption="Rules evaluations (cumulative)"
                    totalMode="last"
                    rangeMs={rangeMs}
                    loading={totalsLoading}
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
                    loading={chartLoading}
                    data={usage?.operations ?? []}
                    series={OPS_SERIES}
                  />
                  <UsageChartCard
                    title="Subscription metrics"
                    caption={`Peak subscriptions (${opsCaption})`}
                    totalMode="peak"
                    rangeMs={rangeMs}
                    loading={chartLoading}
                    data={usage?.subscriptions ?? []}
                    series={SUBS_SERIES}
                  />
                  <UsageChartCard
                    title="Rules metrics"
                    caption={`Rules evaluations (${opsCaption})`}
                    totalMode="sum"
                    rangeMs={rangeMs}
                    loading={chartLoading}
                    data={usage?.rules ?? []}
                    series={RULES_SERIES}
                  />
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
