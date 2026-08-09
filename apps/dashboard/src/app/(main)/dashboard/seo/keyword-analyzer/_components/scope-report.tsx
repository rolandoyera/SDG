"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PageHeading, PhraseRow, ScopeReport } from "@/server/seo-actions";

export type ScopeKey = "all" | "body" | "headlines" | "links" | "images";

export const SCOPES: { key: ScopeKey; label: string }[] = [
  { key: "all", label: "All text" },
  { key: "body", label: "Body text" },
  { key: "headlines", label: "Headlines" },
  { key: "links", label: "Links" },
  { key: "images", label: "Images" },
];

export function ScopePicker({
  value,
  onChange,
}: {
  value: ScopeKey;
  onChange: (scope: ScopeKey) => void;
}) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as ScopeKey)}>
      <TabsList className="gap-1">
        {SCOPES.map((scope) => (
          <TabsTrigger key={scope.key} value={scope.key}>
            {scope.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function PhraseTable({ title, rows }: { title: string; rows: PhraseRow[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-bold text-sm text-primary">{title}</p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No repeated phrases.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Phrase</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead className="text-right">Density</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.phrase}>
                <TableCell className="font-medium">{row.phrase}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.count}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {(row.density * 100).toFixed(2)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function HeadingsTable({ headings }: { headings: PageHeading[] }) {
  // Key rows by content + occurrence (repeated headings are legitimate).
  const occurrences = new Map<string, number>();
  const rows = headings.map((heading) => {
    const base = `${heading.tag}:${heading.text}`;
    const nth = occurrences.get(base) ?? 0;
    occurrences.set(base, nth + 1);
    return { ...heading, key: `${base}#${nth}` };
  });

  return (
    <div className="flex flex-col gap-2">
      <p className="font-bold text-sm text-primary">Page Headings</p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No headings on the page.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Tag</TableHead>
              <TableHead>Heading</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((heading) => (
              <TableRow key={heading.key}>
                <TableCell className="font-medium">{heading.tag}</TableCell>
                <TableCell className="wrap-break-word whitespace-normal">
                  {heading.text || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/**
 * The 1/2/3-word phrase tables for one scope, with its word totals. Pass
 * `headings` (Headlines scope only) to list the page's actual headings below.
 */
export function ScopePhraseTables({
  scope,
  headings,
}: {
  scope: ScopeReport;
  headings?: PageHeading[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        {scope.words.toLocaleString()} words (
        {scope.wordsWithStop.toLocaleString()} incl. stop words) ·{" "}
        {scope.unique.toLocaleString()} unique
      </p>
      <PhraseTable title="Words" rows={scope.one} />
      <PhraseTable title="2-Word Phrases" rows={scope.two} />
      <PhraseTable title="3-Word Phrases" rows={scope.three} />
      {headings && <HeadingsTable headings={headings} />}
    </div>
  );
}
