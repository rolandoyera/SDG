import type { DropboxIntegrationConfig } from "@/types/dropbox";
import type { MetaIntegrationConfig } from "@/types/meta";

export interface Client {
  uid: string;
  organizationId: string;
  /** First-class contact type flag. Defaults to false for legacy clients that predate the field. */
  isCompany: boolean;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** ISO 3166-1 alpha-2 code that drives phone formatting/validation. */
  phoneCountry?: string;
  company?: string;
  taxId?: string;
  taxable?: boolean;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  /** Set when this client was created by converting a Lead. */
  sourceLeadId?: string;
  /** Human-facing reference code (e.g. "ORG-CLI-0001"), minted server-side at creation. */
  clientCode?: string;
  /** Sequential org-level number behind clientCode. */
  clientNumber?: number;
  createdAt: number;
}

// --- ACTIVITY ---
// Activities are append-only audit records in a single top-level `activities`
// collection (NOT per-entity subcollections). Each doc is self-contained — it
// carries its org, the actor, and a `source` pointer to the record it concerns.
// Today they're written only alongside note add/delete, giving notes an
// immutable audit trail. Notes themselves stay as parent subcollections (see
// ClientNote).

/** Who triggered an activity or authored a note. */
export interface ActivityActor {
  type: "user" | "client" | "system";
  /** Optional — system-generated events have no real actor id. */
  id?: string;
  /** Denormalized at write time so timelines need no lookups and stay historically accurate. */
  name: string;
}

/** Record types an activity can belong to or point at. */
export type ActivityEntityType = "client" | "project" | "note";

/**
 * The record whose timeline this activity belongs to — the per-entity query
 * key (filter activities by `source.type` + `source.id`).
 */
export interface ActivitySource {
  type: ActivityEntityType;
  id: string;
  /** Denormalized display name so feed rows render without a lookup. */
  label?: string;
}

/**
 * What the activity points at. Often the same record as `source`; sometimes a
 * related one (e.g. a conversion's source is the lead, entity is the client).
 */
export interface ActivityEntity {
  type: ActivityEntityType;
  id: string;
  /** Denormalized label for display. */
  label?: string;
}

/** Activity events. Scoped to note add/delete — the only events we record. */
export type ActivityType = "note_added" | "note_deleted";

/**
 * Append-only audit record in the top-level `activities` collection. Written
 * once, never updated or deleted. Currently emitted only alongside note
 * add/delete, giving notes an immutable audit trail.
 */
export interface Activity {
  id: string;
  organizationId: string;
  type: ActivityType;
  actor: ActivityActor;
  /** The record whose timeline this belongs to — the per-entity query key. */
  source: ActivitySource;
  /** What the event is about; often equals `source`, sometimes a related record. */
  entity: ActivityEntity;
  /** Who can see it. Defaults to internal; opt specific events into the portal later. */
  visibility: "internal" | "client_visible";
  createdAt: number;
}

// --- NOTIFICATIONS ---

export type NotificationType =
  | "lead_created"
  | "contract_portal_opened"
  | "contract_executed";

/**
 * In-app notification in the top-level `notifications` collection. One doc per
 * event, fan-out on read: org-wide docs are visible to every org member, and
 * each member tracks their own read/dismiss state via `readBy`/`dismissedBy`
 * (client-SDK `arrayUnion` of their own uid — the only update rules allow).
 * Created server-side only (admin SDK); the oshrat marketing repo writes
 * `lead_created` docs mirroring this shape, synced manually.
 */
export interface AppNotification {
  /** = doc id, minted server-side. */
  notificationId: string;
  organizationId: string;
  type: NotificationType;
  /** "org" = every org member; otherwise a single recipient uid (future tasks). */
  audience: "org" | (string & {});
  title: string;
  body?: string;
  /** Dashboard-relative View Link target, e.g. "/dashboard/leads/lead-123". */
  href?: string;
  actor: ActivityActor;
  /** Uids who marked it read. */
  readBy: string[];
  /** Uids who deleted it from their bell (soft delete; doc stays for others). */
  dismissedBy: string[];
  createdAt: number;
  /**
   * Firestore TTL field (~60 days) — the only non-epoch-ms timestamp in the
   * app, because TTL requires a real Timestamp. Attached after cleanUndefined
   * (the JSON round-trip would destroy it). Never read by the app.
   */
  expireAt: unknown;
}

