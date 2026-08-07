"use client";

import { CircleCheckIcon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { InstagramIcon } from "@/components/icons/icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { selectMetaPage } from "@/server/meta-actions";
import type { MetaIntegrationConfig, MetaPendingPage } from "@/types/meta";

/**
 * Owns the Instagram connect flow on the Instagram page: the "Connect your
 * Instagram" empty state (shown when disconnected), the multi-Page picker
 * (?meta=select), and the success confirmation (?meta=connected). Disconnecting
 * is intentionally not surfaced here — `disconnectMeta` stays in
 * `meta-actions.ts` for later SuperAdmin use.
 */
export function InstagramConnect({
  connection,
  pendingPages,
  justConnected,
}: {
  connection: MetaIntegrationConfig | null;
  pendingPages: MetaPendingPage[];
  justConnected: boolean;
}) {
  const [successOpen, setSuccessOpen] = useState(
    justConnected && connection !== null,
  );
  const [pickerOpen, setPickerOpen] = useState(pendingPages.length > 0);
  const [isPending, startTransition] = useTransition();
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // URL hygiene: drop the ?meta=… param so a reload doesn't re-trigger dialogs.
  useEffect(() => {
    if (justConnected || pendingPages.length > 0) {
      window.history.replaceState(null, "", "/dashboard/instagram");
    }
  }, [justConnected, pendingPages.length]);

  function choose(pageId: string) {
    setSelecting(pageId);
    setError(null);
    startTransition(async () => {
      const res = await selectMetaPage(pageId);
      if (res.success && res.connection) {
        // Full navigation so the server re-renders with the data tabs and the
        // success dialog (?meta=connected) in one shot.
        window.location.assign("/dashboard/instagram?meta=connected");
      } else {
        setError(res.error ?? "Something went wrong.");
        setSelecting(null);
      }
    });
  }

  return (
    <>
      {connection ? null : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <InstagramIcon size={24} />
            </span>
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">Connect your Instagram</h3>
              <p className="mx-auto max-w-sm text-muted-foreground text-sm">
                Link your Instagram Business account to track reach, engagement,
                and audience insights here.
              </p>
            </div>
            <Button asChild>
              <a href="/api/integrations/meta/login">Connect Instagram</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Success confirmation */}
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CircleCheckIcon className="size-6" />
              </span>
              <DialogTitle>Instagram connected</DialogTitle>
              <DialogDescription>
                {connection
                  ? `@${connection.instagramUsername} is now linked. You can track its analytics here.`
                  : "Your Instagram account is now linked."}
              </DialogDescription>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setSuccessOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Account picker (multiple Pages granted) */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose an account</DialogTitle>
            <DialogDescription>
              You granted access to multiple Pages. Pick the Instagram account
              you want to track.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            {pendingPages.map((page) => (
              <div
                key={page.pageId}
                className="flex items-center gap-3 rounded border border-border p-3"
              >
                <Avatar>
                  <AvatarFallback>
                    {(page.instagramUsername ?? page.pageName)
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{page.pageName}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {page.hasInstagram
                      ? `@${page.instagramUsername} · ${(page.followersCount ?? 0).toLocaleString()} followers`
                      : "No Instagram account linked"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!page.hasInstagram || isPending}
                  onClick={() => choose(page.pageId)}
                >
                  {selecting === page.pageId ? "Connecting…" : "Select"}
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
