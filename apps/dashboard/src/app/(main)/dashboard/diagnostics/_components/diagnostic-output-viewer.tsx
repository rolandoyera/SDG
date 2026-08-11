"use client";

import { useMemo, useState, type ComponentType, type ReactNode } from "react";

import { Check, Copy, WrapText } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type OutputKind = "markdown" | "prompt" | "json";

interface DiagnosticOutputViewerProps {
  title: string;
  description: string;
  emptyText: string;
  value: string;
  kind: OutputKind;
  icon: ComponentType<{ className?: string }>;
  meta?: string;
}

const JSON_TOKEN_REGEX =
  /("(?:\\u[\dA-Fa-f]{4}|\\[^u]|[^\\"])*"(?=\s*:)|"(?:\\u[\dA-Fa-f]{4}|\\[^u]|[^\\"])*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\],:])/g;

function copyLabel(copied: boolean) {
  return copied ? "Copied" : "Copy";
}

function normalizeJson(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.stringify(JSON.parse(withoutFence), null, 2);
  } catch {
    return null;
  }
}

function renderJsonLine(line: string, index: number) {
  const parts = line.match(JSON_TOKEN_REGEX);
  if (!parts) {
    return <span key={index}>{line}</span>;
  }

  let cursor = 0;
  const nodes: ReactNode[] = [];

  for (const part of parts) {
    const start = line.indexOf(part, cursor);
    if (start > cursor) {
      nodes.push(line.slice(cursor, start));
    }

    const isKey =
      part.startsWith('"') &&
      line
        .slice(start + part.length)
        .trimStart()
        .startsWith(":");
    const className = isKey
      ? "text-primary"
      : part.startsWith('"')
        ? "text-emerald-600 dark:text-emerald-400"
        : /true|false|null/.test(part)
          ? "text-amber-600 dark:text-amber-400"
          : /^-?\d/.test(part)
            ? "text-sky-600 dark:text-sky-400"
            : "text-muted-foreground";

    nodes.push(
      <span key={`${index}-${start}`} className={className}>
        {part}
      </span>,
    );
    cursor = start + part.length;
  }

  if (cursor < line.length) {
    nodes.push(line.slice(cursor));
  }

  return <span key={index}>{nodes}</span>;
}

interface MarkdownBlock {
  id: string;
  type: "heading" | "list" | "paragraph" | "code";
  text: string;
  level?: number;
}

function MarkdownPreview({ value }: { value: string }) {
  const blocks = useMemo(() => {
    const lines = value.split(/\r?\n/);
    const grouped: MarkdownBlock[] = [];
    let paragraph: string[] = [];
    let cursor = 0;

    const nextId = (type: MarkdownBlock["type"]) => {
      cursor += 1;
      return `${type}-${cursor}`;
    };

    const flushParagraph = () => {
      const text = paragraph.join(" ").trim();
      if (text)
        grouped.push({ id: nextId("paragraph"), type: "paragraph", text });
      paragraph = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        flushParagraph();
        continue;
      }

      const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed);
      if (heading) {
        flushParagraph();
        grouped.push({
          id: nextId("heading"),
          type: "heading",
          level: heading[1].length,
          text: heading[2],
        });
        continue;
      }

      const list = /^[-*]\s+(.+)$/.exec(trimmed);
      if (list) {
        flushParagraph();
        grouped.push({ id: nextId("list"), type: "list", text: list[1] });
        continue;
      }

      if (/^(```| {4})/.test(line)) {
        flushParagraph();
        grouped.push({
          id: nextId("code"),
          type: "code",
          text: trimmed.replace(/^```/, ""),
        });
        continue;
      }

      paragraph.push(trimmed);
    }

    flushParagraph();
    return grouped;
  }, [value]);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 p-5 text-sm leading-7">
      {blocks.map((block) => {
        if (block.type === "heading") {
          const size =
            block.level === 1
              ? "text-xl"
              : block.level === 2
                ? "text-lg"
                : "text-base";
          return (
            <h3
              key={block.id}
              className={cn(
                "font-heading font-semibold text-foreground",
                size,
              )}>
              {block.text}
            </h3>
          );
        }

        if (block.type === "list") {
          return (
            <div key={block.id} className="flex gap-2 text-foreground">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/70" />
              <p>{block.text}</p>
            </div>
          );
        }

        if (block.type === "code") {
          return (
            <code
              key={block.id}
              className="block rounded border bg-muted/35 px-3 py-2 font-mono text-muted-foreground text-xs">
              {block.text}
            </code>
          );
        }

        return (
          <p key={block.id} className="text-foreground">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

function TextBlock({
  value,
  wrap,
  json,
}: {
  value: string;
  wrap: boolean;
  json?: boolean;
}) {
  const lines = useMemo(() => {
    let offset = 0;
    return value.split(/\r?\n/).map((line, index) => {
      const id = `line-${offset}`;
      offset += line.length + 1;
      return { id, line, number: index + 1 };
    });
  }, [value]);

  return (
    <div
      className={cn(
        "grid min-w-full grid-cols-[auto_1fr] gap-x-4 p-4 font-mono text-[12px] leading-6",
        wrap ? "whitespace-pre-wrap wrap-break-word" : "whitespace-pre",
      )}>
      {lines.map(({ id, line, number }) => (
        <div key={id} className="contents">
          <span className="select-none text-right text-muted-foreground/55 tabular-nums">
            {number}
          </span>
          <span className="text-foreground">
            {json ? renderJsonLine(line, number) : line || " "}
          </span>
        </div>
      ))}
    </div>
  );
}

export function DiagnosticOutputViewer({
  title,
  description,
  emptyText,
  value,
  kind,
  icon: Icon,
  meta,
}: DiagnosticOutputViewerProps) {
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(kind !== "json");
  const [showRaw, setShowRaw] = useState(false);

  const content = value.trim();
  const prettyJson = useMemo(
    () => (kind === "json" ? normalizeJson(value) : null),
    [kind, value],
  );
  const displayValue =
    kind === "json" && prettyJson && !showRaw ? prettyJson : value;
  const canPreviewMarkdown = kind === "markdown" && content.length > 0;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied diagnostic output.");
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Copy diagnostic output failed:", error);
      toast.error("Failed to copy diagnostic output.");
    }
  };

  return (
    <Card className="pt-0">
      <CardHeader className="gap-3 border-b bg-muted/20 pb-0!">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start pt-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Icon className="size-4 text-primary" />
              {title}
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              {description}
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {meta && (
              <Badge
                className="h-7 font-normal bg-background px-2.5 text-[0.8rem]"
                variant="outline">
                {meta}
              </Badge>
            )}
            {kind === "json" && prettyJson && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowRaw((current) => !current)}>
                {showRaw ? "Pretty" : "Raw"}
              </Button>
            )}
            {canPreviewMarkdown && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowRaw((current) => !current)}>
                {showRaw ? "Preview" : "Raw"}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setWrap((current) => !current)}>
              <WrapText className="size-3.5" />
              {wrap ? "No wrap" : "Wrap"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}>
              {copied ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copyLabel(copied)}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0!">
        {!content ? (
          <div className="flex min-h-70 items-center justify-center p-6 text-center text-muted-foreground text-sm">
            {emptyText}
          </div>
        ) : kind === "markdown" && !showRaw ? (
          <ScrollArea className="h-145 bg-background/30">
            <MarkdownPreview value={value} />
          </ScrollArea>
        ) : (
          <ScrollArea className="h-145 bg-background/30">
            <TextBlock
              value={displayValue}
              wrap={wrap}
              json={kind === "json" && !showRaw && Boolean(prettyJson)}
            />
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
