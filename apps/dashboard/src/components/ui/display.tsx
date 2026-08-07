import * as React from "react";

import { cn } from "@/lib/utils";

function Display({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="display"
      className={cn(
        "flex flex-col overflow-hidden rounded bg-card pb-2 pt-4 text-sm text-card-foreground shadow-xs bg-linear-to-t from-primary/5 to-card ring-1 ring-foreground/5 dark:bg-card",
        className,
      )}
      {...props}
    />
  );
}

function DisplayHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="display-header"
      className={cn("flex items-center gap-4 px-4", className)}
      {...props}
    />
  );
}

function DisplayIcon({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="display-icon"
      className={cn(
        "flex size-7 items-center justify-center rounded bg-primary/10 text-primary",
        className,
      )}
      {...props}
    />
  );
}

function DisplayTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="display-title"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function DisplayContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="display-content"
      className={cn("flex grow flex-col gap-6 px-4 pt-4", className)}
      {...props}
    />
  );
}

function DisplayFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="display-footer"
      className={cn("flex items-end gap-4 px-4 pt-4", className)}
      {...props}
    />
  );
}

export {
  Display,
  DisplayHeader,
  DisplayIcon,
  DisplayTitle,
  DisplayContent,
  DisplayFooter,
};
