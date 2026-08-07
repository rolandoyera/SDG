import Image from "next/image";
import type { ReactNode } from "react";

import { APP_CONFIG } from "@/config/app-config";
import { cn } from "@/lib/utils";

interface ReportShellProps {
  /** Document kind, e.g. "Analytics Report", "Proposal", "Invoice". */
  title: string;
  /** Optional second line under the title — date range, client, reference #. */
  subtitle?: string;
  /** Extra header content on the right, under the title (overrides the default
   *  "Generated …" line when provided). */
  headerMeta?: ReactNode;
  /** The document body. */
  children: ReactNode;

  footer?: ReactNode;
}

/**
 * The foundation of the document system — a branded, client-facing "paper"
 * sheet shared by every exportable report (analytics today; proposals and
 * invoices later). It owns the document frame only: branded header, body, and
 * footer. Each report component (e.g. AnalyticsReport) owns its own content
 * layout, typography, and spacing.
 *
 * Deliberately independent of the dashboard: the sheet is pinned to a light
 * palette in report.css so the app's (possibly dark) theme never bleeds into a
 * document, and it is rendered from its own `/reports/*` route outside the
 * dashboard shell. PDF export is currently the browser print dialog; this same
 * route is what a future Playwright renderer would target.
 *
 * Company identity uses the default app brand. Reports can accept resolved
 * tenant branding later when report routes need host-aware document chrome.
 */
export function ReportShell({
  title,
  subtitle,
  headerMeta,
  children,
  footer,
}: ReportShellProps) {
  const brand = APP_CONFIG.brand;
  const generatedOn = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="report-screen flex min-h-screen justify-center bg-muted/60 p-4 md:p-8">
      <div className="report-sheet w-full max-w-[297mm] rounded bg-background text-foreground shadow-lg ring-1 ring-foreground/5">
        <div className="flex flex-col gap-10 p-10 md:p-14">
          <header className="report-keep-together flex items-start justify-between gap-6 border-b pb-6">
            <div className="flex items-center gap-3">
              <Image
                src={brand.image.src}
                alt={brand.name}
                width={40}
                height={40}
                priority
              />
              <div>
                <p className="font-semibold text-lg leading-tight">
                  {brand.name}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-semibold text-xl leading-tight">{title}</p>
              {subtitle ? (
                <p className="mt-1 text-muted-foreground text-sm">{subtitle}</p>
              ) : null}
              {headerMeta ?? (
                <p className="mt-0.5 text-muted-foreground text-xs">
                  Generated {generatedOn}
                </p>
              )}
            </div>
          </header>

          <main className="flex flex-col gap-12">{children}</main>

          <footer className="report-keep-together mt-2 flex items-center justify-between gap-4 border-t pt-4 text-muted-foreground text-xs">
            <span>{footer ?? `${brand.name} — confidential`}</span>
            <span>Generated {generatedOn}</span>
          </footer>
        </div>
      </div>
    </div>
  );
}

interface ReportSectionProps {
  /** Section heading, e.g. "Performance summary". */
  title: string;
  /** Optional one-line description under the heading. */
  description?: string;
  children: ReactNode;
  className?: string;
  /** Keep the whole section on one page where it fits (default true). Set false
   *  for tall content that is expected to span pages. */
  keepTogether?: boolean;
  /** Force a page break before this section. */
  breakBefore?: boolean;
}

/**
 * A titled document section with page-break behaviour. Gives every report a
 * consistent heading rhythm so report components focus on their content, not
 * on re-styling section chrome.
 */
export function ReportSection({
  title,
  description,
  children,
  className,
  keepTogether = true,
  breakBefore = false,
}: ReportSectionProps) {
  return (
    <section
      className={cn(
        keepTogether && "report-keep-together",
        breakBefore && "report-break-before",
        "flex flex-col gap-4",
        className,
      )}>
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-base tracking-tight">{title}</h2>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
