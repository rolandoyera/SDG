// apps/dashboard/src/app/api/integrations/meta/login/route.ts

import { randomBytes } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import { getActiveOrgId } from "@/server/auth";

export const META_OAUTH_STATE_COOKIE = "meta_oauth_state";

export async function GET(req: NextRequest) {
  // Verified caller's active org — an unauthenticated or forged request never
  // reaches another tenant's integration slot.
  const organizationId = await getActiveOrgId();

  // The callback writes to organizations/{orgId}; without a tenant we can't
  // know where to store the connection, so bail before leaving the app.
  if (!organizationId) {
    return NextResponse.redirect(
      new URL("/dashboard/instagram?meta=no_org", req.url),
    );
  }

  const appId = process.env.META_APP_ID;
  const redirectUri = process.env.META_REDIRECT_URI;

  if (!appId || !redirectUri) {
    return NextResponse.redirect(
      new URL("/dashboard/instagram?meta=not_configured", req.url),
    );
  }

  // Random nonce ties this redirect to its callback (CSRF protection); the org
  // id rides along in `state` so the callback knows which tenant to write to.
  const nonce = randomBytes(16).toString("hex");
  const state = Buffer.from(JSON.stringify({ organizationId, nonce })).toString(
    "base64url",
  );

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    scope: [
      "instagram_basic",
      "instagram_manage_insights",
      "pages_show_list",
      "pages_read_engagement",
      "business_management",
    ].join(","),
  });

  const res = NextResponse.redirect(
    `https://www.facebook.com/v22.0/dialog/oauth?${params.toString()}`,
  );

  // Short-lived and httpOnly so only the callback (not client JS) reads it back.
  res.cookies.set(META_OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return res;
}
