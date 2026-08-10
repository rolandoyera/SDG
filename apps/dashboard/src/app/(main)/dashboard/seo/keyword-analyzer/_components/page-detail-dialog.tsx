"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PageAnalysis } from "@/server/seo-actions";

import { type ScopeKey, ScopePhraseTables, ScopePicker } from "./scope-report";

function DetailBody({ page }: { page: PageAnalysis }) {
  const [scope, setScope] = useState<ScopeKey>("all");

  return (
    <div className="flex flex-col gap-6 overflow-y-auto px-1">
      <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="font-medium">Title</dt>
        <dd className="text-muted-foreground">{page.title || "—"}</dd>
        <dt className="font-medium">Meta description</dt>
        <dd className="text-muted-foreground">{page.metaDescription || "—"}</dd>
        <dt className="font-medium">H1</dt>
        <dd className="text-muted-foreground">{page.h1s.join(" · ") || "—"}</dd>
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
            <dd className="break-all text-muted-foreground">
              {page.missingAltSrcs.join(", ")}
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
