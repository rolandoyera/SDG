"use client";

// Client-facing typed-signature form. The client types their name (their adopted
// electronic signature) and must accept the electronic-records consent before the
// Sign button enables. Submission calls the `signContract` server action, which is
// the sole authority on validation, identity, timestamps, and execution — this
// form trusts nothing it can't see the server re-derive. On success the page
// refreshes into the fully-executed state.

import { useState } from "react";

import { useRouter } from "next/navigation";

import { ELECTRONIC_SIGNATURE_CONSENT_TEXT } from "@/lib/contract-text";
import { signContract } from "@/server/contract-signing";

export function PortalSignForm({
  accessToken,
  contractId,
}: {
  accessToken: string;
  contractId: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSign = name.trim().length > 0 && consent && !submitting;

  const handleSign = async () => {
    if (!canSign) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await signContract({
        accessToken,
        contractId,
        signerName: name,
        consentAccepted: consent,
      });
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
        setSubmitting(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 border border-neutral-200 bg-white px-8 py-8 shadow-sm">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading font-semibold text-lg text-neutral-900">
          Sign this contract
        </h2>
        <p className="text-neutral-500 text-sm">
          Type your full legal name to sign electronically.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-medium text-neutral-700 text-sm">Full name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your full legal name"
          autoComplete="name"
          className="h-10 rounded border border-neutral-300 px-3 text-neutral-900 text-sm outline-none focus:border-neutral-900"
        />
        {name.trim() && (
          <span className="mt-1 font-[cursive] text-2xl text-neutral-800">
            {name.trim()}
          </span>
        )}
      </label>

      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-neutral-900"
        />
        <span className="text-neutral-600 text-sm leading-5">
          {ELECTRONIC_SIGNATURE_CONSENT_TEXT}
        </span>
      </label>

      <div className="h-5 flex items-center">
        {error && <p className="text-red-600 text-sm">{error}</p>}
      </div>

      <button
        type="button"
        onClick={handleSign}
        disabled={!canSign}
        className="inline-flex h-10 items-center justify-center rounded bg-neutral-900 px-6 font-medium text-sm text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40">
        {submitting ? "Signing…" : "Sign contract"}
      </button>
    </div>
  );
}
