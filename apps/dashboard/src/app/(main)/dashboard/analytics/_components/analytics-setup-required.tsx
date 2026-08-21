import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function isConfigMissing(error?: string) {
  if (!error) return true;
  const lower = error.toLowerCase();
  return lower.includes("not configured") || lower.includes("config missing");
}

interface AnalyticsSetupRequiredProps {
  error?: string;
  title?: string;
  className?: string;
}

/**
 * Uniform failure state for analytics widgets. Missing configuration renders
 * the "Setup required" badge; real API errors (quota, permissions, timeouts)
 * render a distinct badge with the error detail durably in-card, so a
 * transient Google failure never masquerades as a setup problem.
 */
export function AnalyticsSetupRequired({
  error,
  title,
  className,
}: AnalyticsSetupRequiredProps) {
  const configMissing = isConfigMissing(error);

  return (
    <div
      className={cn(
        "flex min-h-48 flex-1 flex-col items-center justify-center gap-2",
        className,
      )}
    >
      {configMissing ? (
        <Badge variant="warning">Setup required</Badge>
      ) : (
        <>
          <Badge variant="destructive">{title ?? "Data unavailable"}</Badge>
          <p className="max-w-md text-center text-xs text-muted-foreground">
            {error}
          </p>
        </>
      )}
    </div>
  );
}
