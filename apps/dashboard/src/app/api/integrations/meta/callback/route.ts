// apps/dashboard/src/app/api/integrations/meta/callback/route.ts

import { type NextRequest, NextResponse } from "next/server";

import { getActiveOrgId } from "@/server/auth";
import { getAdminDb } from "@/server/firebase-admin";
import {
  exchangeForLongLivedToken,
  fetchInstagramProfile,
  fetchPages,
  storeMetaConnection,
} from "@/server/meta-graph";
import type { MetaPendingConnection } from "@/types/meta";

import { META_OAUTH_STATE_COOKIE } from "../login/route";

function redirect(req: NextRequest, path: string) {
  const res = NextResponse.redirect(new URL(path, req.url));
  res.cookies.delete(META_OAUTH_STATE_COOKIE);
  return res;
}

function parseState(
  raw: string | null,
): { organizationId: string; nonce: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      typeof parsed?.organizationId === "string" &&
      typeof parsed?.nonce === "string"
    ) {
      return { organizationId: parsed.organizationId, nonce: parsed.nonce };
    }
  } catch {
    // malformed state — handled by the null return below
  }
  return null;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = parseState(req.nextUrl.searchParams.get("state"));
  const cookieNonce = req.cookies.get(META_OAUTH_STATE_COOKIE)?.value;

  if (!code) {
    return redirect(req, "/dashboard/instagram?meta=error");
  }

  // CSRF: the nonce in `state` must match the httpOnly cookie we set at login.
  if (!state || !cookieNonce || state.nonce !== cookieNonce) {
    return redirect(req, "/dashboard/instagram?meta=state_error");
  }

  const { organizationId } = state;

  // The nonce only proves the same browser started the flow — it says nothing
  // about which tenant this caller may write to. Re-verify the caller and
  // require the state's org to be their active org.
  if ((await getActiveOrgId()) !== organizationId) {
    return redirect(req, "/dashboard/instagram?meta=state_error");
  }

  // Exchange the code for a short-lived user token.
  const tokenRes = await fetch(
    `https://graph.facebook.com/v22.0/oauth/access_token?` +
      new URLSearchParams({
        client_id: process.env.META_APP_ID ?? "",
        client_secret: process.env.META_APP_SECRET ?? "",
        redirect_uri: process.env.META_REDIRECT_URI ?? "",
        code,
      }),
  );
  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    console.error("Meta token error:", tokenData);
    return redirect(req, "/dashboard/instagram?meta=token_error");
  }

  // Upgrade to a long-lived user token (~60 days). Page tokens derived from it
  // are themselves long-lived, so the integration survives past the first hour.
  const { token: userAccessToken, expiresAt } = await exchangeForLongLivedToken(
    tokenData.access_token,
  );

  const pages = await fetchPages(userAccessToken);

  if (pages.length === 0) {
    return redirect(req, "/dashboard/instagram?meta=no_page");
  }

  const orgRef = getAdminDb().collection("organizations").doc(organizationId);

  // More than one Page granted: we can't guess which is the main account, so
  // store nothing yet — stash just the user token and let the picker decide.
  if (pages.length > 1) {
    const pending: MetaPendingConnection = {
      userAccessToken,
      createdAt: Date.now(),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    };
    try {
      await orgRef.collection("secrets").doc("metaPending").set(pending);
    } catch (error) {
      console.error("Failed to stage Meta page selection:", error);
      return redirect(req, "/dashboard/instagram?meta=save_error");
    }
    return redirect(req, "/dashboard/instagram?meta=select");
  }

  // Exactly one Page: connect it directly.
  const profile = await fetchInstagramProfile(pages[0]);
  if (!profile) {
    return redirect(req, "/dashboard/instagram?meta=no_instagram");
  }

  try {
    await storeMetaConnection(organizationId, pages[0], profile, expiresAt);
    // Clear any stale pending selection from an earlier abandoned attempt.
    await orgRef.collection("secrets").doc("metaPending").delete();
  } catch (error) {
    console.error("Failed to persist Meta integration:", error);
    return redirect(req, "/dashboard/instagram?meta=save_error");
  }

  return redirect(req, "/dashboard/instagram?meta=connected");
}
