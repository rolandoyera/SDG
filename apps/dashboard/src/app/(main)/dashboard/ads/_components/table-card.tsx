import { Ellipsis } from "lucide-react";
import type { ReactNode } from "react";

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Card shell shared by the Ads table sections. Lives in its own file because
 * the Search Terms card renders its header from the client (its search box
 * needs the TanStack table instance), while the rest render on the server.
 */
export function TableCard({
  title,
  action,
  children,
}: {
  title: string;
  /** Header slot — replaces the default menu affordance, e.g. with a search box. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="gap-2 pt-0 pb-0">
      <CardHeader className="bg-muted/50 py-3">
        <CardTitle>{title}</CardTitle>
        <CardAction>{action ?? <Ellipsis className="size-4" />}</CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-0 pt-0">
        {children}
      </CardContent>
    </Card>
  );
}
