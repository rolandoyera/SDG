"use server";

// Server-only write side of the contract delivery + signing workflow. Everything
// here runs through firebase-admin (bypasses rules) and is the ONLY path allowed
// to mutate a contract's lifecycle past `draft`. Security-critical values
// (version id, document hash, timestamps, the signer's email, the company signer
// identity) are determined SERVER-SIDE — never trusted from the client.
//
//   sendContractForSignature → freezes the version, authorizes the company
//     signature (from org config), mints the token, emails the link, audits.
//   signContract             → validates the token + frozen version, applies both
//     signatures, marks fully executed, audits, generates the final PDF.

import { createHash, randomUUID } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";

import { headers } from "next/headers";

import { contractResendEligibility } from "@/lib/contract-resend";
import { ELECTRONIC_SIGNATURE_CONSENT_TEXT } from "@/lib/contract-text";
import { formatVendorPhone, normalizePhone, vendorPhoneTel } from "@/lib/utils";
import type {
  Client,
  CompanySignatureAuthorization,
  Contract,
  ContractSnapshot,
  LockedContractSnapshot,
  Organization,
  PortalAccess,
} from "@/lib/types";

import { getVerifiedCaller } from "./auth";
import { sendContractEmail } from "./brevo";
import { buildContractEmailHtml } from "./contract-email-template";
import { buildContractSignedEmailHtml } from "./contract-signed-email-template";
import { hasRecentPortalOpen, writeContractAuditEvent } from "./contract-audit";
import { nextContractDisplay } from "./contract-display";
import {
  type ExecutedContractPdf,
  generateAndStoreFinalContractPdf,
} from "./contract-pdf";
import { getAdminDb } from "./firebase-admin";
import { writeNotification } from "./notifications";
import { attachExecutedContractToProject } from "./project-documents";
import {
  createContractPortalAccess,
  DEFAULT_TTL_DAYS,
  hashAccessToken,
  hashPhoneLast4,
  MAX_VERIFICATION_ATTEMPTS,
} from "./portal";

const CONTRACTS_COLLECTION = "contracts";
const PORTAL_ACCESS_COLLECTION = "portalAccess";

/** Bell-notification dedupe for portal opens — deliberately wider than the 30-min audit dedupe. */
const PORTAL_VIEW_NOTIFY_DEDUPE_MS = 60 * 60 * 1000;

// ─── Hashing ─────────────────────────────────────────────────────────────────

/** Deterministic JSON (sorted keys) so a snapshot always hashes identically. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map(
      (k) =>
        `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`,
    )
    .join(",")}}`;
}

/** SHA-256 of the frozen document — binds a signature to the exact version sent. */
function hashSnapshot(snapshot: LockedContractSnapshot): string {
  return createHash("sha256").update(stableStringify(snapshot)).digest("hex");
}

// ─── Request context ─────────────────────────────────────────────────────────

/** Best-effort client IP + user agent from request headers (audit only). */
async function getRequestClientInfo(): Promise<{
  ipAddress?: string;
  userAgent?: string;
}> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ipAddress =
    forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
  return { ipAddress, userAgent: h.get("user-agent") ?? undefined };
}