/**
 * Append-only note. Immutable after creation: never edited, never physically
 * deleted. Removal is a creator-only soft-delete that stamps
 * `deletedAt`/`deletedBy`. Notes stay as a parent subcollection at
 * `clients/{clientId}/notes/{id}`.
 */
export interface ClientNote {
  id: string;
  organizationId: string;
  clientId: string;
  body: string;
  createdBy: ActivityActor;
  /** Epoch milliseconds — the app-wide timestamp convention. */
  createdAt: number;
  deletedAt?: number;
  deletedBy?: ActivityActor;
}

/**
 * An editable project note. Unlike {@link ClientNote} (append-only, soft-delete),
 * project notes are working content: the author can edit the body (stamps
 * `updatedAt`/`updatedBy`) and a hard delete removes the document outright. A
 * `note_added` activity is written on create only (not on edit/delete). Stored
 * as a parent subcollection at `projects/{projectId}/notes/{id}`.
 */
export interface ProjectNote {
  id: string;
  organizationId: string;
  projectId: string;
  body: string;
  createdBy: ActivityActor;
  /** Epoch milliseconds — the app-wide timestamp convention. */
  createdAt: number;
  updatedBy?: ActivityActor;
  updatedAt?: number;
}

// --- LEADS ---

export type LeadStage =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal_sent"
  | "won"
  | "lost"
  | "on_hold";

export type LeadSource =
  | "website"
  | "instagram"
  | "referral"
  | "manual"
  | "google"
  | "houzz"
  | "facebook"
  | "client"
  | "repeat_client"
  | "friend"
  | "family"
  | "other";

export type PropertyType =
  | "residential"
  | "commercial"
  | "hospitality"
  | "multifamily"
  | "retail"
  | "office"
  | "other";

export type BudgetRange =
  | "under_50k"
  | "50k_100k"
  | "100k_250k"
  | "250k_500k"
  | "500k_1m"
  | "over_1m";

export type DesiredTimeline =
  | "asap"
  | "1_3_months"
  | "3_6_months"
  | "6_12_months"
  | "12_plus_months"
  | "not_sure";

export interface Lead {
  uid: string;
  organizationId: string;

  // Contact type
  isCompany: boolean;
  company?: string;

  // Pipeline
  stage: LeadStage;

  // Contact info
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  phoneCountry?: string;

  // Address
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;

  // Source
  source?: LeadSource;
  sourceDetail?: string;
  // Verbatim message from the customer (e.g. website project form). Read-only —
  // not user-editable. Distinct from `notes`, which is the team's internal notes.
  customerComments?: string;

  // Project fit
  propertyType?: PropertyType;
  budgetRange?: BudgetRange;
  desiredTimeline?: DesiredTimeline;
  notes?: string;

  // Assignment
  assignedTo?: string; // user uid
  assignedAt?: number;

  // Conversion
  convertedClientId?: string;
  convertedAt?: number;
  convertedBy?: string; // user uid

  // Audit — createdBy/updatedBy store a frozen actor snapshot (user or system
  // origin, e.g. a website intake), so the originating system's identity travels
  // with the record. assignedTo/convertedBy stay live user uids.
  createdBy: ActivityActor;
  updatedBy: ActivityActor;

  createdAt: number;
  updatedAt: number;
  lastActivityAt?: number;

  // Stamped the first time anyone in the org opens the lead's detail page.
  // Unset ⇒ the lead is "new" (home-page New Leads metric). Not a form field.
  firstViewedAt?: number;
}

export type ProjectStatus =
  | "in_progress"
  | "on_hold"
  | "completed"
  | "cancelled";

/**
 * Persisted layout for the project items list-view grid. Keyed by column id;
 * `visibility` toggles columns, `sizing` holds user-resized pixel widths (only
 * columns the user has dragged appear here — the rest use proportional defaults).
 */
export interface ItemColumnLayout {
  visibility: Record<string, boolean>;
  sizing: Record<string, number>;
}

