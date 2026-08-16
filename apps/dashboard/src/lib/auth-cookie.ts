// Shared between the client auth context (which mirrors the Firebase ID token
// into this cookie on every token refresh) and the server (which verifies it
// with firebase-admin to establish the caller's identity). The cookie is only
// a transport: the server never trusts it without verifyIdToken.
export const AUTH_TOKEN_COOKIE = "auth-token";