/** Absolute origin for the emailed link, derived from the inbound request. */
async function getRequestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto =
    h.get("x-forwarded-proto") ??
    (host?.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// ─── Send for signature ──────────────────────────────────────────────────────

export type SendContractResult =
  | { ok: true; portalAccessId: string; portalUrl: string; emailSent: boolean }
  | { ok: false; error: string };

/**
 * Freeze + send a draft contract for client signature. Sending IS the company's
 * authorization: the org-configured contract signer is stamped into
 * `companySignatureAuthorization` so it can be applied if the client signs. Mints
 * the access token, emails the link via Brevo, and writes the `contract_sent`
 * audit event.
 */
export async function sendContractForSignature(input: {
  contractId: string;
  snapshot: ContractSnapshot;
}): Promise<SendContractResult> {
  const { contractId, snapshot } = input;
  const db = getAdminDb();

  const caller = await getVerifiedCaller();
  if (!caller) return { ok: false, error: "No active organization." };
  // Audit stamps carry the VERIFIED caller identity, never a client-supplied uid.
  const { organizationId, uid: userId } = caller;

  const contractRef = db.collection(CONTRACTS_COLLECTION).doc(contractId);
  const contractSnap = await contractRef.get();
  if (!contractSnap.exists) return { ok: false, error: "Contract not found." };
  const contract = contractSnap.data() as Contract;

  if (contract.organizationId !== organizationId) {
    return { ok: false, error: "Contract belongs to another organization." };
  }
  if (contract.status !== "draft" || contract.lockedSnapshot) {
    return { ok: false, error: "Only draft contracts can be sent." };
  }

  // Company authorization comes from the org-configured contract signer.
  const orgSnap = await db
    .collection("organizations")
    .doc(organizationId)
    .get();
  const org = orgSnap.data() as Organization | undefined;
  const signer = org?.settings?.contractSigner;
  if (!signer?.name || !signer?.title || !signer?.email) {
    return {
      ok: false,
      error:
        "Set a contract signer (name, title, email) in Company settings before sending.",
    };
  }

  // How long the signing link stays valid: the org's configured value, or 30 days.
  const configuredExpiration = org?.settings?.contractExpirationDays;
  const expirationDays =
    configuredExpiration && configuredExpiration > 0
      ? configuredExpiration
      : DEFAULT_TTL_DAYS;

  // The recipient is determined server-side from the client record, not the UI.
  const clientSnap = await db
    .collection("clients")
    .doc(contract.clientId)
    .get();
  const client = clientSnap.data() as Client | undefined;
  const sentToEmail = client?.email?.trim();
  if (!sentToEmail) {
    return { ok: false, error: "The client has no email address on file." };
  }

  // Identity verification uses the last 4 digits of the client's phone. Without a
  // usable number there's nothing to verify against, so block sending for now.
  const phoneDigits = normalizePhone(client?.phone ?? "");
  if (phoneDigits.length < 4) {
    return {
      ok: false,
      error:
        "The client needs a phone number on file — it's used to verify their identity before signing.",
    };
  }
  const phoneLast4 = phoneDigits.slice(-4);

  const now = Date.now();
  const lockedSnapshot: LockedContractSnapshot = {
    ...snapshot,
    lockedAt: now,
    lockedBy: userId,
  };
  const contractVersionId = randomUUID();
  const contractHash = hashSnapshot(lockedSnapshot);

  const companySignatureAuthorization: CompanySignatureAuthorization = {
    authorizedAt: now,
    authorizedBy: userId,
    signerName: signer.name,
    signerTitle: signer.title,
    signerEmail: signer.email,
    signatureType: "authorized_on_send",
  };

  // Atomic draft→sent freeze: re-checks the pre-image inside the transaction so a
  // double-send can't overwrite a snapshot.
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(contractRef);
      const current = fresh.data() as Contract | undefined;
      if (!current || current.status !== "draft" || current.lockedSnapshot) {
        throw new Error("Only draft contracts can be sent.");
      }
      tx.update(contractRef, {
        status: "sent",
        contractDisplay: nextContractDisplay(
          current.contractDisplay,
          "sent",
          now,
        ),
        lockedSnapshot,
        contractVersionId,
        contractHash,
        sentToEmail,
        sentBy: userId,
        sentAt: now,
        companySignatureAuthorization,
        updatedBy: userId,
        updatedAt: now,
      });
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to send.",
    };
  }

  // Mint the token-gated access record (separate top-level doc).
  // Mint the token-gated access record + email the link. Delivery events
  // (email_sent/delivered/…) come from the Brevo webhook, not here.
  const { portalAccessId, expiresAt, portalUrl, emailSent } =
    await mintAndEmailSigningLink({
      contract: { ...contract, organizationId, contractVersionId },
      org,
      signerEmail: signer.email,
      sentToEmail,
      phoneLast4,
      expirationDays,
    });

  // Denormalize the active link onto the contract so the list can show expiry
  // and resend can revoke it without reading portalAccess.
  await contractRef.update({
    activeAccessTokenId: portalAccessId,
    signingLinkExpiresAt: expiresAt,
  });

  await writeContractAuditEvent(contractId, {
    type: "contract_sent",
    occurredAt: now,
    actorType: "company_user",
    actorId: userId,
    recipientEmail: sentToEmail,
    contractVersionId,
    contractHash,
  });

  return {
    ok: true,
    portalAccessId,
    portalUrl,
    emailSent,
  };
}

