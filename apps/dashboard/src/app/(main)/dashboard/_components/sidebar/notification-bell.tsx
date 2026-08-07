"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { formatDistanceToNow } from "date-fns";
import { Bell, Check, ExternalLink, Trash2 } from "lucide-react";

import { useAuth } from "@/components/auth-context";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { dismissNotification, markNotificationRead } from "@/lib/db";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/lib/types";

import { useNotifications } from "../use-notifications";

export function NotificationBell() {
  const { organizationId, uid, loading: authLoading } = useAuth();
  const notifications = useNotifications(organizationId, uid, authLoading);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  if (!uid) return null;

  const visible = notifications.filter((n) => !n.dismissedBy.includes(uid));
  const unreadCount = visible.filter((n) => !n.readBy.includes(uid)).length;

  const handleView = (n: AppNotification) => {
    if (!n.readBy.includes(uid))
      void markNotificationRead(n.notificationId, uid);
    setOpen(false);
    if (n.href) router.push(n.href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Notifications"
          className="relative"
        >
          <Bell />
          {unreadCount > 0 && (
            <>
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 animate-ping-soft rounded border-2 border-primary/60"
              />
              <span className="-top-1.5 -right-1.5 absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-medium text-[10px] text-primary-foreground tabular-nums">
                {unreadCount}
              </span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <h4 className="font-medium text-sm leading-none">Notifications</h4>
        </div>
        {visible.length === 0 ? (
          <p className="px-4 py-6 text-center text-muted-foreground text-sm">
            You're all caught up.
          </p>
        ) : (
          <ScrollArea className="max-h-80">
            <div className="flex flex-col divide-y">
              {visible.map((n) => {
                const unread = !n.readBy.includes(uid);
                return (
                  <div key={n.notificationId} className="flex gap-2 px-4 py-3">
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        unread ? "bg-primary" : "bg-transparent",
                      )}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p
                        className={cn(
                          "text-sm",
                          unread
                            ? "font-medium"
                            : "font-normal text-muted-foreground",
                        )}
                      >
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="truncate text-muted-foreground text-xs">
                          {n.body}
                        </p>
                      )}
                      <p className="text-muted-foreground/70 text-xs">
                        {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-start gap-0.5">
                      {unread && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Mark as read"
                          title="Mark as read"
                          onClick={() =>
                            void markNotificationRead(n.notificationId, uid)
                          }
                        >
                          <Check />
                        </Button>
                      )}
                      {n.href && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="View"
                          title="View"
                          onClick={() => handleView(n)}
                        >
                          <ExternalLink />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Delete"
                        title="Delete"
                        onClick={() =>
                          void dismissNotification(n.notificationId, uid)
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
