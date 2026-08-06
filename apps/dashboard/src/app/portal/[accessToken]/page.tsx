// Portal landing — the identity gate. Validates the access token, then shows one
// of three states based on the (server-owned) access record: a lock notice if too
// many verification attempts failed, the "review your contract" hand-off once the
// client is verified, or the phone last-4 verification step. No contract data is
// read or rendered here, and the expected verification value never leaves the
// server. Identity/existence failures 404; expired or revoked links show a branded
// message.

import Link from "next/link";
import { notFound } from "next/navigation";

import { FileText, Lock } from "lucide-react";

import { resolvePortalAccess } from "@/server/portal";

import { PortalMessage } from "../_components/portal-message";
import { PortalVerifyForm } from "../_components/portal-verify-form";

// Token-gated, per-request data — never cache or statically render.
export const dynamic = "force-dynamic";

export default async function PortalLandingPage({
  params,
}: {
  params: Promise<{ accessToken: string }>;
}) {
  const { accessToken } = await params;
  const result = await resolvePortalAccess(accessToken);

  if (!result.ok) {
    if (result.reason === "not_found") notFound();
    return <PortalMessage reason={result.reason} orgName={result.orgName} />;
  }

  const { access } = result;

  if (access.verificationLockedAt) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-5 border border-neutral-200 bg-white px-8 py-12 text-center shadow-sm">
        <div className="flex size-12 items-center justify-center rounded-full bg-neutral-900/5 text-neutral-700">
          <Lock className="size-6" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="font-heading font-semibold text-neutral-900 text-xl">
            Link locked
          </h1>
          <p className="text-neutral-500 text-sm leading-6">
            This link has been locked after too many failed attempts. Please
            contact the designer for a new link.
          </p>
        </div>
      </div>
    );
  }

  if (!access.verifiedAt) {
    return (
      <PortalVerifyForm
        accessToken={accessToken}
        contractId={access.contractId}
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-5 border border-neutral-200 bg-white px-8 py-12 text-center shadow-sm">
      <div className="flex size-12 items-center justify-center rounded-full bg-neutral-900/5 text-neutral-700">
        <FileText className="size-6" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="font-heading font-semibold text-neutral-900 text-xl">
          Your contract is ready to review
        </h1>
        <p className="text-neutral-500 text-sm leading-6">
          Your interior design agreement is ready. Review the full document
          before signing.
        </p>
      </div>
      <Link
        href={`/portal/${accessToken}/contract/${access.contractId}`}
        className="inline-flex h-10 items-center justify-center rounded bg-neutral-900 px-6 font-medium text-sm text-white transition-colors hover:bg-neutral-800">
        Review your contract
      </Link>
    </div>
  );
}
