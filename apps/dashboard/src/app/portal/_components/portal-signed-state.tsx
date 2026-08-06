// Shown after a contract is fully executed. Confirms the signature and links to
// the final signed PDF (both signatures + certificate). The PDF streams through a
// token-gated download route — never a public URL — so only the holder of this
// link can retrieve it.

import { CheckCircle2, Download } from "lucide-react";

/** "Jun 26, 2026, 2:14 PM" from an epoch-ms timestamp. */
function formatSignedAt(ms?: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function PortalSignedState({
  accessToken,
  contractId,
  signerName,
  signedAt,
}: {
  accessToken: string;
  contractId: string;
  signerName?: string;
  signedAt?: number;
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 border border-neutral-200 bg-white px-8 py-8 text-center shadow-sm">
      <div className="flex size-12 items-center justify-center rounded-full bg-green-500/10 text-green-600">
        <CheckCircle2 className="size-6" />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="font-heading font-semibold text-lg text-neutral-900">
          Contract executed
        </h2>
        <p className="text-neutral-500 text-sm leading-6">
          {signerName ? `Signed by ${signerName}` : "Signed"}
          {signedAt ? ` on ${formatSignedAt(signedAt)}` : ""}.
        </p>
      </div>
      <a
        href={`/portal/${accessToken}/contract/${contractId}/download`}
        className="inline-flex h-10 items-center justify-center gap-2 rounded bg-neutral-900 px-6 font-medium text-sm text-white transition-colors hover:bg-neutral-800">
        <Download className="size-4" />
        Download signed PDF
      </a>
    </div>
  );
}
