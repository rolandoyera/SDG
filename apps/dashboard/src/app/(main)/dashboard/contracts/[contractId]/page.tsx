"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useParams } from "next/navigation";

import { LoadingState } from "@/components/loading-state";
import { FadeIn } from "@/components/fade-in";
import { useAuth } from "@/components/auth-context";
import { PageTitle } from "@/components/page-title-updater";
import { getContract } from "@/lib/db";
import type { Contract } from "@/lib/types";

import { ContractBuilder } from "../_components/contract-builder";

export default function EditContractPage() {
  const { organizationId, loading: authLoading } = useAuth();
  const { contractId } = useParams<{ contractId: string }>();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !organizationId || !contractId) return;
    const orgId = organizationId; // stable string dep
    let active = true;
    async function load() {
      try {
        const data = await getContract(contractId);
        // Tenant guard: never surface another org's contract.
        if (active) {
          setContract(data && data.organizationId === orgId ? data : null);
        }
      } catch (error) {
        console.error("Failed to load contract:", error);
        if (active) setContract(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [authLoading, organizationId, contractId]);

  if (loading) return <LoadingState label="Loading Contract" />;

  if (!contract) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
        <p className="font-medium text-foreground">Contract not found.</p>
        <Link
          href="/dashboard/contracts"
          className="text-primary text-sm hover:underline"
        >
          Back to Contracts
        </Link>
      </div>
    );
  }

  return (
    <FadeIn>
      <PageTitle title={contract.title || "Contract"} />
      {/* key remounts the builder so its initial state re-seeds per contract. */}
      <ContractBuilder key={contract.contractId} contract={contract} />
    </FadeIn>
  );
}
