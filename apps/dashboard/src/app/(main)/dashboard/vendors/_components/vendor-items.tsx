"use client";

import Link from "next/link";

import { Plus, ShoppingBag } from "lucide-react";

import { DashboardImage } from "@/components/dashboard-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { LibraryItem } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface VendorItemsProps {
  items: LibraryItem[];
  onAddItem?: () => void;
}

export function VendorItems({ items, onAddItem }: VendorItemsProps) {
  return (
    <Card
      variant="panel"
      className="flex h-full max-h-[80vh] flex-col md:max-h-none">
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <ShoppingBag className="icons" />
            Linked Library Items
            <Badge variant="secondary">{items.length}</Badge>
          </span>
        </CardTitle>
        {onAddItem && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={onAddItem}
                className="size-8 shrink-0 rounded-full">
                <Plus className="size-4" />
                <span className="sr-only">Add Items</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add Items</TooltipContent>
          </Tooltip>
        )}
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
            <ShoppingBag className="mb-2 size-10 text-muted-foreground/30" />
            <p className="font-medium text-muted-foreground text-sm">
              No linked products
            </p>
            <p className="mt-1 max-w-60 text-muted-foreground/60 text-xs">
              Items from the product library will appear here when added to this
              vendor.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {items.map((item) => (
              <div key={item.itemId} className="flex items-center gap-3 p-3">
                {/* Thumbnail */}
                <div className="relative flex size-32 shrink-0 items-center justify-center overflow-hidden bg-background/50">
                  {item.coverImageUrl ? (
                    <DashboardImage
                      src={item.coverImageUrl}
                      alt={item.name}
                      sizes="128px"
                      className="object-contain p-0.5"
                    />
                  ) : (
                    <ShoppingBag className="size-5 text-muted-foreground/30" />
                  )}
                </div>

                {/* Details */}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/library/${item.itemId}`}
                    className="line-clamp-1 font-heading font-semibold text-sm transition-colors hover:text-primary hover:underline">
                    {item.name}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-2">
                    {item.category && (
                      <Label>
                        In: <span className="">{item.category}</span>
                      </Label>
                    )}
                    {item.category && <Label size="large">→</Label>}
                    {item.subcategory && <Label> {item.subcategory}</Label>}
                  </div>
                </div>

                {/* Pricing */}
                <div className="shrink-0 text-right">
                  <Label className="block">Retail</Label>
                  <p className="font-semibold text-foreground text-sm">
                    {formatCurrency(item.sellingPrice, { noDecimals: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
