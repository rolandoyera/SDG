import { FileText, ShoppingBag } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LibraryItem } from "@/lib/types";

interface ItemNotesCardsProps {
  item: LibraryItem;
}

/** Public sourcing description and internal procurement notes, side by side. */
export function ItemNotesCards({ item }: ItemNotesCardsProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
      <Card variant="panel" className="min-h-60">
        <CardHeader>
          <CardTitle>
            <ShoppingBag className="icons" />
            Public Description
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {item.description ? (
            <div className="rounded border border-border bg-muted/50 p-3.5 text-foreground text-sm leading-relaxed shadow-inner">
              {item.description}
            </div>
          ) : (
            <p className="py-2 text-muted-foreground/60 text-sm italic">
              No public descriptions draft logged for proposals.
            </p>
          )}
        </CardContent>
      </Card>

      <Card variant="panel" className="min-h-60">
        <CardHeader>
          <CardTitle>
            <FileText className="icons" />
            Internal Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {item.internalNote ? (
            <div className="rounded border bg-muted/50 p-3.5 text-foreground text-sm leading-relaxed shadow-inner">
              {item.internalNote}
            </div>
          ) : (
            <div className="rounded border bg-muted/50 p-3.5 text-foreground/50 text-sm italic leading-relaxed shadow-inner">
              No internal notes logged.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
