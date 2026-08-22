import { cn } from "@/lib/utils";

interface H1Props {
  children: React.ReactNode;
  className?: string;
}

export function P({ children, className }: H1Props) {
  return <p className={cn("text-sm", className)}>{children}</p>;
}

export function H1({ children, className }: H1Props) {
  return (
    <h1
      className={cn(
        "scroll-m-20 text-3xl font-medium tracking-tight text-balance text-card-foreground",
        className,
      )}
    >
      {children}
    </h1>
  );
}

export function H2({ children, className }: H1Props) {
  return (
    <h2
      className={cn(
        "scroll-m-20 text-2xl font-medium tracking-tight text-card-foreground",
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function H3({ children, className }: H1Props) {
  return (
    <h3
      className={cn(
        "font-heading text-lg leading-snug font-medium text-card-foreground",
        className,
      )}
    >
      {children}
    </h3>
  );
}
