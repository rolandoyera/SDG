// Shared between the client auth context (which writes the cookie on login)
// and the server's getVerifiedCaller (src/server/auth.ts). The cookie is only
// an org SELECTOR honored for SuperAdmins; for everyone else the server derives
// the org from the verified caller's profile and ignores this value.
export const ACTIVE_ORG_COOKIE = "active-organization-id";