/**
 * Mint a fresh portal-access token for a frozen contract and email the signing
 * link via Brevo. Shared by send and resend; the caller owns the contract-doc
 * lifecycle write and the audit event. Returns the new link's id + expiry.
 */
async function mintAndEmailSigningLink(args: {
  contract: Contract;
  org: Organization | undefined;
  signerEmail: string;
  sentToEmail: string;
  phoneLast4: string;
  expirationDays: number;
}): Promise<{
  portalAccessId: string;
  expiresAt: number;
  portalUrl: string;
  emailSent: boolean;
}> {
  const {
    contract,
    org,
    signerEmail,
    sentToEmail,
    phoneLast4,
    expirationDays,
  } = args;

  const { portalAccessId, accessToken, expiresAt } =
    await createContractPortalAccess({
      contract,
      sentToEmail,
      phoneLast4,
      ttlDays: expirationDays,
    });

  const portalUrl = `${await getRequestOrigin()}/portal/${accessToken}`;
  const companyName =
    org?.companyProfile?.legalName ||
    org?.companyProfile?.displayName ||
    "Sarvian Design Group";
  // Logo only renders in email if it's an absolute URL (clients can't resolve
  // app-relative paths); otherwise the template falls back to the company name.
  const rawLogo = org?.branding?.logoDarkUrl;
  const logoUrl = rawLogo?.startsWith("http") ? rawLogo : undefined;
  // Company phone for the "please call" line — omitted from the email when unset.
  const rawPhone = org?.companyProfile?.phone?.trim();
  const phoneCountry = org?.companyProfile?.phoneCountry;
  const companyPhone = rawPhone
    ? formatVendorPhone(rawPhone, phoneCountry)
    : undefined;
  const companyPhoneTel = rawPhone
    ? vendorPhoneTel(rawPhone, phoneCountry)
    : undefined;
  const emailResult = await sendContractEmail({
    to: { email: sentToEmail, name: contract.clientName },
    sender: { email: signerEmail, name: companyName },
    subject: `Your contract from ${companyName} is ready to sign`,
    htmlContent: buildContractEmailHtml({
      clientName: contract.clientName,
      companyName,
      portalUrl,
      logoUrl,
      expirationDays,
      companyPhone,
      companyPhoneTel,
    }),
    metadata: {
      contractId: contract.contractId,
      contractVersionId: contract.contractVersionId ?? "",
      accessTokenId: portalAccessId,
      organizationId: contract.organizationId,
      recipientEmail: sentToEmail,
    },
  });

  return { portalAccessId, expiresAt, portalUrl, emailSent: emailResult.ok };
}

/**
 * Resend the signing link for an already-sent, unsigned contract: revoke the old
 * portal access, mint + email a fresh one (reusing the same identity-verification
 * gate), and reset the contract's operational status to a fresh `sent` cycle. The
 * contract itself is never recreated; only the access link is replaced, so the
 * old link stops working immediately. The audit trail keeps the full history; the
 * contract doc carries only the current operational state.
 */
