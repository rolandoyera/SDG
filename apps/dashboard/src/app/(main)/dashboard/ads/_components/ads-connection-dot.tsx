import { ConnectionDot } from "@/components/connection-dot";
import { testGoogleAdsConnection } from "@/server/google-ads-actions";

/**
 * Header status dot. Its own async component so the connection round-trip
 * streams in behind a Suspense boundary instead of blocking the page shell.
 */
export async function AdsConnectionDot() {
  const connection = await testGoogleAdsConnection();
  return <ConnectionDot connected={connection.success} />;
}
