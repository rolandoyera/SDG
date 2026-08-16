// apps/dashboard/src/app/api/integrations/dropbox/callback/route.ts

import { type NextRequest, NextResponse } from "next/server";

import { getActiveOrgId } from "@/server/auth";
import { fetchDropboxAccount, storeDropboxConnection } from "@/server/dropbox";

import { DROPBOX_OAUTH_STATE_COOKIE } from "../login/route";

interface DropboxState {
  organizationId: string;
  nonce: string;
  returnTo: string;
}

/** Redirect back to `returnTo` (which may carry its own query, e.g. `?tab=settings`)
 *  with a `dropbox=<status>` param, clearing the CSRF state cookie. */
function redirect(req: NextRequest, returnTo: string, status: string) {
  const url = new URL(returnTo, req.url);
  url.searchParams.set("dropbox", status);
  const res = NextResponse.redirect(url);
  res.cookies.delete(DROPBOX_OAUTH_STATE_COOKIE);
  return res;
}

function safeReturnTo(returnTo: unknown): string {
  return typeof returnTo === "string" && returnTo.startsWith("/dashboard/")
    ? returnTo
    : "/dashboard/projects";
}

function parseState(raw: string | null): DropboxState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      typeof parsed?.organizationId === "string" &&
      typeof parsed?.nonce === "string"
    ) {
      return {
        organizationId: parsed.organizationId,
        nonce: parsed.nonce,
        returnTo: safeReturnTo(parsed.returnTo),
      };
    }
  } catch {
    // malformed state — handled by the null return below
  }
  return null;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = parseState(req.nextUrl.searchParams.get("state"));
  const cookieNonce = req.cookies.get(DROPBOX_OAUTH_STATE_COOKIE)?.value;

  // No usable return path yet (bad/absent state) — send to the projects directory.
  const returnTo = state?.returnTo ?? "/dashboard/projects";

  if (!code) {
    return redirect(req, returnTo, "error");
  }

  // CSRF: the nonce in `state` must match the httpOnly cookie we set at login.
  if (!state || !cookieNonce || state.nonce !== cookieNonce) {
    return redirect(req, returnTo, "state_error");
  }

  const { organizationId } = state;

  // The nonce only proves the same browser started the flow — it says nothing
  // about which tenant this caller may write to. Re-verify the caller and
  // require the state's org to be their active org.
  if ((await getActiveOrgId()) !== organizationId) {
    return redirect(req, returnTo, "state_error");
  }

  // Exchange the authorization code for access + refresh tokens.
  const tokenRes = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      // Must byte-match the redirect_uri the login route sent to authorize —
      // both derive it from the requesting domain, and login redirected
      // Dropbox back to this same domain.
      redirect_uri: new URL(
        "/api/integrations/dropbox/callback",
        req.nextUrl.origin,
      ).toString(),
      // trim() guards against whitespace/BOM bled into hand-created .env values.
      client_id: process.env.DROPBOX_APP_KEY?.trim() ?? "",
      client_secret: process.env.DROPBOX_APP_SECRET?.trim() ?? "",
    }),
    cache: "no-store",
  });
  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    console.error("Dropbox token error:", tokenData);
    return redirect(req, returnTo, "token_error");
  }

  try {
    const account = await fetchDropboxAccount(tokenData.access_token);
    await storeDropboxConnection(
      organizationId,
      {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? "",
        accountId: tokenData.account_id ?? account.accountId,
        ...(typeof tokenData.expires_in === "number"
          ? { expiresAt: Date.now() + tokenData.expires_in * 1000 }
          : {}),
      },
      account,
    );
  } catch (error) {
    console.error("Failed to persist Dropbox integration:", error);
    return redirect(req, returnTo, "save_error");
  }

  return redirect(req, returnTo, "connected");
}
