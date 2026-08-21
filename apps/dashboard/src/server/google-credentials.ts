// One place the admin service account is parsed and turned into a GoogleAuth
// client. Both the Cloud Monitoring and BigQuery readers need it at different
// scopes, and it lives outside the "use server" action files because those may
// export only async functions.

import { GoogleAuth } from "google-auth-library";

function parseServiceAccountKey(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  const json = trimmed.startsWith("{")
    ? trimmed
    : Buffer.from(trimmed, "base64").toString("utf8");
  return JSON.parse(json) as Record<string, string>;
}

const clients = new Map<string, { auth: GoogleAuth; projectId: string }>();

/** Cached per scope — GoogleAuth holds the token, so re-parsing is waste. */
export function getGoogleAuth(scope: string): {
  auth: GoogleAuth;
  projectId: string;
} {
  const cached = clients.get(scope);
  if (cached) return cached;

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error(
      "Missing FIREBASE_SERVICE_ACCOUNT_KEY in environment variables.",
    );
  }

  const serviceAccount = parseServiceAccountKey(serviceAccountKey);
  const client = {
    auth: new GoogleAuth({ credentials: serviceAccount, scopes: [scope] }),
    projectId: serviceAccount.project_id,
  };
  clients.set(scope, client);
  return client;
}
