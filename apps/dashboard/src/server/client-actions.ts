"use server";

import type { Client } from "@/lib/types";

import { getActiveOrgId } from "./auth";
import { getAdminDb } from "./firebase-admin";
import { allocateReferenceCode } from "./reference-codes";

type CreateClientInput = Omit<
  Client,
  "uid" | "organizationId" | "clientCode" | "clientNumber" | "createdAt"
>;

/**
 * Create a client server-side, minting its reference code inside a transaction so
 * concurrent creates can't collide on the sequence. The org is resolved from the
 * active-org cookie (never trusted from the client). Returns the full record.
 */
export async function createClient(input: CreateClientInput): Promise<Client> {
  const organizationId = await getActiveOrgId();
  if (!organizationId) throw new Error("No active organization.");

  const db = getAdminDb();
  const uid = `client-${Math.random().toString(36).slice(2, 11)}`;

  return db.runTransaction(async (tx) => {
    const { code, number } = await allocateReferenceCode(
      tx,
      db,
      organizationId,
      "client",
    );

    const client: Client = {
      ...input,
      uid,
      organizationId,
      clientCode: code,
      clientNumber: number,
      createdAt: Date.now(),
    };

    tx.set(db.doc(`clients/${uid}`), client);
    return client;
  });
}