export async function resendContractSigningLink(input: {
  contractId: string;
}): Promise<SendContractResult> {
  const { contractId } = input;
  const db = getAdminDb();

  const caller = await getVerifiedCaller();
  if (!caller) return { ok: false, error: "No active organization." };
  // Audit stamps carry the VERIFIED caller identity, never a client-supplied uid.
  const { organizationId, uid: userId } = caller;

  const contractRef = db.collection(CONTRACTS_COLLECTION).doc(contractId);
  const contractSnap = await contractRef.get();
  if (!contractSnap.exists) return { ok: false, error: "Contract not found." };
  const contract = contractSnap.data() as Contract;

  if (contract.organizationId !== organizationId) {
    return { ok: false, error: "Contract belongs to another organization." };
  }
  const eligibility = contractResendEligibility(contract);
  if (!eligibility.ok) {
    return { ok: false, error: eligibility.reason };
  }

  // Same authorization + recipient resolution as send. The client record is
  // re-read so a corrected email/phone takes effect on the resend.
  const orgSnap = await db
    .collection("organizations")
    .doc(organizationId)
    .get();
  const org = orgSnap.data() as Organization | undefined;
  const signer = org?.settings?.contractSigner;
  if (!signer?.name || !signer?.title || !signer?.email) {
    return {
      ok: false,
      error:
        "Set a contract signer (name, title, email) in Company settings before resending.",
    };
  }
  const configuredExpiration = org?.settings?.contractExpirationDays;
  const expirationDays =
    configuredExpiration && configuredExpiration > 0
      ? configuredExpiration
      : DEFAULT_TTL_DAYS;

  const clientSnap = await db
    .collection("clients")
    .doc(contract.clientId)
    .get();
  const client = clientSnap.data() as Client | undefined;
  const sentToEmail = client?.email?.trim();
  if (!sentToEmail) {
    return { ok: false, error: "The client has no email address on file." };
  }
  const phoneDigits = normalizePhone(client?.phone ?? "");
  if (phoneDigits.length < 4) {
    return {
      ok: false,
      error:
        "The client needs a phone number on file — it's used to verify their identity before signing.",
    };
  }
  const phoneLast4 = phoneDigits.slice(-4);

  const now = Date.now();

  // Revoke the old link first so it stops working immediately.
  const previousAccessTokenId = contract.activeAccessTokenId;
  if (previousAccessTokenId) {
    await db
      .collection(PORTAL_ACCESS_COLLECTION)
      .doc(previousAccessTokenId)
      .update({
        status: "revoked",
        revokedAt: now,
        revokedReason: "replaced_by_resend",
      });
    await writeContractAuditEvent(contractId, {
      type: "portal_access_revoked",
      occurredAt: now,
      actorType: "company_user",
      actorId: userId,
      accessTokenId: previousAccessTokenId,
      reason: "replaced_by_resend",
    });
  }

  const { portalAccessId, expiresAt, portalUrl, emailSent } =
    await mintAndEmailSigningLink({
      contract,
      org,
      signerEmail: signer.email,
      sentToEmail,
      phoneLast4,
      expirationDays,
    });

  // Reset to a fresh "sent" cycle. `nextContractDisplay(undefined, …)` rebuilds
  // the chain from scratch so a previously expired/viewed contract doesn't carry
  // its old stage forward; `viewedAt` is cleared for the new link.
  await contractRef.update({
    status: "sent",
    contractDisplay: nextContractDisplay(undefined, "sent", now),
    activeAccessTokenId: portalAccessId,
    signingLinkExpiresAt: expiresAt,
    sentToEmail,
    sentBy: userId,
    sentAt: now,
    viewedAt: FieldValue.delete(),
    updatedBy: userId,
    updatedAt: now,
  });

  await writeContractAuditEvent(contractId, {
    type: "contract_resent",
    occurredAt: now,
    actorType: "company_user",
    actorId: userId,
    recipientEmail: sentToEmail,
    accessTokenId: portalAccessId,
    previousAccessTokenId,
  });

  return { ok: true, portalAccessId, portalUrl, emailSent };
}

/**
 * Lazy expiry sweep (no cron): flip any sent/viewed contract whose signing link
 * has lapsed to `expired` (status + display) and audit it. Call this when the
 * dashboard loads the contracts. Idempotent — an already-`expired` contract is
 * filtered out, so it never re-flips or re-audits. Delivery-failed contracts are
 * left alone (the user resends them after fixing the email).
 */
export async function expireLapsedContractLinks(
  organizationId: string,
): Promise<void> {
  const db = getAdminDb();
  const now = Date.now();
  try {
    const snap = await db
      .collection(CONTRACTS_COLLECTION)
      .where("organizationId", "==", organizationId)
      .get();

    const lapsed = snap.docs
      .map((d) => d.data() as Contract)
      .filter(
        (c) =>
          !!c.sentAt &&
          !c.executedAt &&
          c.status !== "voided" &&
          c.status !== "expired" &&
          c.status !== "fully_executed" &&
          c.contractDisplay?.stage !== "delivery_failed" &&
          !!c.signingLinkExpiresAt &&
          c.signingLinkExpiresAt < now,
      );

    await Promise.all(
      lapsed.map(async (c) => {
        await db
          .collection(CONTRACTS_COLLECTION)
          .doc(c.contractId)
          .update({
            status: "expired",
            contractDisplay: nextContractDisplay(
              c.contractDisplay,
              "expired",
              now,
            ),
            updatedAt: now,
          });
        await writeContractAuditEvent(c.contractId, {
          type: "contract_link_expired",
          occurredAt: now,
          actorType: "system",
          accessTokenId: c.activeAccessTokenId,
        });
      }),
    );
  } catch (error) {
    console.error("Failed to expire lapsed contract links:", error);
  }
}

