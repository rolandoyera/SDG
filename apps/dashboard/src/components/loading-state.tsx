import { cn } from "@/lib/utils";

/**
 * The one loading state. Fills the dashboard content area (viewport minus the
 * app header and page padding) so the spinner sits at the center of the
 * screen: pages render this alone while they fetch, then reveal inside
 * `FadeIn`. Pages that keep a live toolbar on screen (Ads, Analytics,
 * Instagram, Usage, Diagnostics) pass a shorter min-height so the spinner
 * centers in the body below it. `AuthGuard` passes `h-screen` for the session
 * gate, which renders before the app shell exists.
 */
export function LoadingState({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[calc(100svh-7rem)] flex-col items-center justify-center gap-4",
        className,
      )}
    >
      <div className="relative size-16">
        <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <div className="absolute inset-2 animate-spin rounded-full border-4 border-primary/40 border-b-transparent" />
      </div>
      <p className="animate-pulse font-medium text-muted-foreground text-xs uppercase tracking-widest">
        {label}
      </p>
    </div>
  );
}
