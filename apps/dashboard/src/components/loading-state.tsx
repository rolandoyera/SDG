import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Single loading state for a page body that streams in behind one Suspense
 * boundary (Ads, Analytics, Instagram) or waits on one client fetch (SEO
 * tools). Same spinner treatment as the Library page, in a card shell so the
 * layout holds its shape until the content fades in.
 */
export function LoadingState({
  label,
  className,
}: {
  /** Rendered as "Loading {label}". */
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[calc(100vh-18rem)] flex-col items-center justify-center gap-3",
        className,
      )}
    >
      <Loader2 className="size-8 animate-spin text-primary" />
      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
        Loading {label}
      </p>
    </div>
  );
}