// ─── Portal open tracking ────────────────────────────────────────────────────

/**
 * Record a meaningful portal open: stamps `portalAccess.viewedAt` once, advances
 * a still-`sent` contract to `viewed`, and writes a `portal_opened` audit event —
 * deduped so a reload within 30 minutes for the same token doesn't log twice.
 * Best-effort; never blocks rendering.
 */
export async function recordPortalOpen(
  access: PortalAccess,
  contract: Contract,
): Promise<void> {
  const now = Date.now();
  const db = getAdminDb();

  // Bell notification per visit, deduped against the stamp on the access doc
  // (already loaded — no extra reads).
  const shouldNotify =
    !access.portalViewNotifiedAt ||
    now - access.portalViewNotifiedAt >= PORTAL_VIEW_NOTIFY_DEDUPE_MS;

  try {
    const batch = db.batch();
    let dirty = false;
    const accessUpdates: Record<string, number> = {};
    if (!access.viewedAt) accessUpdates.viewedAt = now;
    if (shouldNotify) accessUpdates.portalViewNotifiedAt = now;
    if (Object.keys(accessUpdates).length > 0) {
      batch.update(
        db.collection(PORTAL_ACCESS_COLLECTION).doc(access.portalAccessId),
        accessUpdates,
      );
      dirty = true;
    }
    if (contract.status === "sent") {
      batch.update(
        db.collection(CONTRACTS_COLLECTION).doc(contract.contractId),
        {
          status: "viewed",
          contractDisplay: nextContractDisplay(
            contract.contractDisplay,
            "viewed",
            now,
          ),
          viewedAt: contract.viewedAt ?? now,
          updatedAt: now,
        },
      );
      dirty = true;
    }
    if (dirty) await batch.commit();

    if (
      !(await hasRecentPortalOpen(
        contract.contractId,
        access.portalAccessId,
        now,
      ))
    ) {
      const { ipAddress, userAgent } = await getRequestClientInfo();
      await writeContractAuditEvent(contract.contractId, {
        type: "portal_opened",
        occurredAt: now,
        actorType: "client",
        recipientEmail: access.sentToEmail,
        accessTokenId: access.portalAccessId,
        ipAddress,
        userAgent,
      });
    }

    if (shouldNotify) {
      await writeNotification({
        organizationId: contract.organizationId,
        type: "contract_portal_opened",
        audience: "org",
        title: `${contract.clientName} entered the contract portal`,
        body: contract.title,
        href: `/dashboard/contracts/${contract.contractId}`,
        actor: {
          type: "client",
          id: contract.clientId,
          name: contract.clientName,
        },
        createdAt: now,
      });
    }
  } catch (error) {
    console.error("Failed to record portal open:", error);
  }
}

// ─── Verify identity ─────────────────────────────────────────────────────────

export type VerifyPortalResult =
  | { ok: true }
  | { ok: false; error: string; locked?: boolean };

/**
 * Confirm the client's identity (last 4 digits of their phone) before the
 * contract document or signing form is ever rendered. Runs entirely server-side:
 * the expected value lives only as a salted hash, the submitted digits are never
 * echoed back, and success is recorded as `verifiedAt` on the access record (a
 * field the client SDK can't write). Failures increment a counter and lock the
 * link after MAX_VERIFICATION_ATTEMPTS.
 */
