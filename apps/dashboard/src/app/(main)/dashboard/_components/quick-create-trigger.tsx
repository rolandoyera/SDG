"use client";

import { Suspense, useEffect } from "react";

import { useSearchParams } from "next/navigation";

function Trigger({ onTrigger }: { onTrigger: () => void }) {
  const searchParams = useSearchParams();
  const active = searchParams.get("add") === "true";

  useEffect(() => {
    if (!active) return;
    onTrigger();
    // Clear the trigger param (root AGENTS.md rule #3), preserving other params.
    const params = new URLSearchParams(window.location.search);
    params.delete("add");
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
    );
  }, [active, onTrigger]);

  return null;
}

/**
 * Fires `onTrigger` (open the page's "add" dialog) whenever `?add=true` is in
 * the URL — on initial load and on client-side navigations, so the sidebar
 * Quick Create links work while already on the target page. Reading the param
 * via `useSearchParams` is what makes same-page navigations observable, and it
 * requires a Suspense boundary on statically rendered routes, so this
 * component brings its own. Renders nothing.
 */
export function QuickCreateTrigger({ onTrigger }: { onTrigger: () => void }) {
  return (
    <Suspense>
      <Trigger onTrigger={onTrigger} />
    </Suspense>
  );
}
