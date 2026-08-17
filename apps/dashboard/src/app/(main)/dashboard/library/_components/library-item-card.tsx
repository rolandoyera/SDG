import Link from "next/link";

import {
  ExternalLink,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { DashboardImage } from "@/components/dashboard-image";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { H3 } from "@/components/ui/typography";
import type { LibraryItem, Vendor } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { DataField } from "@/components/ui/data-field";

export function LibraryItemCard({
  item,
  parentVendor,
}: {
  item: LibraryItem;
  parentVendor?: Vendor;
}) {
  const vendorName = parentVendor?.name || "Unknown Vendor";
  const profitable = item.sellingPrice > item.unitCost;
  // Items without a selling price carry the org's default markup in the data;
  // showing it would imply pricing exists, so display 0 instead.
  const displayMarkup = item.sellingPrice > 0 ? Math.round(item.markup) : 0;

  return (
    <Card className="group relative flex h-full flex-col overflow-hidden pt-0 transition-all duration-200 has-[.detail-link:hover]:-translate-y-1 has-[.detail-link:hover]:shadow-md">
      {/* Visual Thumbnail Area */}
      <Link
        href={`/dashboard/library/${item.itemId}`}
        className="detail-link relative flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden border-border/40 border-b bg-muted/40">
        {item.coverImageUrl ? (
          <DashboardImage
            priority
            fit="height"
            src={item.coverImageUrl}
            alt={item.name}
            sizes="(min-width: 1536px) 14vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="transition-transform duration-200"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-muted">
            <ShoppingBag className="size-8 text-muted-foreground/30" />
          </div>
        )}
      </Link>

      {/* Sourcing Category & Subcategory Tags - link to the filtered catalog.
          Sibling of the thumbnail link (never nest anchors); the Card is
          `relative`, so the overlay position is unchanged. */}
      <div className="absolute top-2 left-2.5 z-10 flex items-center gap-1.5">
        <Link
          href={`/dashboard/library?category=${encodeURIComponent(item.category)}`}>
          <Badge variant="overlay">{item.category}</Badge>
        </Link>
        {item.subcategory && (
          <Link
            href={`/dashboard/library?category=${encodeURIComponent(item.category)}&subcategory=${encodeURIComponent(item.subcategory)}`}>
            <Badge variant="overlay">{item.subcategory}</Badge>
          </Link>
        )}
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 py-0">
        <div className="flex-1">
          {/* Item Name - Clicking/hovering on the title takes you to the detail page */}
          <H3 className="transition-colors group-has-[.detail-link:hover]:text-primary">
            <Link
              href={`/dashboard/library/${item.itemId}`}
              className="detail-link block">
              {item.name}
            </Link>
          </H3>

          {/* Vendor Name - Clicking on the vendor name filters the vendor profile in directory */}
          <div className="mt-1 flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
            {item.vendorId ? (
              item.sourcingLink ? (
                <a
                  href={
                    item.sourcingLink.startsWith("http")
                      ? item.sourcingLink
                      : `https://${item.sourcingLink}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-0.5 truncate font-medium text-foreground/80 hover:text-primary hover:underline">
                  {vendorName}
                  <ExternalLink className="ml-1 size-2.5 shrink-0" />
                </a>
              ) : (
                <Link
                  href={`/dashboard/vendors/${item.vendorId}`}
                  className="flex items-center gap-0.5 truncate font-medium text-foreground/80 hover:text-primary hover:underline">
                  {vendorName}
                  <ExternalLink className="size-2.5 shrink-0" />
                </Link>
              )
            ) : (
              <span className="font-medium text-foreground/60">
                {vendorName}
              </span>
            )}
          </div>
        </div>
        <div className="mt-auto -mb-4 text-right">
          <Badge
            className="text-[9px] pr-0"
            variant={profitable ? "trendingUp" : "trendingDown"}>
            {profitable ? (
              <TrendingUp className="size-3" />
            ) : (
              <TrendingDown className="size-3" />
            )}
            {displayMarkup}% markup
          </Badge>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col h-16">
        {/* Pricing Matrix summary */}
        <div className="flex w-full items-center justify-between">
          <DataField label="Cost" empty="Not set">
            <span className="text-foreground/75 text-sm">
              {formatCurrency(item.unitCost)}
            </span>
          </DataField>
          <DataField
            className="text-right"
            label="Selling Price"
            empty="Not set">
            <span className="text-primary text-sm font-semibold">
              {formatCurrency(item.sellingPrice)}
            </span>
          </DataField>
        </div>
      </CardFooter>
    </Card>
  );
}