export interface Project {
  projectId: string;
  organizationId: string;
  clientId: string;
  /** Human-facing reference code (e.g. "ORG-PRO-0001"), minted server-side at creation. */
  projectCode?: string;
  /** Sequential org-level number behind projectCode. */
  projectNumber?: number;
  /** Copied from the selected client at creation (when that client has one). */
  clientCode?: string;
  name: string;
  address?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  sameAsMain?: boolean;
  status: ProjectStatus;
  /** The actual project budget in whole dollars. */
  budget?: number;

  // Lead-qualification data carried over when a project originates from a Lead → Client → Project
  // conversion. All optional: manually-created projects leave these unset.
  propertyType?: PropertyType;
  desiredTimeline?: DesiredTimeline;
  sourceLeadId?: string;
  /** Snapshot of the lead's budget range at conversion time (the qualifier, not the budget). */
  originalLeadBudgetRange?: BudgetRange;

  /** The project brief — free-form direction/goals shown on the Overview tab. */
  brief?: string;

  /**
   * Shared layout for the items list-view grid (column visibility + widths).
   * Lives on the project so the presentation/print intent is consistent for
   * every viewer, not per-browser. Absent until someone customizes it.
   */
  itemColumnLayout?: ItemColumnLayout;

  /**
   * The Dropbox folder linked to the project's imagery (Settings tab), stored
   * under the fixed key "imagery". Absent until a folder is linked.
   */
  imagerySets?: Record<string, ProjectImagerySet>;

  // Audit — all user references store UIDs only.
  createdBy: string; // user uid
  updatedBy: string; // user uid
  createdAt: number;
  updatedAt: number;
  lastActivityAt?: number;
}

/** A Dropbox folder linked to one of a project's image sets (Settings tab). */
export interface ProjectImagerySet {
  /** Dropbox `path_lower` — the stable id used for API calls. */
  path: string;
  /** Display name of the folder (Dropbox `path_display` / folder name). */
  name: string;
  linkedAt: number;
  /** UID of the user who linked it. */
  linkedBy: string;
}

/** Kind of file a project document reference points at. */
export type ProjectDocumentType = "contract";

/**
 * A project-facing reference to a stored file (the project "Files" tab). The
 * physical file lives once in Storage (`filePath`); this record just points at
 * it so the same artifact can surface in the project without duplication. Written
 * server-side only (admin SDK); read by org members via the client SDK.
 */
export interface ProjectDocument {
  documentId: string;
  organizationId: string;
  projectId: string;
  clientId?: string;
  type: ProjectDocumentType;
  /** The contract this document was produced from (when type === "contract"). */
  contractId?: string;
  /** Human reference code of the source contract (denormalized for display). */
  contractCode?: string;
  title: string;
  /** Human-friendly file name (also the download filename). */
  fileName: string;
  /** Authenticated app route that streams the file — never a public URL. */
  fileUrl: string;
  /** Canonical private Storage path (source of truth). */
  filePath: string;
  createdAt: number;
  /** UID of the creator, or "system" for auto-generated documents. */
  createdBy: string;
}

export interface Vendor {
  vendorId: string;
  organizationId: string;
  name: string;
  category?: string;
  description?: string;
  website?: string;
  accountNumber?: string;
  // International address model. `country` is an ISO 3166-1 alpha-2 code (e.g. "US").
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  /** Denormalized single-line address; always written on save. */
  formattedAddress?: string;
  // Deprecated US-only address fields — kept for back-compat reads of older docs.
  // `vendorToForm` falls back to these; new saves write the fields above instead.
  /** @deprecated use addressLine1 */
  street?: string;
  /** @deprecated use region */
  state?: string;
  /** @deprecated use postalCode */
  zip?: string;
  logoUrl?: string;
  logoPath?: string;
  heroImageUrl?: string;
  heroImagePath?: string;
  repName?: string;
  repEmail?: string;
  repPhone?: string;
  /** ISO 3166-1 alpha-2 code that drives phone formatting/validation; falls back to `country`. */
  repPhoneCountry?: string;
  notes?: string;
  instagram?: string;
  pinterest?: string;
  facebook?: string;
  youtube?: string;
  xTwitter?: string;
  createdAt: number;
}

