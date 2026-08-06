import { Calculator, TrendingDown, TrendingUp } from "lucide-react";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { LibraryItem } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface ItemPricingCardProps {
  item: LibraryItem;
}

/** Cost / markup / selling-price / net-profit in a single cohesive 4-cell row. */
export function ItemPricingCard({ item }: ItemPricingCardProps) {
  const profit = item.sellingPrice - item.unitCost;
  const profitable = profit > 0;

  return (
    <Card variant="panel">
      <CardHeader>
        <CardTitle>
          <Calculator className="icons" />
          Cost & Pricing
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 py-3">
        {/* Four-cell pricing row — gap-px/bg-border produces hairline dividers */}
        <div className="grid grid-cols-4 gap-px overflow-hidden rounded border border-border/50 bg-border text-center">
          {/* Sourcing Cost */}
          <div className="flex flex-col items-center justify-center gap-1 bg-card bg-linear-to-t from-primary/10 to-card p-3.5 shadow-xs">
            <Label className="uppercase">Cost</Label>
            <span className="font-medium text-base text-foreground">
              {formatCurrency(item.unitCost)}
            </span>
          </div>

          {/* Markup */}
          <div className="flex flex-col items-center justify-center gap-1 bg-card bg-linear-to-t from-primary/10 to-card p-3.5 shadow-xs">
            <Label className="uppercase">Markup</Label>
            <span className="font-medium text-base text-foreground">
              {Math.round(item.markup)}%
            </span>
          </div>

          {/* Selling Price */}
          <div className="flex flex-col items-center justify-center gap-1 bg-card bg-linear-to-t from-primary/10 to-card p-3.5 shadow-xs">
            <Label className="uppercase">Selling Price</Label>
            <span className="font-medium text-base text-foreground">
              {formatCurrency(item.sellingPrice)}
            </span>
          </div>

          {/* Net Profit — emerald when profitable, amber when not */}
          <div
            className={
              profitable
                ? "flex flex-col gap-1 bg-card bg-linear-to-t from-emerald-600/10 to-card p-3.5 shadow-xs"
                : "flex flex-col gap-1 bg-card bg-linear-to-t from-red-500/10 to-card p-3.5 shadow-xs"
            }>
            <span
              className={`flex items-center justify-center gap-1 font-medium text-[10px] uppercase tracking-wider ${
                profitable
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-red-700 dark:text-red-400"
              }`}>
              {profitable ? (
                <TrendingUp className="size-3" />
              ) : (
                <TrendingDown className="size-3" />
              )}
              Profit
            </span>
            <span
              className={`font-mono font-semibold text-base ${
                profitable
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-red-700 dark:text-red-400"
              }`}>
              {formatCurrency(profit)}
            </span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="h-14">
        {/* Optional MSRP */}
        {item.msrp && item.msrp > 0 ? (
          <div className="flex w-full items-center justify-end gap-4 text-sm">
            <span className="text-muted-foreground">Suggested Retail:</span>
            <span className="font-medium">{formatCurrency(item.msrp)}</span>
          </div>
        ) : null}
      </CardFooter>
    </Card>
  );
}
