"use server";

import type { Project } from "@/lib/types";

import { getActiveOrgId } from "./auth";
import { getAdminDb } from "./firebase-admin";
import { allocateReferenceCode } from "./reference-codes";

type CreateProjectInput = Omit<
  Project,
  | "projectId"
  | "organizationId"
  | "projectCode"
  | "projectNumber"
  | "clientCode"
  | "createdAt"
  | "updatedAt"
  | "lastActivityAt"
>;

/**
 * Create a project server-side, minting its reference code inside a transaction.
 * The selected client's `clientCode` is read (in the same transaction, before any
 * write) and copied onto the project when present. Org comes from the active-org
 * cookie. Returns the full record.
 */
export async function createProject(
  input: CreateProjectInput,
): Promise<Project> {
  const organizationId = await getActiveOrgId();
  if (!organizationId) throw new Error("No active organization.");

  const db = getAdminDb();
  const projectId = `project-${Math.random().toString(36).slice(2, 11)}`;

  return db.runTransaction(async (tx) => {
    // Read the selected client before any write (reads-before-writes rule).
    const clientSnap = await tx.get(db.doc(`clients/${input.clientId}`));
    const clientCode = clientSnap.get("clientCode") as string | undefined;

    const { code, number } = await allocateReferenceCode(
      tx,
      db,
      organizationId,
      "project",
    );

    const now = Date.now();
    const project: Project = {
      ...input,
      projectId,
      organizationId,
      projectCode: code,
      projectNumber: number,
      clientCode,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
    };

    tx.set(db.doc(`projects/${projectId}`), project);
    return project;
  });
}
