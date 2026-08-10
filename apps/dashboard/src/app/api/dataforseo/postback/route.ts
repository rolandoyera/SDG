import { gunzipSync } from "node:zlib";

import { NextResponse } from "next/server";

import {
  handleSerpPostback,
  postbackToken,
  type SerpPostbackTask,
} from "@/server/position-tracking";

export const dynamic = "force-dynamic";

/**
 * DataForSEO postback receiver: each queued SERP task POSTs its result here
 * (gzipped, task_get-shaped JSON) the moment it completes, so position
 * checks merge into snapshots with no browser open. Auth is a per-org HMAC
 * token minted from CRON_SECRET — a leaked URL can only feed results to its
 * own org, and can't invoke the cron routes.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("org");
  const token = url.searchParams.get("token");
  if (
    !organizationId ||
    !process.env.CRON_SECRET ||
    token !== postbackToken(organizationId)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = Buffer.from(await request.arrayBuffer());
  let body: { tasks?: SerpPostbackTask[] };
  try {
    let text: string;
    try {
      text = gunzipSync(raw).toString("utf8");
    } catch {
      text = raw.toString("utf8");
    }
    body = JSON.parse(text) as { tasks?: SerpPostbackTask[] };
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  for (const task of body.tasks ?? []) {
    try {
      await handleSerpPostback(organizationId, task);
    } catch (error) {
      console.error(
        `Postback handling failed for org ${organizationId}:`,
        error,
      );
    }
  }
  return NextResponse.json({ ok: true });
}
