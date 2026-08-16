// Authenticated Dropbox thumbnail proxy for the project-imagery gallery. Mirrors
// the project-document download route's trust model: org from the VERIFIED
// caller, scoped to that org, streaming bytes with cache headers — the
// Dropbox access token never reaches the client. The requested `path` is guarded
// to the folder actually linked to this set, so no one can traverse the org's
// wider Dropbox by hand-editing the query.

import type { NextRequest } from "next/server";

import sharp from "sharp";

import type { Project } from "@/lib/types";
import { getActiveOrgId } from "@/server/auth";
import {
  ALPHA_CAPABLE,
  type DropboxThumbnailSize,
  fetchDropboxOriginal,
  fetchDropboxThumbnail,
  getValidDropboxAccessToken,
} from "@/server/dropbox";
import { getAdminDb } from "@/server/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; setId: string }> },
) {
  const { projectId, setId } = await params;
  const path = req.nextUrl.searchParams.get("path");
  // `full` is a large thumbnail that fills the lightbox; else a smaller grid tile.
  const size: DropboxThumbnailSize =
    req.nextUrl.searchParams.get("size") === "full" ? "w2048h1536" : "w640h480";

  if (!path) return new Response("Bad request", { status: 400 });

  const activeOrgId = await getActiveOrgId();
  if (!activeOrgId) return new Response("Unauthorized", { status: 401 });

  const snap = await getAdminDb().collection("projects").doc(projectId).get();
  if (!snap.exists) return new Response("Not found", { status: 404 });
  const project = snap.data() as Project;

  // Scope to the caller's org, and only serve files inside this set's linked folder.
  const linked = project.imagerySets?.[setId];
  if (
    project.organizationId !== activeOrgId ||
    !linked ||
    (path !== linked.path && !path.startsWith(`${linked.path}/`))
  ) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const accessToken = await getValidDropboxAccessToken(activeOrgId);
    if (!accessToken) return new Response("Not found", { status: 404 });

    // Alpha-capable sources: Dropbox's thumbnailer flattens transparency onto
    // white even with format=png, so build the thumbnail ourselves — download
    // the original and resize with sharp, serving WebP (keeps alpha, small).
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (ALPHA_CAPABLE.has(ext)) {
      const original = await fetchDropboxOriginal(accessToken, path);
      const [width, height] = size === "w2048h1536" ? [2048, 1536] : [640, 480];
      const bytes = await sharp(Buffer.from(original))
        .resize(width, height, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
      return new Response(new Uint8Array(bytes), {
        headers: {
          "content-type": "image/webp",
          "cache-control": "private, max-age=3600",
        },
      });
    }

    const bytes = await fetchDropboxThumbnail(accessToken, path, size);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "image/jpeg",
        // Org-scoped, so private; cached by the browser so revisits don't re-hit Dropbox.
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error(
      `[imagery-thumb] Failed to fetch thumbnail for ${projectId}/${setId} (path=${path}):`,
      error,
    );
    return new Response("Thumbnail unavailable", { status: 404 });
  }
}
