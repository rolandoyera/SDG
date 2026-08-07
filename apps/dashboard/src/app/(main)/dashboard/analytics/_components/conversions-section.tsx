import { Ellipsis } from "lucide-react";

import { HatchBarChart } from "@/components/charts/hatch-bar-chart";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ConversionsData,
  fetchConversionsData,
} from "@/server/analytics-actions";

import { AnalyticsSetupRequired } from "./analytics-setup-required";
import { KeyEventsChart } from "./key-events-chart";
import { LeadsByChannelTable } from "./leads-by-channel-table";

interface FunnelStep {
  label: string;
  count: number;
}

/**
 * A funnel rendered with the shared HatchBarChart so bars and tooltips match
 * the Traffic Sources card. Each step's tooltip heading carries its rate vs
 * the previous step (share-of-total would be meaningless for funnel steps).
 */
function FunnelSteps({ title, steps }: { title: string; steps: FunnelStep[] }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium text-sm">{title}</p>
      <HatchBarChart
        data={steps.map((step, index) => {
          const prevCount = index > 0 ? steps[index - 1].count : null;
          const stepRate =
            prevCount && prevCount > 0
              ? `${((step.count / prevCount) * 100).toFixed(0)}% of previous`
              : null;

          return {
            barText: step.label,
            value: step.count,
            valueLabel: step.count.toLocaleString(),
            tooltipLabel: stepRate ? `${step.label} (${stepRate})` : step.label,
          };
        })}
        seriesLabel="Users"
      />
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
      <HatchBarChart
        data={LEAD_TYPES.map((type) => {
          const count = eventCounts[type.eventName] || 0;

          return {
            barText: type.label,
            value: count,
            valueLabel: count.toLocaleString(),
          };
        })}
        seriesLabel="Leads"
        showPercentage
      />
    </div>
  );
}

export async function ConversionsSection({ range }: { range?: string }) {
  const result = await fetchConversionsData(range);

  if (!result.success || !result.data) {
    return (
      <div className="rounded bg-card shadow-xs ring-1 ring-foreground/5">
        <AnalyticsSetupRequired
          error={result.error}
          title="Conversions Error"
          className="min-h-50"
        />
      </div>
    );
  }

  const { trend, channels, eventCounts, formStarts, contactPageViews } =
    result.data;
  const hasKeyEvents = trend.some((point) => point.keyEvents > 0);
  // Aggregate starts exist but the per-form split is empty → the form_type
  // custom dimension isn't registered (or predates registration).
  const startsUnsplit =
    (eventCounts.form_start || 0) > 0 &&
    formStarts.modal + formStarts.contact === 0;

  return (
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
              <div className="flex h-64 items-center justify-center text-center text-muted-foreground text-sm">
                No key events recorded in this range.
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
                { label: "Started", count: formStarts.modal },
                {
                  label: "Submitted",
                  count: eventCounts.project_form_submit || 0,
                },
              ]}
            />
            <FunnelSteps
              title="Contact form"
              steps={[
                { label: "Page views", count: contactPageViews },
                { label: "Started", count: formStarts.contact },
                {
                  label: "Submitted",
                  count: eventCounts.contact_form_submit || 0,
                },
              ]}
            />
            {startsUnsplit && (
              <p className="text-muted-foreground text-xs">
                Form starts (all forms):{" "}
                <span className="tabular-nums">
                  {eventCounts.form_start || 0}
                </span>{" "}
                — register the <code>form_type</code> custom dimension in GA4
                Admin to split the Started steps per form.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="gap-2 md:col-span-1 lg:col-span-4 pt-0">
          <CardHeader className="bg-muted/50 py-3">
            <CardTitle>Leads by Channel</CardTitle>
            <CardAction>
              <Ellipsis className="size-4" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col px-0">
            <LeadsByChannelTable data={channels} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
