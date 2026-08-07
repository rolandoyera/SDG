"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const items = [
  { title: "Keyword Analyzer", href: "/dashboard/seo/keyword-analyzer" },
];

export function SeoSidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "rounded px-3 py-1.5 text-sm transition-colors hover:bg-muted",
            pathname === item.href
              ? "bg-muted font-medium text-foreground"
              : "text-muted-foreground",
          )}
        >
          {item.title}
        </Link>
      ))}
    </nav>
  );
}
