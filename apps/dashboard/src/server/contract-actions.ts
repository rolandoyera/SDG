"use server";

import type { Contract, ContractDraftInput } from "@/lib/types";

import { getActiveOrgId } from "./auth";
import { nextContractDisplay } from "./contract-display";
import { getAdminDb } from "./firebase-admin";
import { allocateReferenceCode } from "./reference-codes";

/**
 * Create a draft contract server-side, minting its reference code inside a
 * transaction. Mirrors the previous client-SDK `addContract` (same draft shape)
 * but resolves the org from the active-org cookie and assigns a contractCode.
 * Returns the new contractId.
 */
export async function createContract(
  userId: string,
  data: ContractDraftInput,
): Promise<string> {
  const organizationId = await getActiveOrgId();
  if (!organizationId) throw new Error("No active organization.");

  const db = getAdminDb();
  const contractId = db.collection("contracts").doc().id;

  return db.runTransaction(async (tx) => {
    const { code, number } = await allocateReferenceCode(
      tx,
      db,
      organizationId,
      "contract",
    );

    const now = Date.now();
    const contract: Contract = {
      ...data,
      contractId,
      organizationId,
      contractCode: code,
      contractNumber: number,
      status: "draft",
      contractDisplay: nextContractDisplay(undefined, "draft", now),
      lockedSnapshot: null,
      createdBy: userId,
      createdAt: now,
      updatedBy: userId,
      updatedAt: now,
    };

    tx.set(db.doc(`contracts/${contractId}`), contract);
    return contractId;
  });
}
