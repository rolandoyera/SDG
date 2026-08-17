"use client";

import Link from "next/link";

import { Plus, ShoppingBag } from "lucide-react";

import { DashboardImage } from "@/components/dashboard-image";
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
            Vendor Library Items
            <span className="rounded-full bg-foreground text-xs font-semibold text-background size-4 flex items-center justify-center">
              {items.length}
            </span>
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
              No vendor products
            </p>
            <p className="mt-1 max-w-60 text-muted-foreground/60 text-xs">
              Items from the product library will appear here when added to this
              vendor.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {items.map((item) => (
              <div
                key={item.itemId}
                className="grid grid-cols-1 md:grid-cols-[.5fr_.25fr_.25fr_.25fr_.1fr] gap-3 justify-between p-3">
                <div className="flex gap-2">
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
                  <div className="flex flex-col gap-1.5 mt-4">
                    <div className="flex items-center gap-2">
                      {item.category && (
                        <Label>
                          In:{" "}
                          <Link
                            href={`/dashboard/library?category=${encodeURIComponent(item.category)}`}
                            className="cursor-pointer transition-colors hover:text-primary hover:underline">
                            {item.category}
                          </Link>
                        </Label>
                      )}
                      {item.category && <Label>→</Label>}
                      {item.subcategory && (
                        <Label>
                          <Link
                            href={`/dashboard/library?category=${encodeURIComponent(item.category)}&subcategory=${encodeURIComponent(item.subcategory)}`}
                            className="cursor-pointer transition-colors hover:text-primary hover:underline">
                            {item.subcategory}
                          </Link>
                        </Label>
                      )}
                    </div>
                    <Link
                      href={`/dashboard/library/${item.itemId}`}
                      className="line-clamp-1 font-heading font-semibold text-sm transition-colors hover:text-primary hover:underline">
                      {item.name}
                    </Link>
                  </div>
                </div>
                {/* Finish Color */}
                <div className="flex flex-col gap-1.5 mt-4">
                  <Label className="block">Finish / Color</Label>
                  <p className="font-medium text-foreground text-sm capitalize">
                    {item.finishColor}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 mt-4">
                  <Label className="block">Materials</Label>
                  <p className="font-medium text-foreground text-sm capitalize">
                    {item.materials}
                  </p>
                </div>
                {/* Dimensions */}
                <div className="flex flex-col gap-1.5 mt-4">
                  <Label className="block">Dimensions</Label>
                  <p className="font-medium text-foreground text-sm capitalize">
                    {item.dimensions}
                  </p>
                </div>

                {/* Pricing */}
                <div className="text-right flex flex-col gap-1.5 mt-4">
                  <Label className="block">Retail</Label>
                  <p className="font-medium text-foreground text-sm">
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
