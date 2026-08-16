// Authenticated download of a project document's file (the project "Files" tab).
// The file lives privately in Storage and is never served from a public URL; this
// route resolves the `projectDocuments` record, confirms the VERIFIED caller's
// active org matches the document's org (same trust model as the dashboard's
// server actions), then streams the object. Files are never regenerated here —
// the executed PDF is the permanent record copy, produced once at signing time.

import type { NextRequest } from "next/server";

import type { ProjectDocument } from "@/lib/types";
import { getActiveOrgId } from "@/server/auth";
import { getAdminBucket, getAdminDb } from "@/server/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  // `?inline=1` renders the PDF in the browser (e.g. "View signed PDF"); the
  // default forces a download (the Files tab's "Download" action).
  const inline = req.nextUrl.searchParams.get("inline") === "1";

  const activeOrgId = await getActiveOrgId();
  if (!activeOrgId) return new Response("Unauthorized", { status: 401 });

  const snap = await getAdminDb()
    .collection("projectDocuments")
    .doc(documentId)
    .get();
  if (!snap.exists) return new Response("Not found", { status: 404 });
  const document = snap.data() as ProjectDocument;

  // Scope to the caller's active org — never serve another tenant's file.
  if (document.organizationId !== activeOrgId) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const [buffer] = await getAdminBucket().file(document.filePath).download();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${document.fileName}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    console.error(
      `[project-document-download] Failed to stream ${documentId} (path=${document.filePath}):`,
      error,
    );
    return new Response("Document unavailable", { status: 500 });
  }
}