export async function verifyPortalAccess(input: {
  accessToken: string;
  contractId: string;
  phoneLast4: string;
}): Promise<VerifyPortalResult> {
  const { accessToken, contractId } = input;
  const phoneLast4 = (input.phoneLast4 ?? "").replace(/\D/g, "");
  const db = getAdminDb();

  if (phoneLast4.length !== 4) {
    return {
      ok: false,
      error: "Enter the last 4 digits of your phone number.",
    };
  }

  // Resolve + validate the access token.
  const accessQuery = await db
    .collection(PORTAL_ACCESS_COLLECTION)
    .where("tokenHash", "==", hashAccessToken(accessToken))
    .limit(1)
    .get();
  if (accessQuery.empty) return { ok: false, error: "Invalid link." };
  const accessRef = accessQuery.docs[0].ref;
  const access = accessQuery.docs[0].data() as PortalAccess;

  if (
    access.type !== "contract_signature" ||
    access.contractId !== contractId ||
    access.status === "revoked"
  ) {
    return { ok: false, error: "This link is no longer valid." };
  }
  if (access.status === "expired" || access.expiresAt < Date.now()) {
    return { ok: false, error: "This link has expired." };
  }
  if (access.verificationLockedAt) {
    return {
      ok: false,
      locked: true,
      error:
        "This link has been locked after too many failed attempts. Please contact the designer for a new link.",
    };
  }
  // Already verified — idempotent success.
  if (access.verifiedAt) return { ok: true };

  // The contract must exist, match the access record, and be frozen to verify.
  const contractSnap = await db
    .collection(CONTRACTS_COLLECTION)
    .doc(contractId)
    .get();
  const contract = contractSnap.exists
    ? (contractSnap.data() as Contract)
    : undefined;
  if (!contract?.lockedSnapshot) {
    return { ok: false, error: "This contract is not available." };
  }
  if (
    contract.organizationId !== access.organizationId ||
    contract.clientId !== access.clientId ||
    contract.projectId !== access.projectId
  ) {
    return { ok: false, error: "This contract is not available." };
  }

  const expected = access.verificationPhoneLast4Hash;
  const matches =
    !!expected &&
    hashPhoneLast4(access.portalAccessId, phoneLast4) === expected;

  if (matches) {
    await accessRef.update({ verifiedAt: Date.now() });
    return { ok: true };
  }

  // Wrong digits: count the attempt and lock at the limit.
  const attempts = (access.failedVerificationAttempts ?? 0) + 1;
  const reachedLimit = attempts >= MAX_VERIFICATION_ATTEMPTS;
  await accessRef.update({
    failedVerificationAttempts: attempts,
    ...(reachedLimit ? { verificationLockedAt: Date.now() } : {}),
  });
  if (reachedLimit) {
    return {
      ok: false,
      locked: true,
      error:
        "This link has been locked after too many failed attempts. Please contact the designer for a new link.",
    };
  }
  return {
    ok: false,
    error:
      "That did not match our records. Please check the number and try again.",
  };
}

// ─── Sign ────────────────────────────────────────────────────────────────────

export type SignContractResult = { ok: true } | { ok: false; error: string };

/**
 * Apply the client's typed signature and execute the contract. Validates the
 * token, the frozen version, and the document hash; records the e-sign consent;
 * applies the pre-authorized company signature; marks the contract executed;
 * writes the consent/signed/executed audit events; completes the access token; and
 * generates the final dual-signature PDF.
 */
