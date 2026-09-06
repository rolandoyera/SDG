"use client";

// DEV-ONLY on-screen preview of the final contract PDF, for styling without
// re-sending/re-signing. Renders the exact production <ContractPdf> tree inside
// @react-pdf's <PDFViewer> (browser iframe), so edits to the shared styles in
// `@/lib/contract-pdf-document` hot-reload here live. Open with ?id=<contractId>;
// defaults to the contract currently being styled. Disabled in production.

import { Suspense, useEffect, useState } from "react";

import dynamic from "next/dynamic";
import { notFound, useSearchParams } from "next/navigation";

import { LoadingState } from "@/components/loading-state";
import type { CertData } from "@/lib/contract-pdf-document";
import { ContractPdf } from "@/lib/contract-pdf-document";
import type { Contract } from "@/lib/types";
import { loadContractPdfPreview } from "@/server/contract-pdf-preview";

// @react-pdf's DOM viewer can't be server-rendered.
const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFViewer),
  { ssr: false },
);

const DEFAULT_CONTRACT_ID = "GGoDMHTgB3E0Ur4UUsiH";

export default function ContractPdfPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <Suspense fallback={<LoadingState label="Loading Contract" />}>
      <PreviewInner />
    </Suspense>
  );
}

function PreviewInner() {
  const searchParams = useSearchParams();
  const contractId = searchParams.get("id") ?? DEFAULT_CONTRACT_ID;

  const [data, setData] = useState<{
    contract: Contract;
    cert: CertData;
    timeZone?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    loadContractPdfPreview(contractId)
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load contract."),
      );
  }, [contractId]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center p-8 text-center text-destructive text-sm">
        {error}
      </div>
    );
  }

  if (!data) return <LoadingState label="Loading Contract" />;

  return (
    <PDFViewer style={{ width: "100%", height: "100vh", border: "none" }}>
      <ContractPdf
        contract={data.contract}
        cert={data.cert}
        timeZone={data.timeZone}
      />
    </PDFViewer>
  );
}
