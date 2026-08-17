"use client";

import LunaMoon from "@/components/LunaMoon";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface AiButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  /** True while the AI call is in flight — shimmer, "Analyzing…", thinking moon. */
  loading?: boolean;
  /** Disable for non-loading reasons (empty URL field, form submitting). */
  disabled?: boolean;
  className?: string;
}

export function AiButton({
  children,
  onClick,
  loading = false,
  disabled = false,
  className,
}: AiButtonProps) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "group relative h-10 shrink-0 cursor-pointer overflow-hidden border-0 bg-indigo-900 px-3 font-medium text-sm text-white shadow-violet-500/20 shadow-xs transition-all duration-200 hover:scale-[1.01] hover:shadow-md hover:shadow-violet-500/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:hover:scale-100",
        className,
      )}>
      {loading && (
        <span className="absolute inset-0 -translate-x-full animate-shimmer bg-linear-to-r from-transparent via-white/20 to-transparent" />
      )}
      <span className="relative flex items-center gap-1.5">
        <LunaMoon
          variant="phase"
          thinking={loading}
          size={22}
          className="size-5.5"
        />
        <span>{loading ? "Analyzing…" : children}</span>
      </span>
    </Button>
  );
}
