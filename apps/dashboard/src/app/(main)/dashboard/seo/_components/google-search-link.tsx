import { ExternalLink } from "lucide-react";

/**
 * The text as a live Google query, for eyeballing what a heading competes
 * against. A plain anchor on purpose: pages can't open incognito windows
 * themselves, but a real link gets Chrome's "Open link in incognito window"
 * context-menu item for checking the SERP without personalization.
 */
export function GoogleSearchLink({ query }: { query: string }) {
  return (
    <a
      href={`https://www.google.com/search?${new URLSearchParams({ q: query })}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline">
      {query}
      <ExternalLink className="ml-1 inline size-3.5 shrink-0 align-[-2px]" />
    </a>
  );
}