export interface LibraryItem {
  itemId: string;
  organizationId: string;
  name: string;
  costType: "Product" | "Service" | "Labor" | "Shipping";
  category: string;
  subcategory?: string;
  vendorId?: string; // Links to Vendor
  sku?: string;
  description?: string;
  poDescription?: string;
  tags?: string[];
  unitType: "Each" | "SF" | "LF" | "Yard" | "Pieces";
  finishColor?: string;
  sourcingLink?: string;
  manufacturer?: string;
  materials?: string;
  dimensions?: string;
  internalNote?: string;
  taxable: boolean;
  unitCost: number;
  msrp?: number;
  markup: number; // percentage (e.g. 15 for 15%)
  sellingPrice: number;
  imageUrls?: string[];
  /** Subset of imageUrls that the user uploaded manually (always Firebase-hosted). Preserved across AI re-scrapes. */
  manualImageUrls?: string[];
  coverImageUrl?: string;
  coverImagePath?: string;
  images?: Array<{ url: string; path: string }>;
  updatedAt: number;
  aiMetadata?: AiMetadata;
}

export interface AiMetadata {
  sourceUrl?: string;
  importedAt?: number;
  model?: string;
  confidence?: Record<string, number>;
}

export interface ProposalLineItem {
  id: string; // unique reference inside proposal
  itemId?: string; // link to library if applicable
  name: string;
  description?: string;
  qty: number;
  unitType: string;
  unitCost: number;
  markup: number; // percentage
  unitPrice: number;
  room?: string; // Grouping section (e.g. "Bedroom")
  finishColor?: string;
  dimensions?: string;
  shipping: number;
  shippingMarkup: number; // percentage
  taxable: boolean;
  total: number;
  coverImageUrl?: string;
}

export interface Proposal {
  proposalId: string;
  organizationId: string;
  projectId: string;
  clientId: string;
  title: string;
  status: "Draft" | "Sent" | "Approved" | "Revised";
  lineItems: ProposalLineItem[];
  subtotal: number;
  taxRate: number; // e.g. 8.25 for 8.25%
  taxTotal: number;
  grandTotal: number;
  createdAt: number;
}

// --- CONTRACTS ---
// Flat top-level `contracts` collection (queried by organizationId). Drafts stay
// lightweight: only `values` + `scopeItems` are persisted as editable inputs —
// `resolved`/`pages`/`parties`/`projectSnapshot` are regenerated from the
// code-based template (contract-template.ts) + project/client/org data. When a
// contract is Sent, the fully-rendered document is frozen into `lockedSnapshot`,
// which is what the future client portal reads (never the live draft fields).

// Lifecycle: draft → sent → viewed → fully_executed. `expired` and `voided` are
// terminal off-ramps. `fully_executed` is reached only after the client signs and
// the company's authorized-on-send signature is applied (see the signing flow in
// `src/server/contract-signing.ts`).
export type ContractStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "fully_executed"
  | "expired"
  | "voided";

/**
 * A finer-grained lifecycle stage used only to render the status chain in the
 * contracts list. Unlike `ContractStatus` it distinguishes email delivery
 * (`delivered`/`delivery_failed`) which is proven by Brevo webhook events.
 */
export type ContractDisplayStage =
  | "draft"
  | "sent"
  | "delivered"
  | "viewed"
  | "executed"
  | "delivery_failed"
  | "expired"
  | "void";

/**
 * Denormalized display status kept on the contract doc so the list can render a
 * realtime status chain from a single field — it never aggregates the audit
 * subcollection. Maintained server-side (`src/server/contract-display.ts`)
 * whenever a contract lifecycle audit event is written.
 */
export interface ContractDisplay {
  stage: ContractDisplayStage;
  /** Pre-rendered chain, e.g. "Sent → Delivered → Awaiting View". */
  statusText: string;
  /** Sticky milestone: email delivery was confirmed at some point. */
  delivered: boolean;
  updatedAt: number;
}

/** The code-based template a contract was generated from. */
export type ContractTemplateKey = "interior-design-agreement";

export interface ContractScopeItem {
  id: string;
  value: string;
}

/** A rendered template page, frozen into a snapshot. */
export interface ContractPage {
  page: number;
  heading: string;
  body: string;
}

