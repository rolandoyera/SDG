import type React from "react";

import { ExternalLink, Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { LibraryItem } from "@/lib/types";

import { withProtocol } from "./library-constants";

/** Show the value, or a muted "N/A" placeholder when it is empty. */
const na = (value?: string) => (value ? value : "N/A");

function SpecField({
  label,
  value,
}: {
  label: string;
  value?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 bg-background p-4">
      <Label className="uppercase">{label}</Label>
      {value && (
        <span className="font-medium text-foreground text-sm capitalize">
          {value}
        </span>
      )}
      {!value && (
        <span className="font-medium text-muted-foreground/30 text-sm">
          N/A
        </span>
      )}
    </div>
  );
}

interface ItemSpecMatrixProps {
  item: LibraryItem;
}

/** Spec grid plus assigned vendor and direct product link. */
export function ItemSpecMatrix({ item }: ItemSpecMatrixProps) {
  return (
    <Card variant="panel">
      <CardHeader>
        <CardTitle>
          <Tag className="icons" />
          Specifications
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 py-3">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-border bg-border text-sm md:grid-cols-4">
          <SpecField label="Finish / Color" value={na(item.finishColor)} />
          <SpecField label="Materials" value={na(item.materials)} />
          <SpecField label="Dimensions" value={na(item.dimensions)} />
          <SpecField label="SKU / Model #" value={na(item.sku)} />
          <SpecField label="Unit Type" value={item.unitType} />
          <SpecField label="Manufacturer" value={item.manufacturer} />
          <SpecField label="Category" value={item.category} />
          <SpecField label="Subcategory" value={item.subcategory} />
        </div>
      </CardContent>
      <CardFooter className="h-14">
        <div className="flex w-full items-center justify-end gap-4">
          {item.sourcingLink && (
            <div>
              <a
                href={withProtocol(item.sourcingLink)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="secondary" size="sm">
                  <ExternalLink className="size-4" />
                  Product Website
                </Button>
              </a>
            </div>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
