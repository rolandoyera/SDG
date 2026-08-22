import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const nextLinkVariants = cva(
  "text-card-foreground hover:underline hover:text-primary underline-offset-2",
  {
    variants: {
      variant: {
        default: "",
        label: "text-primary font-medium tracking-wider text-xs uppercase",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function NextLink({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof Link> & VariantProps<typeof nextLinkVariants>) {
  return (
    <Link
      data-slot="next-link"
      data-variant={variant}
      className={cn(nextLinkVariants({ variant }), className)}
      {...props}
    />
  );
}

export { NextLink, nextLinkVariants };
