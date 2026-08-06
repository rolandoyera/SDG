"use client";

import { Loader2, Plus, ReceiptText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ProposalsPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pt-6">
      {/* Header section with Premium typography */}
      <div>
        <h1 className="font-bold font-heading text-3xl tracking-tight">
          Interactive Proposals
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Create room-by-room spreadsheets, override quantities, print luxury
          client catalog PDFs, and dispatch via Brevo.
        </p>
      </div>

      {/* Modern teaser card for Phase 2 spreadsheet matrix */}
      <Card className="relative overflow-hidden border bg-linear-to-br from-primary/10 via-background to-background p-6">
        {/* Decorative subtle visual accent */}
        <div className="absolute -top-12 -right-12 size-40 rounded-full bg-primary/10 blur-2xl" />

        <CardHeader className="flex flex-row items-center gap-3 p-0 pb-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded border border-primary/20 bg-primary/15 text-primary">
            <ReceiptText className="size-5" />
          </div>
          <div>
            <CardTitle className="flex items-center gap-1.5 font-heading font-semibold text-lg">
              Room-by-Room Spreadsheet Matrix
              <span className="animate-pulse rounded-full bg-primary/20 px-2 py-0.5 font-bold text-[9px] text-primary uppercase tracking-wider">
                Phase 2
              </span>
            </CardTitle>
            <CardDescription className="text-xs">
              Sourcing presentation engine & dynamic client cost calculator.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4 p-0 text-muted-foreground text-sm leading-relaxed">
          <p>
            The upcoming **Interactive Proposal Matrix** will link your projects
            directly to items in the **Global Catalog Library**. You will be
            able to:
          </p>
          <ul className="grid list-inside list-disc grid-cols-1 gap-2 pl-1.5 font-semibold text-foreground/80 text-xs md:grid-cols-2">
            <li>Nesting & collapsible Room Headers</li>
            <li>Drag & drop reordering handles</li>
            <li>Inline "Calculate Costs" Popups</li>
            <li>Local fabric, size & price overrides</li>
            <li>Aggregate sums for cost/markups</li>
            <li>Sourcing images inline previews</li>
          </ul>

          <div className="mt-2 flex items-center gap-3 border-t pt-5">
            <Button disabled className="flex items-center gap-2">
              <Plus className="size-4" />
              Create Draft Proposal
            </Button>
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground italic">
              <Loader2 className="size-3 animate-spin text-primary" />
              Awaiting Phase 2 implementation. Database and collection
              structures are ready!
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
