import { KpiCards } from "./_components/kpi-cards";
import { PipelineActivity } from "./_components/pipeline-activity";
import { TaskReminders } from "./_components/task-reminders";

export default function Page() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="space-y-1">
        <h2 className="text-3xl tracking-tight">Pipeline Overview</h2>
        <p className="text-muted-foreground text-sm">
          Keep tabs on leads, open opportunities, and conversion rates across
          your sales cycle.
        </p>
      </div>
      <KpiCards />
      <PipelineActivity />
      <TaskReminders />
    </div>
  );
}
