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
import { H1 } from "@/components/ui/typography";
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

export default function UsagePage() {
  const { uid, role, loading: authLoading } = useAuth();
  const router = useRouter();

  const [range, setRange] = useState<RangeValue>("60m");
  const [usage, setUsage] = useState<FirestoreUsage | null>(null);
  const [totals, setTotals] = useState<UsageTotals | null>(null);

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
    const load = async () => {
      try {
        if (isPeriod(range)) {
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
  }, [range, role, authLoading]);

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
  const rangeMs = RANGE_OPTIONS.find((o) => o.value === range)?.ms ?? 0;
  const opsCaption = usage ? bucketLabel(usage.bucketSeconds) : "";
  const periodNote = totals && !totalsLoading ? periodCaption(totals) : "";

  return (
    <>
      <PageTitle title="Usage" />
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <H1 className="flex items-center gap-2">
              <ChartLine className="size-8 text-primary" />
              Usage
            </H1>
            <p className="text-muted-foreground text-sm">
              Firestore activity across the whole project (all tenants). Metrics
              arrive with a ~4 minute delay.
            </p>
            {periodMode && periodNote ? (
              <p className="text-muted-foreground text-sm">{periodNote}</p>
            ) : null}
          </div>
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
          <>
            <UsageTotalsCard
              title="Billable metrics"
              caption="Operations"
              mode="sum"
              loading={totalsLoading}
              series={OPS_SERIES}
              values={
                totals
                  ? {
                      reads: totals.reads,
                      writes: totals.writes,
                      deletes: totals.deletes,
                    }
                  : {}
              }
            />
            <UsageTotalsCard
              title="Subscription metrics"
              caption="Peak subscriptions"
              mode="peak"
              loading={totalsLoading}
              series={SUBS_SERIES}
              values={
                totals
                  ? {
                      listeners: totals.listeners,
                      connections: totals.connections,
                    }
                  : {}
              }
            />
            <UsageTotalsCard
              title="Rules metrics"
              caption="Rules evaluations"
              mode="sum"
              loading={totalsLoading}
              series={RULES_SERIES}
              values={
                totals
                  ? {
                      allows: totals.allows,
                      denies: totals.denies,
                      errors: totals.errors,
                    }
                  : {}
              }
            />
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </>
  );
}
