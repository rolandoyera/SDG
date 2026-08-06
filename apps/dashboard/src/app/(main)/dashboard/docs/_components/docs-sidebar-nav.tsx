"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { usePageTitle } from "@/components/page-title-updater";
import { cn } from "@/lib/utils";

import { type DocsNavItem, docsHref } from "../docs-nav";

export function DocsSidebarNav({ items }: { items: DocsNavItem[] }) {
  const pathname = usePathname();
  const active = items.find((item) => docsHref(item.slug) === pathname);

  // Drive the browser tab title from the active doc's frontmatter title.
  usePageTitle(active?.slug ? active.title : "Docs");

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const href = docsHref(item.slug);
        const isActive = item === active;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "rounded px-3 py-1.5 text-sm transition-colors hover:bg-muted",
              isActive
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground",
            )}>
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}
