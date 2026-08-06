"use client";

import { useRouter } from "next/navigation";

import { formatDistanceToNow } from "date-fns";
import { Check, ExternalLink, Trash2 } from "lucide-react";

import { useAuth } from "@/components/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { dismissNotification, markNotificationRead } from "@/lib/db";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/lib/types";

import { useNotifications } from "../../_components/use-notifications";

export function NotificationsCard() {
  const { organizationId, uid, loading: authLoading } = useAuth();
  const notifications = useNotifications(organizationId, uid, authLoading);
  const router = useRouter();

  const visible = uid
    ? notifications.filter((n) => !n.dismissedBy.includes(uid))
    : [];

  const handleView = (n: AppNotification) => {
    if (uid && !n.readBy.includes(uid))
      void markNotificationRead(n.notificationId, uid);
    if (n.href) router.push(n.href);
  };

  return (
    <Card variant="panel" className="h-full">
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        {!uid || visible.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center">
            <p className="text-muted-foreground font-light text-xs">
              You're all caught up.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-96">
            <div className="flex flex-col gap-2">
              {visible.map((n) => {
                const unread = !n.readBy.includes(uid);
                return (
                  <div
                    key={n.notificationId}
                    className="flex flex-col rounded bg-muted p-2">
                    <p className="mb-2 text-muted-foreground text-xs">
                      {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                    </p>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            unread ? "bg-primary" : "bg-transparent",
                          )}
                        />
                        <p
                          className={cn(
                            "text-sm",
                            unread ? "font-medium" : "text-muted-foreground",
                          )}>
                          {n.title}
                        </p>
                      </div>
                      {n.body && (
                        <p className="ml-4 text-muted-foreground text-xs">
                          {n.body}
                        </p>
                      )}
                    </div>
                    <div className="flex justify-end">
                      {unread && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Mark as read"
                              onClick={() =>
                                void markNotificationRead(n.notificationId, uid)
                              }>
                              <Check />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Mark as read</TooltipContent>
                        </Tooltip>
                      )}
                      {n.href && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="View"
                              onClick={() => handleView(n)}>
                              <ExternalLink />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View</TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Delete"
                            onClick={() =>
                              void dismissNotification(n.notificationId, uid)
                            }>
                            <Trash2 />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