/** The two parties' denormalized contact details at snapshot time. */
export interface ContractParties {
  clientName: string;
  clientEmail: string;
  clientAddress: string;
  companyLegalName: string;
  companyEmail: string;
  companyAddress: string;
}

export interface ContractProjectSnapshot {
  name: string;
  address: string;
}

/** The fully-rendered, self-contained contract document (frozen at send time). */
export interface ContractSnapshot {
  templateKey: ContractTemplateKey;
  templateVersion: number;
  values: Record<string, string>;
  scopeItems: ContractScopeItem[];
  resolved: Record<string, string>;
  pages: ContractPage[];
  parties: ContractParties;
  projectSnapshot: ContractProjectSnapshot;
}

/** A `ContractSnapshot` stamped with who/when it was locked. */
export type LockedContractSnapshot = ContractSnapshot & {
  lockedAt: number;
  lockedBy: string;
};

/** The editable content fields supplied when creating a draft contract. */
export type ContractDraftInput = Pick<
  Contract,
  | "title"
  | "projectId"
  | "clientId"
  | "clientName"
  | "projectName"
  | "templateKey"
  | "templateVersion"
  | "values"
  | "scopeItems"
>;

export interface Contract {
  contractId: string;
  organizationId: string;

  title: string;
  status: ContractStatus;

  /**
   * Denormalized status-chain for the contracts list (display only). Maintained
   * server-side alongside the audit trail; the list reads `statusText` directly
   * and never aggregates audit events. Absent on legacy contracts (the UI falls
   * back to deriving a chain from `status`).
   */
  contractDisplay?: ContractDisplay;

  projectId: string;
  clientId: string;

  /** Human-facing reference code (e.g. "ORG-CN-0001"), minted server-side at draft creation. */
  contractCode?: string;
  /** Sequential org-level number behind contractCode. */
  contractNumber?: number;

  // Denormalized for list rendering without extra lookups.
  clientName: string;
  projectName: string;

  templateKey: ContractTemplateKey;
  templateVersion: number;

  // Editable draft inputs — the rest of the document is regenerated from these.
  values: Record<string, string>;
  scopeItems: ContractScopeItem[];

  // Frozen document; null until Sent, then read-only.
  lockedSnapshot: LockedContractSnapshot | null;

  // ─── Signing / execution (all set server-side on send & on signature) ───
  // A stable id minted on send that identifies this exact frozen version, and a
  // SHA-256 of the canonical `lockedSnapshot` JSON. Both are computed server-side
  // and re-checked at signing time so the client signs the exact version sent.
  contractVersionId?: string;
  contractHash?: string;

  // Email the signing link was sent to (server-determined; the signer's identity).
  sentToEmail?: string;

  // The company side is authorized when an authorized user sends the contract —
  // there is no separate company-approval step. Applied to the final document if
  // and when the client signs.
  companySignatureAuthorization?: CompanySignatureAuthorization;

  // The client's typed adopted signature + the consent they accepted. Set only
  // once, at signing, server-side.
  clientSignature?: ClientSignature;

  // Final executed PDF (contract body + both signatures + certificate page). This
  // is the canonical permanent record copy: generated once from the server-loaded
  // lockedSnapshot when the contract becomes fully executed, then never
  // regenerated for normal use. `executedFilePath` is a private Storage path;
  // `executedFileUrl` is an authenticated app route that streams it (never a
  // public URL). The same stored file is referenced from the project's documents
  // and attached to the post-sign confirmation email.
  executedFileUrl?: string;
  executedFilePath?: string;
  executedFileName?: string;
  executedFileGeneratedAt?: number;

  // @deprecated Use `executedFilePath`/`executedFileGeneratedAt`. Kept in sync
  // (same Storage path) so the token-gated portal download route reads cleanly.
  finalPdfPath?: string;
  finalPdfGeneratedAt?: number;

  // Audit — all user references store UIDs only; timestamps are epoch millis.
  createdBy: string;
  createdAt: number;
  updatedBy: string;
  updatedAt: number;

  sentBy?: string;
  sentAt?: number;