export async function signContract(input: {
  accessToken: string;
  contractId: string;
  signerName: string;
  consentAccepted: boolean;
}): Promise<SignContractResult> {
  const { accessToken, contractId, signerName, consentAccepted } = input;
  const db = getAdminDb();

  if (!consentAccepted) {
    return { ok: false, error: "You must accept the consent to sign." };
  }
  const typedName = signerName.trim();
  if (!typedName) {
    return { ok: false, error: "Enter your name to sign." };
  }

  // Resolve + validate the access token.
  const accessQuery = await db
    .collection(PORTAL_ACCESS_COLLECTION)
    .where("tokenHash", "==", hashAccessToken(accessToken))
    .limit(1)
    .get();
  if (accessQuery.empty) return { ok: false, error: "Invalid signing link." };
  const access = accessQuery.docs[0].data() as PortalAccess;

  if (
    access.type !== "contract_signature" ||
    access.contractId !== contractId ||
    access.status !== "active" ||
    access.expiresAt < Date.now()
  ) {
    return { ok: false, error: "This signing link is no longer valid." };
  }

  // Identity must have been verified server-side before signing is allowed.
  if (access.verificationLockedAt) {
    return {
      ok: false,
      error:
        "This link has been locked after too many failed attempts. Please contact the designer for a new link.",
    };
  }
  if (!access.verifiedAt) {
    return { ok: false, error: "Please verify your identity before signing." };
  }

  const contractRef = db.collection(CONTRACTS_COLLECTION).doc(contractId);
  const contractSnap = await contractRef.get();
  if (!contractSnap.exists) return { ok: false, error: "Contract not found." };
  const contract = contractSnap.data() as Contract;

  // Identity + frozen-version checks.
  if (
    contract.organizationId !== access.organizationId ||
    contract.clientId !== access.clientId ||
    contract.projectId !== access.projectId
  ) {
    return { ok: false, error: "This signing link is no longer valid." };
  }
  if (contract.status !== "sent" && contract.status !== "viewed") {
    return { ok: false, error: "This contract can no longer be signed." };
  }
  const locked = contract.lockedSnapshot;
  if (
    !locked ||
    !contract.contractVersionId ||
    !contract.contractHash ||
    !contract.companySignatureAuthorization
  ) {
    return { ok: false, error: "This contract is not ready for signature." };
  }
  if (hashSnapshot(locked) !== contract.contractHash) {
    return {
      ok: false,
      error: "The contract has changed; please request a new link.",
    };
  }

  const now = Date.now();
  const { ipAddress, userAgent } = await getRequestClientInfo();
  const signerEmail = access.sentToEmail; // server-determined identity

  const clientSignature = {
    signerName: typedName,
    signerEmail,
    signedAt: now,
    consentText: ELECTRONIC_SIGNATURE_CONSENT_TEXT,
    consentAcceptedAt: now,
    ipAddress,
    userAgent,
  };

  // Atomic execution: re-verify the contract is still signable, then execute.
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(contractRef);
      const current = fresh.data() as Contract | undefined;
      if (
        !current ||
        (current.status !== "sent" && current.status !== "viewed")
      ) {
        throw new Error("This contract can no longer be signed.");
      }
      tx.update(contractRef, {
        status: "fully_executed",
        contractDisplay: nextContractDisplay(
          current.contractDisplay,
          "executed",
          now,
        ),
        clientSignature: JSON.parse(JSON.stringify(clientSignature)),
        executedAt: now,
        updatedAt: now,
      });
      tx.update(
        db.collection(PORTAL_ACCESS_COLLECTION).doc(access.portalAccessId),
        {
          status: "completed",
          consentAcceptedAt: now,
          completedAt: now,
        },
      );
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to sign.",
    };
  }

  // Evidence chain: consent → signed → fully executed.
  await writeContractAuditEvent(contractId, {
    type: "electronic_signature_consent_accepted",
    occurredAt: now,
    actorType: "client",
    recipientEmail: signerEmail,
    accessTokenId: access.portalAccessId,
    consentText: ELECTRONIC_SIGNATURE_CONSENT_TEXT,
    ipAddress,
    userAgent,
  });
  await writeContractAuditEvent(contractId, {
    type: "contract_signed",
    occurredAt: now,
    actorType: "client",
    signerName: typedName,
    signerEmail,
    accessTokenId: access.portalAccessId,
    contractVersionId: contract.contractVersionId,
    contractHash: contract.contractHash,
    ipAddress,
    userAgent,
  });

  // ── Post-execution artifacts (best-effort) ──
  // The contract is already fully executed above; a failure here is logged but
  // never unwinds execution. Order of operations: generate the executed PDF from
  // the server-loaded snapshot → store it in Storage → reference it on the
  // contract → reference it in the project's documents → email the client the
  // exact stored copy → write the fully-executed audit event.
  const executedContract: Contract = {
    ...contract,
    clientSignature,
    executedAt: now,
    status: "fully_executed",
  };

  let executedFilePath: string | undefined;
  let executedPdf: ExecutedContractPdf | undefined;
  try {
    executedPdf = await generateAndStoreFinalContractPdf({
      contract: executedContract,
    });
    executedFilePath = executedPdf.path;

    // Project-facing reference to the SAME stored file (no byte duplication).
    const { fileUrl } = await attachExecutedContractToProject({
      organizationId: contract.organizationId,
      projectId: contract.projectId,
      clientId: contract.clientId,
      contractId,
      contractCode: contract.contractCode,
      title: contract.title,
      fileName: executedPdf.fileName,
      filePath: executedPdf.path,
    });

    await contractRef.update({
      executedFilePath,
      executedFileName: executedPdf.fileName,
      executedFileUrl: fileUrl,
      executedFileGeneratedAt: Date.now(),
      // Kept in sync so the token-gated portal download route reads cleanly.
      finalPdfPath: executedFilePath,
      finalPdfGeneratedAt: Date.now(),
    });
  } catch (error) {
    console.error("Failed to generate/store executed contract PDF:", error);
  }

  // Confirmation email to the client with the exact stored executed PDF attached.
  if (executedPdf) {
    try {
      await sendExecutedContractConfirmation({
        contract: executedContract,
        recipientEmail: signerEmail,
        pdf: executedPdf,
      });
    } catch (error) {
      console.error("Failed to send contract confirmation email:", error);
    }
  }

  await writeContractAuditEvent(contractId, {
    type: "contract_fully_executed",
    occurredAt: now,
    actorType: "system",
    contractVersionId: contract.contractVersionId,
    contractHash: contract.contractHash,
    finalPdfPath: executedFilePath,
  });

  // Bell notification for the org — best-effort like the artifacts above.
  try {
    await writeNotification({
      organizationId: contract.organizationId,
      type: "contract_executed",
      audience: "org",
      title: `Contract executed: ${contract.title}`,
      body: `Signed by ${typedName}`,
      href: `/dashboard/contracts/${contractId}`,
      actor: { type: "client", id: contract.clientId, name: typedName },
      createdAt: now,
    });
  } catch (error) {
    console.error("Failed to write contract-executed notification:", error);
  }

  return { ok: true };
}

