/**
 * Page-header status dot for third-party integrations (Google Ads, GA4,
 * Meta). Each page wraps it in a small async component that awaits its own
 * connection check behind a Suspense boundary, with ConnectionDotPending as
 * the fallback, so the check never blocks the page shell.
 */
export function ConnectionDot({ connected }: { connected: boolean }) {
  const label = connected ? "Connected" : "Not connected";
  const color = connected ? "bg-green-500" : "bg-red-500";

  return (
    <span
      role="img"
      className="relative flex size-2.5"
      title={label}
      aria-label={label}
    >
      <span
        className={`absolute inline-flex size-full animate-ping rounded-full opacity-75 ${color}`}
      />
      <span className={`relative inline-flex size-2.5 rounded-full ${color}`} />
    </span>
  );
}

/** Neutral dot shown while the connection check is in flight. */
export function ConnectionDotPending() {
  return (
    <span
      role="img"
      className="relative flex size-2.5"
      title="Checking connection"
      aria-label="Checking connection"
    >
      <span className="relative inline-flex size-2.5 animate-pulse rounded-full bg-muted-foreground/40" />
    </span>
  );
}
