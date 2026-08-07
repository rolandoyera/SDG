"use client";

// Client-facing identity gate. Before the contract document or signing form is
// ever rendered, the client enters the last 4 digits of the phone number on file.
// This form submits only the access token, contract id, and the 4 digits — it
// never receives the expected value. The `verifyPortalAccess` server action is the
// sole authority: it compares server-side, records `verifiedAt`, and locks the
// link after too many failures. On success we navigate into the existing
// review/sign flow (the server-rendered contract page re-checks `verifiedAt`).

import { useState } from "react";

import { useRouter } from "next/navigation";

import { ShieldCheck } from "lucide-react";

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { verifyPortalAccess } from "@/server/contract-signing";

export function PortalVerifyForm({
  accessToken,
  contractId,
}: {
  accessToken: string;
  contractId: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const canSubmit = code.length === 4 && !submitting && !locked;

  const handleVerify = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await verifyPortalAccess({
        accessToken,
        contractId,
        phoneLast4: code,
      });
      if (result.ok) {
        router.push(`/portal/${accessToken}/contract/${contractId}`);
        return;
      }
      setError(result.error);
      if (result.locked) setLocked(true);
      else setCode(""); // clear the wrong digits so they can retry on empty slots
      setSubmitting(false);
    } catch {
      setError("Something went wrong. Please try again.");
      setCode("");
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 border border-neutral-200 bg-white px-8 py-10 text-center shadow-sm">
      <div className="flex size-12 items-center justify-center rounded-full bg-neutral-900/5 text-neutral-700">
        <ShieldCheck className="size-6" />
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="font-heading font-semibold text-neutral-900 text-xl">
          Verify your access
        </h1>
        <p className="text-neutral-500 text-sm leading-6">
          For your security, please enter the last 4 digits of the phone number
          we have on file before reviewing this contract.
        </p>
      </div>

      <div className="flex flex-col items-center gap-2">
        <span className="font-medium text-neutral-700 text-sm">
          Last 4 digits of phone number
        </span>
        <InputOTP
          autoFocus
          maxLength={4}
          value={code}
          inputMode="numeric"
          disabled={submitting || locked}
          onChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 4))}
          onComplete={handleVerify}
        >
          <InputOTPGroup className="gap-2">
            <InputOTPSlot
              index={0}
              className="size-12 rounded border text-lg"
            />
            <InputOTPSlot
              index={1}
              className="size-12 rounded border text-lg"
            />
            <InputOTPSlot
              index={2}
              className="size-12 rounded border text-lg"
            />
            <InputOTPSlot
              index={3}
              className="size-12 rounded border text-lg"
            />
          </InputOTPGroup>
        </InputOTP>
      </div>

      <div className="min-h-5">
        {error && <p className="text-red-600 text-sm">{error}</p>}
      </div>

      <button
        type="button"
        onClick={handleVerify}
        disabled={!canSubmit}
        className="inline-flex h-10 w-full items-center justify-center rounded bg-neutral-900 px-6 font-medium text-sm text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "Verifying…" : "Continue to Contract"}
      </button>
    </div>
  );
}
