"use server";

import type { ActivityActor, Client, Lead } from "@/lib/types";

import { getActiveOrgId } from "./auth";
import { getAdminDb } from "./firebase-admin";
import { allocateReferenceCode } from "./reference-codes";

/**
 * Convert a lead into a new client server-side, in one transaction: allocate the
 * client's reference code, create the client (carrying `sourceLeadId`), and mark
 * the lead `won` with conversion audit fields. The lead is never deleted. Org
 * comes from the active-org cookie. Returns the created client.
 */
export async function convertLeadToClient(
  lead: Lead,
  convertedBy: string,
  actor: ActivityActor,
): Promise<Client> {
  const organizationId = await getActiveOrgId();
  if (!organizationId) throw new Error("No active organization.");

  const db = getAdminDb();
  const clientUid = `client-${Math.random().toString(36).slice(2, 11)}`;

  return db.runTransaction(async (tx) => {
    const { code, number } = await allocateReferenceCode(
      tx,
      db,
      organizationId,
      "client",
    );

    const now = Date.now();
    const newClient: Client = {
      uid: clientUid,
      organizationId,
      isCompany: lead.isCompany,
      company: lead.company,
      firstName: lead.firstName ?? "",
      lastName: lead.lastName ?? "",
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      phoneCountry: lead.phoneCountry,
      street: lead.street,
      city: lead.city,
      state: lead.state,
      zip: lead.zip,
      country: lead.country,
      sourceLeadId: lead.uid,
      clientCode: code,
      clientNumber: number,
      createdAt: now,
    };

    tx.set(db.doc(`clients/${clientUid}`), newClient);
    tx.update(db.doc(`leads/${lead.uid}`), {
      stage: "won",
      convertedClientId: clientUid,
      convertedAt: now,
      convertedBy,
      updatedBy: actor,
      updatedAt: now,
      lastActivityAt: now,
    });

    return newClient;
  });
}