/**
 * Email the client a confirmation that the contract is fully executed, with the
 * stored executed PDF attached (the exact bytes we wrote to Storage — never a
 * re-rendered copy). Branding is pulled best-effort from the org; the email
 * carries no audit metadata, so it stays out of the signing-delivery certificate
 * chain.
 */
async function sendExecutedContractConfirmation(input: {
  contract: Contract;
  recipientEmail: string;
  pdf: ExecutedContractPdf;
}): Promise<void> {
  const { contract, recipientEmail, pdf } = input;

  const orgSnap = await getAdminDb()
    .collection("organizations")
    .doc(contract.organizationId)
    .get();
  const org = orgSnap.data() as Organization | undefined;

  const companyName =
    org?.companyProfile?.legalName ||
    org?.companyProfile?.displayName ||
    "Sarvian Design Group";
  const rawLogo = org?.branding?.logoDarkUrl;
  const logoUrl = rawLogo?.startsWith("http") ? rawLogo : undefined;
  const rawPhone = org?.companyProfile?.phone?.trim();
  const phoneCountry = org?.companyProfile?.phoneCountry;
  const companyPhone = rawPhone
    ? formatVendorPhone(rawPhone, phoneCountry)
    : undefined;
  const companyPhoneTel = rawPhone
    ? vendorPhoneTel(rawPhone, phoneCountry)
    : undefined;

  const senderEmail =
    contract.companySignatureAuthorization?.signerEmail ||
    org?.settings?.contractSigner?.email;
  if (!senderEmail) {
    console.warn(
      `[contract-confirmation] No sender email for contract ${contract.contractId}; skipping confirmation email.`,
    );
    return;
  }

  await sendContractEmail({
    to: { email: recipientEmail, name: contract.clientName },
    sender: { email: senderEmail, name: companyName },
    subject: `Your signed contract from ${companyName}`,
    htmlContent: buildContractSignedEmailHtml({
      clientName: contract.clientName,
      companyName,
      fileName: pdf.fileName,
      logoUrl,
      companyPhone,
      companyPhoneTel,
    }),
    attachments: [
      { content: pdf.buffer.toString("base64"), name: pdf.fileName },
    ],
  });
}