  // ── Signing link (denormalized from the active portalAccess) ───
  // The current signing link's expiry, copied onto the contract so the list can
  // show an "Expired" badge (and the lazy expiry sweep can find lapsed links)
  // without reading portalAccess. Updated on send and resend.
  signingLinkExpiresAt?: number;
  /** portalAccess id of the current/most-recent signing link — used to revoke on resend. */
  activeAccessTokenId?: string;

  viewedAt?: number;

  // Fully executed = client signed and the company signature was applied.
  executedAt?: number;

  voidedBy?: string;
  voidedAt?: number;
}

/**
 * The company's signature authorization, captured when an authorized user sends
 * the contract for signature. There is deliberately no separate approval step:
 * sending IS the authorization. The signer identity comes from the org-level
 * configured contract signer (`OrgSettings.contractSigner`), not the sender.
 */
export interface CompanySignatureAuthorization {
  authorizedAt: number;
  /** UID of the user who sent (and thereby authorized) the contract. */
  authorizedBy: string;
  signerName: string;
  signerTitle: string;
  signerEmail: string;
  signatureType: "authorized_on_send";
}

/**
 * The client's electronic signature. Typed adopted-name model: the binding force
 * is the accepted consent plus the audit trail (IP, UA, version hash, timestamp),
 * not a drawn image. Email/version/hash/timestamps are all server-determined —
 * never trusted from the client.
 */
export interface ClientSignature {
  /** The name the client typed to adopt as their signature. */
  signerName: string;
  /** Server-determined from `sentToEmail` — not accepted from the client. */
  signerEmail: string;
  signedAt: number;
  /** The exact consent text the client accepted, frozen for the record. */
  consentText: string;
  consentAcceptedAt: number;
  ipAddress?: string;
  userAgent?: string;
}

// ─── Contract audit trail ────────────────────────────────────────────────────
// Append-only events at `contracts/{contractId}/audit/{eventId}`. Each event is
// written once and never mutated, building an evidence chain: sent → email
// delivered → portal opened → consent accepted → signed → fully executed. Brevo
// delivery is evidence the email reached the address — NOT that the client read
// it; email event labels stay precise ("delivered"/"bounced"/"blocked"/"sent").

export type ContractAuditEventType =
  | "contract_sent"
  | "email_sent"
  | "email_delivered"
  | "email_bounced"
  | "email_blocked"
  | "portal_opened"
  | "electronic_signature_consent_accepted"
  | "contract_signed"
  | "contract_fully_executed"
  | "contract_resent"
  | "contract_link_expired"
  | "portal_access_revoked";

interface ContractAuditEventBase {
  /** Firestore doc id within the `audit` subcollection. */
  auditEventId: string;
  type: ContractAuditEventType;
  occurredAt: number;
}

export type ContractAuditEvent =
  | (ContractAuditEventBase & {
      type: "contract_sent";
      actorType: "company_user";
      actorId: string;
      recipientEmail: string;
      contractVersionId: string;
      contractHash: string;
    })
  | (ContractAuditEventBase & {
      type:
        | "email_sent"
        | "email_delivered"
        | "email_bounced"
        | "email_blocked";
      actorType: "system";
      provider: "brevo";
      recipientEmail: string;
      providerMessageId?: string;
      brevoEventId?: string;
      /**
       * The raw provider (Brevo) webhook payload, stringified, inlined on the
       * event so the whole audit trail lives in one place. Stored as a JSON
       * string (not a nested object) so an untrusted third-party shape can't
       * violate Firestore's structural rules and drop the normalized event.
       */
      rawProviderPayload?: string;
    })
  | (ContractAuditEventBase & {
      type: "portal_opened";
      actorType: "client";
      recipientEmail: string;
      accessTokenId: string;
      ipAddress?: string;
      userAgent?: string;
    })
  | (ContractAuditEventBase & {
      type: "electronic_signature_consent_accepted";
      actorType: "client";
      recipientEmail: string;
      accessTokenId: string;
      /** The exact consent language the client accepted. */
      consentText: string;
      ipAddress?: string;
      userAgent?: string;
    })
  | (ContractAuditEventBase & {
      type: "contract_signed";
      actorType: "client";
      signerName: string;
      signerEmail: string;
      accessTokenId: string;
      contractVersionId: string;
      contractHash: string;
      ipAddress?: string;
      userAgent?: string;
    })
  | (ContractAuditEventBase & {
      type: "contract_fully_executed";
      actorType: "system";
      contractVersionId: string;
      contractHash: string;
      finalPdfPath?: string;
    })
  | (ContractAuditEventBase & {
      type: "contract_resent";
      actorType: "company_user";
      actorId: string;
      recipientEmail: string;
      /** The freshly minted access link. */
      accessTokenId: string;
      /** The link this one replaces (revoked in the same action), if any. */
      previousAccessTokenId?: string;
    })
  | (ContractAuditEventBase & {
      type: "contract_link_expired";
      actorType: "system";
      /** The lapsed access link, when known. */
      accessTokenId?: string;
    })
  | (ContractAuditEventBase & {
      type: "portal_access_revoked";
      actorType: "company_user";
      actorId: string;
      accessTokenId: string;
      /** e.g. "replaced_by_resend". */
      reason: string;
    });

