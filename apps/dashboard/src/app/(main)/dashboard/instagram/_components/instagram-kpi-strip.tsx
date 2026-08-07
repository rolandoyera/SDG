import { TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Display,
  DisplayContent,
  DisplayFooter,
  DisplayHeader,
  DisplayTitle,
} from "@/components/ui/display";
import { Label } from "@/components/ui/label";
import { fetchInstagramKpis } from "@/server/meta-actions";

function formatCount(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
  return val.toString();
}

/** "2026-06-15" → "As of Jun 15, 2026" (falls back to the raw string if unparseable). */
function asOfLabel(date?: string): string {
  if (!date) return "Last saved snapshot";
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return `As of ${date}`;
  return `As of ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
}

export async function InstagramKpiStrip({ range }: { range?: string }) {
  const result = await fetchInstagramKpis(range);

  if (!result.success || !result.data) {
    return (
      <div className="rounded bg-card p-6 text-center text-muted-foreground text-sm shadow-xs ring-1 ring-foreground/5">
        {result.error ?? "Couldn't load Instagram metrics."}
      </div>
    );
  }

  const isFallback = result.source === "fallback";
  const {
    reach,
    views,
    profileViews,
    accountsEngaged,
    websiteClicks,
    comparisonLabel,
  } = result.data;
  const kpis = [
    { title: "Accounts Reached", metric: reach },
    { title: "Views", metric: views },
    { title: "Profile Visits", metric: profileViews },
    { title: "Accounts Engaged", metric: accountsEngaged },
    { title: "Website Taps", metric: websiteClicks },
  ];

  return (
    <div className="flex flex-col gap-2">
      {isFallback && (
        <div className="rounded bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-400">
          Live Instagram data is unavailable — showing saved data.{" "}
          {asOfLabel(result.asOf)}.
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
        {kpis.map(({ title, metric }) => {
          const noChange = Number.parseFloat(metric.change) === 0;

          return (
            <Display key={title}>
              <DisplayHeader>
                <DisplayTitle>{title}</DisplayTitle>
              </DisplayHeader>
              <DisplayContent>
                <div className="flex items-center justify-between gap-4">
                  <div className="text-2xl leading-none tracking-tight">
                    {formatCount(metric.value)}
                  </div>
                  {!isFallback &&
                    (noChange ? (
                      <span className="text-muted-foreground text-xs">
                        No change
                      </span>
                    ) : (
                      <Badge
                        variant={
                          metric.isPositive ? "trendingUp" : "trendingDown"
                        }
                      >
                        {metric.isPositive ? <TrendingUp /> : <TrendingDown />}
                        {metric.change}
                      </Badge>
                    ))}
                </div>
              </DisplayContent>
              <DisplayFooter>
                {isFallback ? (
                  <Label>{asOfLabel(result.asOf)}</Label>
                ) : (
                  <Label>
                    vs{" "}
                    <span className="text-base text-card-foreground">
                      {formatCount(metric.previousValue)}
                    </span>{" "}
                    {comparisonLabel}
                  </Label>
                )}
              </DisplayFooter>
            </Display>
          );
        })}
      </div>
    </div>
  );
}
