import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded border border-transparent px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3! text-xs",
  {
    variants: {
      variant: {
        default: "bg-card-foreground text-background [a]:hover:bg-primary/80",
        secondary:
          "border-primary/20 bg-primary/10 text-primary [a]:hover:bg-primary/20",
        destructive:
          "text-destructive dark:text-red-400 font-mono uppercase tracking-wider before:size-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-['']",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "text-muted-foreground font-mono uppercase tracking-wider before:size-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-['']",
        link: "text-primary underline-offset-4 hover:underline",
        success:
          "text-green-600 dark:text-green-400/60 font-mono uppercase tracking-wider before:size-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-['']",
        trendingUp:
          "text-green-600 dark:text-green-400/60 font-mono uppercase tracking-wider text-[12px]",
        trendingUp2:
          "text-green-600 dark:text-green-400/60 uppercase tracking-wider text-sm px-0",
        trendingDown:
          "text-destructive dark:text-red-400 font-mono uppercase tracking-wider text-[12px]",
        trendingDown2:
          "text-destructive dark:text-red-400 uppercase tracking-wider text-sm px-0",
        warning:
          "text-yellow-700 dark:text-yellow-300/60 font-mono uppercase tracking-wider before:size-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-['']",
        info: "text-cyan-600 dark:text-cyan-400 font-mono uppercase tracking-wider before:size-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-['']",
        overlay: "gap-2 bg-black/55 text-white backdrop-blur-xs",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
