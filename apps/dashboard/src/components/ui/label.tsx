"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Label as LabelPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

const labelVariants = cva(
  "flex items-center gap-2 leading-none text-muted-foreground tracking-wider select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 uppercase text-card-foreground font-medium",
  {
    variants: {
      size: {
        default: "text-xs",
        large: "text-[12px]",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

interface LabelProps
  extends
    React.ComponentProps<typeof LabelPrimitive.Root>,
    VariantProps<typeof labelVariants> {}

function Label({ className, size, ...props }: LabelProps) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(labelVariants({ size }), className)}
      {...props}
    />
  );
}

export { Label };
