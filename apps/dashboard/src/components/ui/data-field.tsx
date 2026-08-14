import { cn } from "@/lib/utils";

type DataFieldVariant = "default" | "icon";

interface DataFieldProps {
  /** The field caption (e.g. "Primary Address"). */
  label: React.ReactNode;
  /** The field value — any node. Falsy/empty renders the `empty` placeholder. */
  children?: React.ReactNode;
  /** Placeholder shown when there's no value (e.g. "Not provided", "Not set"). */
  empty?: string;
  variant?: DataFieldVariant;
  className?: string;
  labelClassName?: string;
}

/** A value is "missing" when it's null, undefined, false, or an empty string. */
function isEmpty(value: React.ReactNode) {
  return value == null || value === false || value === "";
}

/**
 * Read-only label/value pair for display cards. Built on `<dl>/<dt>/<dd>` so the
 * label→value relationship is semantic and the caption stays selectable —
 * unlike the form-oriented `Label`/`Field` components, which render a `<label>`
 * with `select-none`. When the value is missing, the `empty` placeholder is
 * shown so each field can phrase its own null state ("Not set", "Unassigned",
 * …). Prototype lives here while we settle the card theme; promote to
 * `components/ui` once it's proven.
 */
export function DataField({
  label,
  children,
  empty = "—",
  variant = "default",
  className,
  labelClassName,
}: DataFieldProps) {
  return (
    <dl
      data-variant={variant}
      className={cn(
        "flex min-h-10 flex-col gap-2 data-[variant=icon]:min-h-0 data-[variant=icon]:flex-row data-[variant=icon]:items-center data-[variant=icon]:gap-3 data-[variant=icon]:text-[12px]",
        className,
      )}
    >
      <dt
        data-variant={variant}
        className={cn(
          "flex items-center gap-1 text-muted-foreground text-xs uppercase leading-none tracking-wider data-[variant=icon]:gap-0 data-[variant=icon]:leading-normal data-[variant=icon]:text-muted-foreground/80 data-[variant=icon]:normal-case data-[variant=icon]:tracking-normal [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
          labelClassName,
        )}
      >
        {label}
      </dt>
      <dd>
        {isEmpty(children) ? (
          <span
            className={cn(
              "text-muted-foreground text-xs font-light italic",
              variant === "icon" &&
                "text-muted-foreground text-xs font-light italic",
            )}
          >
            {empty}
          </span>
        ) : (
          children
        )}
      </dd>
    </dl>
  );
}
