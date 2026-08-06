"use client";

import { useRef, useState } from "react";

import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Wraps an MDX `<pre>` code block with a hover-revealed copy button. The raw
 * text is read straight off the rendered DOM (`textContent`) rather than parsed
 * from the highlighted span tree, so it copies exactly what's shown.
 */
export function MdxCodeBlock({
  children,
  ...props
}: React.ComponentProps<"pre">) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = preRef.current?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Copy code block failed:", error);
    }
  };

  return (
    <div className="relative">
      <pre
        ref={preRef}
        className="overflow-x-auto rounded p-4 text-sm [&>code]:bg-transparent [&>code]:p-0"
        {...props}>
        {children}
      </pre>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleCopy}
            aria-label="Copy code"
            className="absolute top-2 right-2 size-7 rounded-md border border-white/15 bg-white/90 text-zinc-700 shadow-sm backdrop-blur-sm transition-colors hover:bg-white hover:text-zinc-900 dark:hover:bg-white dark:hover:text-zinc-900">
            {copied ? (
              <Check className="size-3.5 text-emerald-500" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{copied ? "Copied" : "Copy"}</TooltipContent>
      </Tooltip>
    </div>
  );
}
