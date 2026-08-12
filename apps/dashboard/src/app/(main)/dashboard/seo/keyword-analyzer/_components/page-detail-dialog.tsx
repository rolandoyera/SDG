"use client";

import { Fragment, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PageAnalysis } from "@/server/seo-actions";

import { GoogleSearchLink } from "./google-search-link";
import { type ScopeKey, ScopePhraseTables, ScopePicker } from "./scope-report";

/**
 * Image srcs run long — an inline `data:` placeholder can be hundreds of
 * characters — and the middle is the least informative part: the head says
 * what kind of source it is, the tail carries the filename or the bit that
 * distinguishes it from its neighbours. The full value stays on hover.
 */
function truncateMiddle(value: string, max = 72): string {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(-(max - 1 - head))}`;
}

function DetailBody({ page }: { page: PageAnalysis }) {
  const [scope, setScope] = useState<ScopeKey>("all");

  // Key by content + occurrence: the same placeholder src (or, on a broken
  // page, the same H1 text) repeats legitimately.
  const keyed = <T,>(values: T[], text: (value: T) => string) => {
    const occurrences = new Map<string, number>();
    return values.map((value) => {
      const nth = occurrences.get(text(value)) ?? 0;
      occurrences.set(text(value), nth + 1);
      return { value, key: `${text(value)}#${nth}` };
    });
  };
  const missingAlts = keyed(page.missingAltSrcs, (src) => src);
  const h1s = keyed(page.h1s, (h1) => h1);

  return (
    <div className="flex flex-col gap-6 overflow-y-auto px-1">
      <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="font-medium">Title</dt>
        <dd className="text-muted-foreground">{page.title || "—"}</dd>
        <dt className="font-medium">Meta description</dt>
        <dd className="text-muted-foreground">{page.metaDescription || "—"}</dd>
        <dt className="font-medium">H1</dt>
        <dd className="text-muted-foreground">
          {h1s.length
            ? h1s.map((item, index) => (
                <Fragment key={item.key}>
                  {index > 0 && " · "}
                  <GoogleSearchLink query={item.value} />
                </Fragment>
              ))
            : "—"}
        </dd>
        <dt className="font-medium">Links</dt>
        <dd className="text-muted-foreground">
          {page.linkCount} ({page.internalLinkCount} internal /{" "}
          {page.externalLinkCount} external)
        </dd>
        <dt className="font-medium">Images</dt>
        <dd className="text-muted-foreground">
          {page.imageCount} ({page.missingAltCount} missing alt)
        </dd>
        {page.missingAltCount > 0 && (
          <>
            <dt className="font-medium">Missing alts</dt>
            <dd className="flex min-w-0 flex-col gap-1 text-muted-foreground">
              {missingAlts.map((item) => (
                <span key={item.key} title={item.value} className="truncate">
                  {truncateMiddle(item.value)}
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>

      <ScopePicker value={scope} onChange={setScope} />
      <ScopePhraseTables
        scope={page.scopes[scope]}
        headings={scope === "headlines" ? page.headings : undefined}
        links={scope === "links" ? page.bodyLinks : undefined}
      />
    </div>
  );
}

export function PageDetailDialog({
  page,
  onClose,
}: {
  page: PageAnalysis | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={page !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        {page && (
          <>
            <DialogHeader>
              <DialogTitle>{page.path}</DialogTitle>
              <DialogDescription>{page.url}</DialogDescription>
            </DialogHeader>
            {/* Keyed by path so the scope selection resets per page. */}
            <DetailBody key={page.path} page={page} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
