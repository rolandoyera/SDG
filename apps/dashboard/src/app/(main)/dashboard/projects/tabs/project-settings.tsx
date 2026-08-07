"use client";

import { type ReactNode, useEffect, useState, useTransition } from "react";

import { ArrowUpRight, Folder, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { updateProjectImagerySets } from "@/lib/db";
import type { Project, ProjectImagerySet } from "@/lib/types";
import {
  disconnectDropbox,
  getDropboxConnection,
} from "@/server/dropbox-actions";
import type { DropboxFolder, DropboxIntegrationConfig } from "@/types/dropbox";

import { DropboxFolderPicker } from "./_tab_components/dropbox-folder-picker";
import { DropboxImageGallery } from "./_tab_components/dropbox-image-gallery";

// A single Dropbox folder is linked per project (Settings → Project Imagery). It's
// stored in the generic `Project.imagerySets` map under this fixed key. New files
// added in Dropbox surface here automatically. `IMAGERY_SET_LABEL` labels the
// picker; once linked, the folder name labels the card.
const IMAGERY_SET_ID = "imagery";
const IMAGERY_SET_LABEL = "Project Imagery";
const IMAGERY_SET_HINT =
  "Link a folder of project imagery. New files added in Dropbox appear here automatically.";

/** Maps the `?dropbox=` result param (set by the OAuth callback) to a toast. */
const DROPBOX_NOTICES: Record<
  string,
  { type: "success" | "error"; message: string }
> = {
  connected: { type: "success", message: "Dropbox connected." },
  error: { type: "error", message: "Dropbox connection failed." },
  state_error: {
    type: "error",
    message: "Dropbox session expired. Please try again.",
  },
  token_error: {
    type: "error",
    message: "Couldn't complete the Dropbox connection.",
  },
  save_error: {
    type: "error",
    message: "Couldn't save the Dropbox connection.",
  },
  no_org: { type: "error", message: "No active organization." },
  not_configured: { type: "error", message: "Dropbox isn't configured yet." },
};

export function ProjectSettings({ project }: { project: Project }) {
  const { organizationId, uid, loading: authLoading } = useAuth();
  const [connection, setConnection] = useState<DropboxIntegrationConfig | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [imagerySets, setImagerySets] = useState<
    Record<string, ProjectImagerySet>
  >(project.imagerySets ?? {});
  const [pickerOpen, setPickerOpen] = useState(false);

  // Depend on the stable `organizationId` primitive, never the churning `profile`
  // object (repo effect-deps rule).
  useEffect(() => {
    if (authLoading || !organizationId) return;
    void getDropboxConnection()
      .then(setConnection)
      .catch((error) =>
        console.error("Failed to load Dropbox connection:", error),
      )
      .finally(() => setLoading(false));
  }, [organizationId, authLoading]);

  // Surface the OAuth round-trip result, then scrub the ?dropbox= param so a
  // reload doesn't re-toast (URL hygiene — root AGENTS.md rule #3).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("dropbox");
    if (!status) return;
    const notice = DROPBOX_NOTICES[status];
    if (notice) {
      if (notice.type === "success") toast.success(notice.message);
      else toast.error(notice.message);
    }
    params.delete("dropbox");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      `/dashboard/projects/${project.projectId}${qs ? `?${qs}` : ""}`,
    );
  }, [project.projectId]);

  const connectHref = `/api/integrations/dropbox/login?returnTo=${encodeURIComponent(
    `/dashboard/projects/${project.projectId}?tab=settings`,
  )}`;

  // Write-through, not optimistic: the gallery's first fetch resolves the linked
  // folder from the project doc server-side, so local state may only flip after
  // Firestore acknowledges the write — flipping early races that read and the
  // gallery errors with "No folder linked" until a refresh.
  const persist = async (next: Record<string, ProjectImagerySet>) => {
    await updateProjectImagerySets(project.projectId, next);
    setImagerySets(next);
  };

  const linked = imagerySets[IMAGERY_SET_ID];

  const handleLink = async (folder: DropboxFolder) => {
    if (!uid) return;
    try {
      // Only one folder is allowed, so replace the whole map rather than merge.
      await persist({
        [IMAGERY_SET_ID]: {
          path: folder.path,
          name: folder.name,
          linkedAt: Date.now(),
          linkedBy: uid,
        },
      });
      toast.success("Folder linked.");
    } catch (error) {
      console.error("Failed to save linked folder:", error);
      toast.error("Failed to save the linked folder.");
    }
  };

  const handleUnlink = async () => {
    try {
      await persist({});
      toast.success("Folder unlinked.");
    } catch (error) {
      console.error("Failed to unlink folder:", error);
      toast.error("Failed to unlink the folder.");
    }
  };

  return (
    // Two columns, each half width. `items-start` keeps the Timelines column at
    // its own natural height so it doesn't stretch to match a tall image grid.
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <section className="flex flex-col gap-4">
        <SectionHeader
          label="Project Imagery"
          action={
            connection ? (
              <DropboxAccount
                connection={connection}
                onDisconnect={() => setConnection(null)}
              />
            ) : null
          }
        />
        <ImagerySetCard
          projectId={project.projectId}
          loading={loading}
          connected={connection !== null}
          connectHref={connectHref}
          linked={linked}
          onChoose={() => setPickerOpen(true)}
          onUnlink={handleUnlink}
        />
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeader label="Timelines" />
        <Card
          variant="panel"
          className="flex min-h-[160px] items-center justify-center border-dashed"
        >
          <p className="text-muted-foreground text-sm">
            Timeline configuration coming soon.
          </p>
        </Card>
      </section>

      <DropboxFolderPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        setLabel={IMAGERY_SET_LABEL}
        onLink={handleLink}
      />
    </div>
  );
}

