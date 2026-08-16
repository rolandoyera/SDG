"use client";

import { useState } from "react";

import { toast } from "sonner";

import { resendContractSigningLink } from "@/server/contract-signing";

/**
 * Shared client hook for the "Resend signing link" action, used by the contracts
 * list and the project Files tab so both get identical behavior (toast feedback +
 * a per-row in-flight spinner) without duplicating the call. `resendingId` is the
 * contract currently resending (drives the spinner / disabled item); `resend`
 * fires the server action, which re-reads the client so a corrected email takes
 * effect and resets the contract to a fresh `sent` cycle (the realtime listener
 * reflects it). No-ops without a signed-in `userId`; the server stamps the
 * verified caller identity itself.
 */
export function useResendSigningLink(userId: string | null | undefined) {
  const [resendingId, setResendingId] = useState<string | null>(null);

  const resend = async (contractId: string) => {
    if (!userId) return;
    setResendingId(contractId);
    try {
      const result = await resendContractSigningLink({ contractId });
      if (result.ok) {
        toast.success("Signing link resent.");
      } else {
        toast.error(result.error ?? "Failed to resend signing link.");
      }
    } catch (error) {
      console.error("Failed to resend signing link:", error);
      toast.error("Failed to resend signing link.");
    } finally {
      setResendingId(null);
    }
  };

  return { resendingId, resend };
}
