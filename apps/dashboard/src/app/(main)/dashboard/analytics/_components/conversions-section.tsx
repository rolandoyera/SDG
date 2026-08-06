import { Ellipsis } from "lucide-react";
import type { CSSProperties } from "react";

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type ConversionsData,
  fetchConversionsData,
} from "@/server/analytics-actions";

import { AnalyticsSetupRequired } from "./analytics-setup-required";
import { KeyEventsChart } from "./key-events-chart";

// 45° hatch matching the recharts charts, shown in the unused portion of each bar.
const HATCH_BG: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(45deg, color-mix(in srgb, var(--muted-foreground) 10%, transparent) 0 1.25px, transparent 1.25px 4px)",
};

/**
 * A fixed-label bar: the label always shows, the amount renders inside the fill
 * (a count of 0 renders no fill, leaving just the hatch pattern), and the count
 * + percentage live in a popup styled to match the recharts chart tooltips.
 */
function EventBar({
  label,
  count,
  seriesLabel,
  percentLabel,
  width,
}: {
  label: string;
  count: number;
  seriesLabel: string;
  percentLabel?: string;
  width: number;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex cursor-default flex-col gap-1.5">
          <span className="text-muted-foreground text-sm">{label}</span>
          <div
            className="h-8 w-full overflow-hidden rounded bg-muted/50"
            style={HATCH_BG}>
            {count > 0 && (
              <div
                className="flex h-full items-center rounded bg-primary/70 px-2 text-foreground text-sm tabular-nums"
                style={{ width: `${width}%` }}>
                {count}
              </div>
            )}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent
        showArrow={false}
        className="min-w-32 flex-col items-stretch gap-1.5 rounded border border-border/50 bg-background px-2.5 py-1.5 text-foreground shadow-xl">
        <div className="font-medium">
          {label}
          {percentLabel ? (
            <span className="ml-1 text-muted-foreground">({percentLabel})</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1 shrink-0 self-stretch rounded-[2px] bg-primary" />
          <div className="flex flex-1 items-center justify-between gap-3 leading-none">
            <span className="text-muted-foreground">{seriesLabel}</span>
            <span className="font-mono font-medium text-foreground tabular-nums">
              {count}
            </span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

interface FunnelStep {
  label: string;
  count: number;
}

function FunnelSteps({ title, steps }: { title: string; steps: FunnelStep[] }) {
  const maxCount = Math.max(...steps.map((s) => s.count), 1);

  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium text-sm">{title}</p>
      {steps.map((step, index) => {
        const prevCount = index > 0 ? steps[index - 1].count : null;
        const stepRate =
          prevCount && prevCount > 0
            ? `${((step.count / prevCount) * 100).toFixed(0)}%`
            : undefined;

        return (
          <EventBar
            key={step.label}
            label={step.label}
            count={step.count}
            seriesLabel="Users"
            percentLabel={stepRate}
            width={(step.count / maxCount) * 100}
          />
        );
      })}
    </div>
  );
}

const LEAD_TYPES: { eventName: string; label: string }[] = [
  { eventName: "contact_form_submit", label: "Contact form submissions" },
  { eventName: "project_form_submit", label: "Project form submissions" },
  { eventName: "phone_click", label: "Phone clicks" },
  { eventName: "email_click", label: "Email clicks" },
  { eventName: "whatsapp_click", label: "WhatsApp clicks" },
];

function LeadBreakdown({
  eventCounts,
}: {
  eventCounts: ConversionsData["eventCounts"];
}) {
  const totalLeads = LEAD_TYPES.reduce(
    (sum, t) => sum + (eventCounts[t.eventName] || 0),
    0,
  );
  const maxLead = Math.max(
    ...LEAD_TYPES.map((t) => eventCounts[t.eventName] || 0),
    1,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-1">
        <span className="text-2xl tabular-nums leading-none tracking-tight">
          {totalLeads}
        </span>
        <span className="text-muted-foreground text-sm">
          total lead actions
        </span>
      </div>
      <div className="flex flex-col gap-3 pt-1">
        {LEAD_TYPES.map((type) => {
          const count = eventCounts[type.eventName] || 0;
          const pct =
            totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;

          return (
            <EventBar
              key={type.eventName}
              label={type.label}
              count={count}
              seriesLabel="Leads"
              percentLabel={`${pct}%`}
              width={(count / maxLead) * 100}
            />
          );
        })}
      </div>
    </div>
  );
}

export async function ConversionsSection({ range }: { range?: string }) {
  const result = await fetchConversionsData(range);

  if (!result.success || !result.data) {
    return (
      <div className="rounded bg-card shadow-xs ring-1 ring-foreground/10">
        <AnalyticsSetupRequired
          error={result.error}
          title="Conversions Error"
          className="min-h-50"
        />
      </div>
    );
  }

  const { trend, channels, eventCounts } = result.data;
  const hasKeyEvents = trend.some((point) => point.keyEvents > 0);

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
          <Card className="md:col-span-1 lg:col-span-4 pt-0">
            <CardHeader className="bg-muted/50 py-3">
              <CardTitle>Key Events</CardTitle>
              <CardAction>
                <Ellipsis className="size-4" />
              </CardAction>
            </CardHeader>
            <CardContent>
              {hasKeyEvents ? (
                <KeyEventsChart data={trend} />
              ) : (
                <div className="flex h-64 flex-col items-center justify-center gap-1 text-center text-muted-foreground text-sm">
                  <span>No key events recorded in this range.</span>
                  <span className="max-w-sm text-xs">
                    Mark the lead events as key events in GA4 Admin → Events
                    once they have fired (see ANALYTICS_TODO.md).
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-1 lg:col-span-3 pt-0">
            <CardHeader className="bg-muted/50 py-3">
              <CardTitle>Lead Breakdown</CardTitle>
              <CardAction>
                <Ellipsis className="size-4" />
              </CardAction>
            </CardHeader>
            <CardContent>
              <LeadBreakdown eventCounts={eventCounts} />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
          <Card className="md:col-span-1 lg:col-span-3 pt-0">
            <CardHeader className="bg-muted/50 py-3">
              <CardTitle>Form Funnels</CardTitle>
              <CardAction>
                <Ellipsis className="size-4" />
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-8">
              <FunnelSteps
                title="Project form"
                steps={[
                  {
                    label: "CTA clicks",
                    count: eventCounts.project_button_click || 0,
                  },
                  {
                    label: "Submitted",
                    count: eventCounts.project_form_submit || 0,
                  },
                ]}
              />
              <FunnelSteps
                title="Contact drawer"
                steps={[
                  {
                    label: "Opened",
                    count: eventCounts.contact_drawer_open || 0,
                  },
                  {
                    label: "Submitted",
                    count: eventCounts.contact_form_submit || 0,
                  },
                ]}
              />
              <p className="text-muted-foreground text-xs">
                Form starts (all forms):{" "}
                <span className="tabular-nums">
                  {eventCounts.form_start || 0}
                </span>
              </p>
            </CardContent>
          </Card>

          <Card className="gap-2 md:col-span-1 lg:col-span-4 pt-0">
            <CardHeader className="bg-muted/50 py-3">
              <CardTitle>Leads by Channel</CardTitle>
              <CardAction>
                <Ellipsis className="size-4" />
              </CardAction>
            </CardHeader>
            <CardContent className="px-0">
              <Table className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
                <TableHeader className="[&_tr]:border-border/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-8 font-normal">Channel</TableHead>
                    <TableHead className="h-8 w-24 text-right font-normal">
                      Sessions
                    </TableHead>
                    <TableHead className="h-8 w-24 text-right font-normal">
                      Key Events
                    </TableHead>
                    <TableHead className="h-8 w-20 text-right font-normal">
                      Conv Rate
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_tr]:border-border/50">
                  {channels.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={4}
                        className="h-32 py-4 text-center text-muted-foreground text-sm">
                        No channel data available for this range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    channels.map((row) => (
                      <TableRow
                        className="hover:bg-transparent"
                        key={row.channel}>
                        <TableCell className="py-4 font-medium">
                          {row.channel}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.sessions}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.keyEvents}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {row.sessions > 0
                            ? `${((row.keyEvents / row.sessions) * 100).toFixed(1)}%`
                            : "0.0%"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  );
}