// ─── Client portal access ────────────────────────────────────────────────────
// A token-gated pointer to an existing contract, read by the unauthenticated
// client portal. The contract document is never moved — portalAccess just grants
// scoped, time-limited read access to it. The raw access token lives only in the
// emailed link; Firestore stores its SHA-256 hash (`tokenHash`) so a leaked DB
// row can't reconstruct a working link. All portal reads/writes go through the
// firebase-admin SDK (server-only); client-SDK access is denied by the rules.

export type PortalAccessType = "contract_signature";

export type PortalAccessStatus = "active" | "completed" | "expired" | "revoked";

/** How the client proves identity before viewing/signing a portal contract. */
export type PortalVerificationMethod = "phone_last4";

export interface PortalAccess {
  portalAccessId: string;
  type: PortalAccessType;
  organizationId: string;
  clientId: string;
  projectId: string;
  contractId: string;
  /** SHA-256 hex of the access token; the raw token is never stored. */
  tokenHash: string;
  status: PortalAccessStatus;
  createdAt: number;
  expiresAt: number;
  /** First time the client opened the linked contract. */
  viewedAt?: number;
  /** Last `contract_portal_opened` notification emit (1-hour dedupe; distinct from the 30-min audit dedupe). */
  portalViewNotifiedAt?: number;
  /** When the client accepted the e-signature/records consent. */
  consentAcceptedAt?: number;
  /** Set when the client completes signing — the link is then `completed`. */
  completedAt?: number;
  /** Set when an authorized user revokes the link (status → `revoked`). */
  revokedAt?: number;
  /** Why the link was revoked, e.g. "replaced_by_resend". */
  revokedReason?: string;
  /** Email the link was sent to (audit only — never shown in the portal). */
  sentToEmail: string;

  // ── Identity verification ──
  // The client must pass a verification step before the contract document is
  // rendered or signed. All fields are server-owned (client-SDK writes denied);
  // the expected secret is stored only as a salted hash, never as plain digits.
  /** Verification challenge type. Absent on legacy links (treated as unverified). */
  verificationMethod?: PortalVerificationMethod;
  /** SHA-256 of the client's phone last-4, salted by portalAccessId. Never plain digits. */
  verificationPhoneLast4Hash?: string;
  /** Set once verification passes — gates document view + signing. */
  verifiedAt?: number;
  /** Failed verification attempts; the link locks at 5. */
  failedVerificationAttempts?: number;
  /** Set when too many failed attempts lock the link. */
  verificationLockedAt?: number;
}

export interface DiagnosticParsedData {
  name?: string;
  sku?: string;
  category?: string;
  subcategory?: string;
  description?: string;
  finishColor?: string;
  manufacturer?: string;
  materials?: string;
  dimensions?: string;
  msrp?: number;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  repPhone?: string;
  repEmail?: string;
  logoUrl?: string;
  heroImageUrl?: string;
  coverImageUrl?: string;
  confidence?: Record<string, number>;
}

export interface DiagnosticRun {
  runId: string;
  type: "product" | "vendor";
  url: string;
  scrapedMarkdown: string;
  prompt: string;
  rawResponse: string;
  parsedData: DiagnosticParsedData;
  createdAt: number;
}

