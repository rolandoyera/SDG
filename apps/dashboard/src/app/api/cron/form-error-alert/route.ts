import { NextResponse } from "next/server";

import { runFormErrorAlertsForAllOrgs } from "@/server/form-error-alert";

export const dynamic = "force-dynamic";

/**
 * Daily form-error alert. Triggered by Vercel Cron, which sends
 * `Authorization: Bearer $CRON_SECRET`. Rejects anything else so the route
 * can't be invoked publicly.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    auth !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runFormErrorAlertsForAllOrgs();
  return NextResponse.json({ ok: true, ...result });
}