function SectionHeader({
  label,
  description,
  action,
}: {
  label: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between border-b pb-3">
        <p className="font-medium text-card-foreground uppercase tracking-wider">
          {label}
        </p>
        {action}
      </div>
      {description && (
        <p className="max-w-2xl text-muted-foreground text-sm">{description}</p>
      )}
    </div>
  );
}

/** "Connected as …" + a Disconnect action for the org-wide Dropbox connection. */
function DropboxAccount({
  connection,
  onDisconnect,
}: {
  connection: DropboxIntegrationConfig;
  onDisconnect: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground text-xs">
        Connected as {connection.accountName || connection.accountEmail}
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const res = await disconnectDropbox();
            if (res.success) {
              onDisconnect();
              toast.success("Dropbox disconnected.");
            } else {
              toast.error("Failed to disconnect Dropbox.");
            }
          })
        }
      >
        {isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
        Disconnect
      </Button>
    </div>
  );
}

function ImagerySetCard({
  projectId,
  loading,
  connected,
  connectHref,
  linked,
  onChoose,
  onUnlink,
}: {
  projectId: string;
  loading: boolean;
  connected: boolean;
  connectHref: string;
  linked: ProjectImagerySet | undefined;
  onChoose: () => void;
  onUnlink: () => void;
}) {
  // Once linked, the gallery is the whole card — the folder labels it (name +
  // image count in the header), so there's no hardcoded title to show.
  if (linked) {
    return (
      <DropboxImageGallery
        projectId={projectId}
        setId={IMAGERY_SET_ID}
        folderName={linked.name}
        onChange={onChoose}
        onUnlink={onUnlink}
      />
    );
  }

  // Unlinked: no card chrome — just the dashed empty state.
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded border border-dashed p-8 text-center">
      <Folder className="size-6 text-muted-foreground" />
      <p className="max-w-xs text-muted-foreground text-sm">
        {IMAGERY_SET_HINT}
      </p>
      {loading ? (
        <Button disabled>
          <Loader2 className="size-3.5 animate-spin" />
          Loading
        </Button>
      ) : connected ? (
        <Button onClick={onChoose}>Choose folder</Button>
      ) : (
        <Button asChild>
          <a href={connectHref}>
            Connect Dropbox
            <ArrowUpRight className="size-3.5" />
          </a>
        </Button>
      )}
    </div>
  );
}