export interface OrganizationConfig {
  gaPropertyId?: string;
  gscSiteUrl?: string;
  googleAdsCustomerId?: string;
  googleDriveFolderId?: string;
  customGeminiKey?: string;
  aiMonthlyLimit?: number;
  aiUsedCount?: number;
  metaIntegration?: MetaIntegrationConfig;
  dropboxIntegration?: DropboxIntegrationConfig;
}

export interface CompanyAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  /** Denormalized single-line address; generated on save. */
  formatted?: string;
}

/** Organization-owned company profile used across proposals, invoices, reports, and branding. */
export interface CompanyProfile {
  displayName: string;
  legalName?: string;
  email?: string;
  phone?: string;
  /** ISO 3166-1 alpha-2 code that drives phone formatting/validation; falls back to the address country. */
  phoneCountry?: string;
  website?: string;
  address?: CompanyAddress;
}

export interface OrgBranding {
  primaryColor?: string;
  accentColor?: string;
  tertiaryColor?: string;
  logoLightUrl?: string;
  logoLightPath?: string;
  logoDarkUrl?: string;
  logoDarkPath?: string;
  iconLightUrl?: string;
  iconLightPath?: string;
  iconDarkUrl?: string;
  iconDarkPath?: string;
}

/**
 * The person authorized to sign contracts on the company's behalf. Their identity
 * is stamped into `companySignatureAuthorization` when a contract is sent, and
 * rendered in the company signature block of the final PDF.
 */
export interface ContractSignerConfig {
  name: string;
  title: string;
  email: string;
}

export interface OrgSettings {
  timezone?: string;
  currency?: string;
  measurementUnit?: "imperial" | "metric";
  defaultMarkupPercent?: number;
  defaultTaxRate?: number;
  proposalExpirationDays?: number;
  /** Days a sent contract's signing link stays valid. Defaults to 30 when unset. */
  contractExpirationDays?: number;
  contractSigner?: ContractSignerConfig;
}

export interface Organization {
  organizationId: string;
  name: string;
  adminEmail: string;
  status: "Active" | "Suspended";
  plan: "Starter" | "Pro" | "Enterprise";
  createdAt: number;
  config?: OrganizationConfig;
  companyProfile?: CompanyProfile;
  branding?: OrgBranding;
  settings?: OrgSettings;
}

export interface UserProfile {
  uid: string;
  fullName: string;
  displayName?: string;
  email: string;
  role: "SuperAdmin" | "Admin" | "Contributor";
  organizationId: string;
  status: "Active" | "Pending";
  joinedDate: string;
  lastActive: number;
  location?: string;
  phone?: string;
}

export interface ProjectRoom {
  roomId: string;
  projectId: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectRoomItem {
  roomItemId: string;
  roomId: string;
  projectId: string;
  libraryItemId?: string; // Reference to original library item
  organizationId: string;
  name: string;
  costType: "Product" | "Service" | "Labor" | "Shipping";
  category: string;
  subcategory?: string;
  vendorId?: string;
  sku?: string;
  description?: string;
  poDescription?: string;
  tags?: string[];
  unitType: "Each" | "SF" | "LF" | "Yard" | "Pieces";
  finishColor?: string;
  sourcingLink?: string;
  manufacturer?: string;
  materials?: string;
  dimensions?: string;
  internalNote?: string;
  taxable: boolean;
  unitCost: number;
  msrp?: number;
  markup: number;
  sellingPrice: number;
  imageUrls?: string[];
  manualImageUrls?: string[];
  coverImageUrl?: string;
  coverImagePath?: string;
  images?: Array<{ url: string; path: string }>;
  quantity: number;
  /** Manual drag-sort position within a section; lower sorts first. */
  sortOrder?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Trade {
  tradeId: string;
  organizationId: string;
  companyName: string;
  tradeType: string;
  tradeSubcategory?: string;
  contactFirstName?: string;
  contactLastName?: string;
  email?: string;
  phone?: string;
  website?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  licenseNumber?: string;
  licenseExpirationDate?: string;
  insurancePolicyNumber?: string;
  insuranceProvider?: string;
  insuranceExpirationDate?: string;
  createdAt: number;
}
