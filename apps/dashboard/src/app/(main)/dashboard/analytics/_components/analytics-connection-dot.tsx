import { ConnectionDot } from "@/components/connection-dot";
import { testGA4Connection } from "@/server/analytics-actions";

/**
 * Header status dot. Its own async component so the GA4 connection check
 * streams in behind a Suspense boundary instead of blocking the page shell.
 */
export async function AnalyticsConnectionDot() {
  const connection = await testGA4Connection();
  return <ConnectionDot connected={connection.success} />;
}
