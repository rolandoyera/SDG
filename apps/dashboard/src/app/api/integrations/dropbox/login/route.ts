// apps/dashboard/src/app/api/integrations/dropbox/login/route.ts

import { randomBytes } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import { getActiveOrgId } from "@/server/auth";

export const DROPBOX_OAUTH_STATE_COOKIE = "dropbox_oauth_state";

/**
 * Where to send the user back after the OAuth round-trip. Only same-app
 * `/dashboard/...` paths are honored (open-redirect guard); anything else falls
 * back to the projects directory.
 */
function safeReturnTo(raw: string | null): string {
  if (raw?.startsWith("/dashboard/")) return raw;
  return "/dashboard/projects";
}

/** `returnTo` (which may carry its own query, e.g. `?tab=settings`) with a
 *  `dropbox=<status>` param appended safely. */
function returnUrl(returnTo: string, status: string, base: string): URL {
  const url = new URL(returnTo, base);
  url.searchParams.set("dropbox", status);
  return url;
}

export async function GET(req: NextRequest) {
  const returnTo = safeReturnTo(req.nextUrl.searchParams.get("returnTo"));
  // Verified caller's active org — an unauthenticated or forged request never
  // reaches another tenant's integration slot.
  const organizationId = await getActiveOrgId();

  // The callback writes to organizations/{orgId}; without a tenant we can't
  // know where to store the connection, so bail before leaving the app.
  if (!organizationId) {
    return NextResponse.redirect(returnUrl(returnTo, "no_org", req.url));
  }

  // trim() strips whitespace and the BOM a hand-created .env file can bleed
  // into the value — Dropbox rejects a client_id with any stray character.
  const appKey = process.env.DROPBOX_APP_KEY?.trim();

  if (!appKey) {
    return NextResponse.redirect(
      returnUrl(returnTo, "not_configured", req.url),
    );
  }

  // Derive the callback from the requesting domain so each tenant domain
  // round-trips back to itself (the CSRF cookie below is domain-scoped, so a
  // fixed callback domain would break every other tenant). Every dashboard
  // domain must be registered as a redirect URI in the Dropbox App Console.
  const redirectUri = new URL(
    "/api/integrations/dropbox/callback",
    req.nextUrl.origin,
  ).toString();

  // Random nonce ties this redirect to its callback (CSRF protection); the org
  // id + return path ride along in `state` so the callback knows which tenant to
  // write to and where to send the user back.
  const nonce = randomBytes(16).toString("hex");
  const state = Buffer.from(
    JSON.stringify({ organizationId, nonce, returnTo }),
  ).toString("base64url");

  const params = new URLSearchParams({
    client_id: appKey,
    redirect_uri: redirectUri,
    response_type: "code",
    // Returns a refresh token so the integration survives past the ~4h access token.
    token_access_type: "offline",
    state,
    scope: [
      "account_info.read",
      "files.metadata.read",
      "files.content.read",
    ].join(" "),
  });

  const res = NextResponse.redirect(
    `https://www.dropbox.com/oauth2/authorize?${params.toString()}`,
  );

  // Short-lived and httpOnly so only the callback (not client JS) reads it back.
  res.cookies.set(DROPBOX_OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return res;
}
