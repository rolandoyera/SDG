"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import {
  Calendar,
  DollarSign,
  Hammer,
  Loader2,
  Lock,
  MoreVertical,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  TooltipDropdownMenu,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  formatProjectAddress,
  getClient,
  getOrganization,
  getProjects,
  updateContract,
} from "@/lib/db";
import { createContract } from "@/server/contract-actions";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { canResendContract } from "@/lib/contract-resend";
import { COMPANY_SEND_AUTHORIZATION_TEXT } from "@/lib/contract-text";
import type { Client, Contract, ContractStatus, Project } from "@/lib/types";
import {
  resendContractSigningLink,
  sendContractForSignature,
} from "@/server/contract-signing";
import { cn, formatCurrency, formatCurrencyInput } from "@/lib/utils";

import { getClientName } from "../../clients/_components/client-name";
import {
  buildContractSnapshot,
  buildDraftContractPayload,
} from "./build-contract-payload";
import {
  boldText,
  CURRENCY_TOKENS,
  type FieldDef,
  FIELD_DEFS,
  formatClientAddress,
  formatCompanyAddress,
  formatPlainDate,
  SEGMENT_SPLIT_RE,
  TEMPLATE_PAGES,
  tokenName,
} from "./contract-template";
import HeaderBackLink from "../../_components/HeaderBackLink";

interface ScopeItem {
  id: string;
  value: string;
}

/** A client's display name — company name for orgs, full name otherwise. */
function clientDisplayName(client: Client): string {
  if (client.isCompany && client.company?.trim()) return client.company.trim();
  const { firstName, lastName } = getClientName(client);
  return `${firstName} ${lastName}`.trim();
}

/** Label/control pair. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/** Temporary helper copy shown under active contract inputs. */
function FieldExplainer({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p className="text-card-foreground text-sm leading-5 mt-2">{children}</p>
  );
}

/** Inline render of one line: swap {{TOKEN}} markers and **bold** runs. */
function renderSegments(text: string, resolved: Record<string, string>) {
  return text.split(SEGMENT_SPLIT_RE).map((part, i) => {
    const bold = boldText(part);
    if (bold) {
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: static template, stable order
        <span key={i} className="font-semibold text-foreground">
          {bold}
        </span>
      );
    }
    const name = tokenName(part);
    if (!name) {
      // Plain text segment.
      // biome-ignore lint/suspicious/noArrayIndexKey: static template, stable order
      return <span key={i}>{part}</span>;
    }
    const value = resolved[name];
    const def = FIELD_DEFS[name];
    if (value) {
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: static template, stable order
        <span key={i} className="font-black text-foreground">
          {value}
        </span>
      );
    }
    return (
      <span
        // biome-ignore lint/suspicious/noArrayIndexKey: static template, stable order
        key={i}
        className="contract-placeholder rounded bg-yellow-100 px-1.5 py-0.5 font-semibold text-[13px] text-yellow-800"
      >
        {def?.label ?? name}
      </span>
    );
  });
}

/** True for a line that is a single all-caps bold run — a centered heading. */
function isHeadingLine(line: string): boolean {
  const inner = boldText(line.trim());
  return inner !== null && inner === inner.toUpperCase() && /[A-Z]/.test(inner);
}

/** Render a page body line-by-line so all-caps bold headings can center. */
function DocumentBody({
  body,
  resolved,
}: {
  body: string;
  resolved: Record<string, string>;
}) {
  return (
    <div className="font-contract text-[15px] text-foreground/70 leading-7">
      {body.split("\n").map((line, i) => (
        <p
          // biome-ignore lint/suspicious/noArrayIndexKey: static template, stable order
          key={i}
          className={`whitespace-pre-wrap${isHeadingLine(line) ? " text-center" : ""}`}
        >
          {line ? renderSegments(line, resolved) : " "}
        </p>
      ))}
    </div>
  );
}

/**
 * Whole-dollar currency input: a $ addon plus a focus bridge — thousands-grouped
 * when idle, raw digits while typing — storing the raw number string.
 */
function CurrencyField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState("");
  const numeric = value ? Number(value) : undefined;
  const formatted = formatCurrencyInput(numeric, { noDecimals: true });
  return (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <DollarSign />
      </InputGroupAddon>
      <InputGroupInput
        type="text"
        inputMode="numeric"
        placeholder="0"
        value={focused ? text : formatted}
        onFocus={() => {
          setFocused(true);
          setText(formatted);
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9]/g, "");
          onChange(raw);
          setText(raw === "" ? "" : Number(raw).toLocaleString("en-US"));
        }}
      />
    </InputGroup>
  );
}

/** The right input control for a page-scoped field. */
function PageFieldInput({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: string;
  onChange: (value: string) => void;
}) {
  if (def.type === "textarea") {
    return (
      <Textarea
        placeholder={def.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (def.type === "currency") {
    return <CurrencyField value={value} onChange={onChange} />;
  }
  if (def.token === "PROJECT_DURATION_MONTHS") {
    return (
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <Calendar />
        </InputGroupAddon>
        <InputGroupInput
          inputMode="numeric"
          placeholder={def.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </InputGroup>
    );
  }
  return (
    <Input
      placeholder={def.placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Exhibit A scope-of-work editor: a labelled list with add + remove controls. */
function ScopeListField({
  label,
  placeholder,
  explainer,
  items,
  onAdd,
  onRemove,
  onChange,
}: {
  label: string;
  placeholder?: string;
  explainer?: string;
  items: ScopeItem[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onChange: (id: string, value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <div key={item.id} className="flex items-start gap-2">
            <div className="flex flex-1 flex-col gap-2">
              <InputGroup>
                <InputGroupAddon align="inline-start">
                  <Hammer />
                </InputGroupAddon>
                <InputGroupInput
                  placeholder={placeholder ?? `Item ${i + 1}`}
                  value={item.value}
                  onChange={(e) => onChange(item.id, e.target.value)}
                />
              </InputGroup>
              <FieldExplainer>{explainer}</FieldExplainer>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => onRemove(item.id)}
            >
              <Trash2 className="size-4" />
              <span className="sr-only">Remove item</span>
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={onAdd}
      >
        <Plus className="size-4" />
        Add item
      </Button>
    </div>
  );
}

/**
 * Stable key of the editable draft state for dirty-tracking. Scope-item ids are
 * random so only their values count; value keys are sorted for order-stability.
 */
function draftKey(
  values: Record<string, string>,
  scopeItems: ScopeItem[],
  projectId: string,
): string {
  const v = Object.keys(values)
    .sort()
    .map((k) => `${k}=${values[k]}`)
    .join("|");
  const s = scopeItems.map((item) => item.value).join("|");
  return `${projectId}~${v}~${s}`;
}

/** Today as a `YYYY-MM-DD` string in local time (for the date input default). */
function todayIso(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/** Pre-filled defaults — all editable. */
const DEFAULT_VALUES: Record<string, string> = {
  EFFECTIVE_DATE: todayIso(),
  BILLABLE_RATE: "450",
  STYLING_FEE: "7500",
  MONTHLY_ADMINISTRATION_FEE: "3000",
};

/** When `contract` is passed the builder edits that existing draft; otherwise it
 * creates a new one. `initialProjectId` preselects a project for a fresh
 * contract (e.g. opened from a project's Files tab); ignored when editing. */
export function ContractBuilder({
  contract,
  initialProjectId,
}: { contract?: Contract; initialProjectId?: string } = {}) {
  const { organizationId, uid } = useAuth();
  const [values, setValues] = useState<Record<string, string>>(() =>
    contract ? { ...contract.values } : { ...DEFAULT_VALUES },
  );
  const [activePage, setActivePage] = useState(1);
  // Projects (and their client) are read from the CRM — no inline creation here.
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(
    contract?.projectId ?? initialProjectId ?? "",
  );
  const [pendingProject, setPendingProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  // Persistence state. `contractId` is set after the first save (or seeded when
  // editing) so subsequent Save Draft calls update the same document. Once
  // `status` leaves "draft" the contract is locked (its snapshot is frozen) and
  // editable saves are blocked.
  const router = useRouter();
  const [contractId, setContractId] = useState<string | null>(
    contract?.contractId ?? null,
  );
  const [status, setStatus] = useState<ContractStatus>(
    contract?.status ?? "draft",
  );
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [resending, setResending] = useState(false);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  // Snapshot of the last-persisted editable state; current state differing from
  // it means there are unsaved changes (drives the leave-without-saving guard).
  const savedKeyRef = useRef(
    draftKey(
      contract ? contract.values : DEFAULT_VALUES,
      contract?.scopeItems.length ? contract.scopeItems : [],
      contract?.projectId ?? initialProjectId ?? "",
    ),
  );
  // Firm-side values read from the org's company profile (legal name + address +
  // email) and branding (dark logo shown atop the document).
  const [company, setCompany] = useState({
    legalName: "",
    address: "",
    email: "",
    logoDarkUrl: "",
  });
  // Exhibit A scope of work — a dynamic, add/remove list (starts with one row,
  // or the saved rows when editing).
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>(() =>
    contract?.scopeItems.length
      ? contract.scopeItems.map((item) => ({ ...item }))
      : [{ id: crypto.randomUUID(), value: "" }],
  );

  const addScopeItem = () =>
    setScopeItems((prev) => [...prev, { id: crypto.randomUUID(), value: "" }]);
  const removeScopeItem = (id: string) =>
    setScopeItems((prev) => prev.filter((item) => item.id !== id));
  const updateScopeItem = (id: string, value: string) =>
    setScopeItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, value } : item)),
    );

  const pageEls = useRef<Map<number, HTMLElement>>(new Map());

  // Pull the firm's legal identity from the org company profile.
  useEffect(() => {
    if (!organizationId) return;
    let active = true;
    void getOrganization(organizationId)
      .then((org) => {
        if (!active || !org) return;
        const cp = org.companyProfile;
        setCompany({
          legalName: cp?.legalName ?? cp?.displayName ?? "",
          address: formatCompanyAddress(cp?.address),
          email: cp?.email ?? "",
          logoDarkUrl: org.branding?.logoDarkUrl ?? "",
        });
      })
      .catch(() => {
        // Non-fatal: firm fields fall back to empty placeholders.
      });
    return () => {
      active = false;
    };
  }, [organizationId]);

  // Pull the org's projects for the picker.
  useEffect(() => {
    if (!organizationId) return;
    let active = true;
    void getProjects(organizationId)
      .then((list) => {
        if (active) setProjects(list);
      })
      .catch(() => {
        // Non-fatal: the picker just stays empty.
      });
    return () => {
      active = false;
    };
  }, [organizationId]);

  const selectedProject = projects.find(
    (p) => p.projectId === selectedProjectId,
  );

  const handleProjectChange = (project: Project | null) => {
    if (isLocked || project?.projectId === selectedProjectId) return;
    if (contractId && project) {
      setPendingProject(project);
      return;
    }
    setSelectedProjectId(project?.projectId ?? "");
  };

  const confirmProjectChange = () => {
    if (!pendingProject) return;
    setSelectedProjectId(pendingProject.projectId);
    setPendingProject(null);
  };

  // Load the selected project's client (the doc needs the client name/contact).
  useEffect(() => {
    if (!selectedProject) {
      setClient(null);
      return;
    }
    let active = true;
    void getClient(selectedProject.clientId)
      .then((c) => {
        if (active) setClient(c);
      })
      .catch(() => {
        if (active) setClient(null);
      });
    return () => {
      active = false;
    };
  }, [selectedProject]);

  const setValue = (token: string, value: string) =>
    setValues((prev) => ({ ...prev, [token]: value }));

  // Track which page is centered in the viewport to drive the left panel.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              Math.abs(a.boundingClientRect.top) -
              Math.abs(b.boundingClientRect.top),
          );
        const top = visible[0];
        if (top) {
          setActivePage(Number(top.target.getAttribute("data-page")));
        }
      },
      // A thin band near the upper third — the page crossing it is "active".
      { rootMargin: "-35% 0px -55% 0px", threshold: 0 },
    );
    for (const el of pageEls.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Resolve raw inputs into the display values rendered in the document.
  const resolved = useMemo(() => {
    const r: Record<string, string> = {};
    for (const def of Object.values(FIELD_DEFS)) {
      r[def.token] = values[def.token] ?? "";
    }
    // Project + client are pulled from the CRM record (read-only here).
    r.PROJECT_ADDRESS = selectedProject
      ? (selectedProject.address ?? formatProjectAddress(selectedProject))
      : "";
    r.CLIENT_NAME = client ? clientDisplayName(client) : "";
    r.CLIENT_ADDRESS = client ? formatClientAddress(client) : "";
    r.CLIENT_EMAIL = client?.email ?? "";
    r.COMPANY_LEGAL_NAME = company.legalName;
    r.COMPANY_ADDRESS = company.address;
    r.COMPANY_EMAIL = company.email;
    r.EFFECTIVE_DATE = formatPlainDate(values.EFFECTIVE_DATE);
    for (const t of CURRENCY_TOKENS) {
      r[t] = values[t]
        ? formatCurrency(Number(values[t]) || 0, { noDecimals: true })
        : "";
    }
    // Exhibit A bullet list — one "•  item" line per filled scope row.
    r.SCOPE_ITEMS = scopeItems
      .map((item) => item.value.trim())
      .filter(Boolean)
      .map((text) => `•  ${text}`)
      .join("\n");
    return r;
  }, [values, selectedProject, client, company, scopeItems]);

  const activeFields = Object.values(FIELD_DEFS).filter(
    (d) => d.scope === "page" && d.page === activePage && d.type !== "auto",
  );
  const totalPages = TEMPLATE_PAGES.length;

  // Required fields still empty.
  const missingFields = useMemo(
    () =>
      Object.values(FIELD_DEFS)
        .filter((def) => !def.optional && !(resolved[def.token] ?? "").trim())
        .map((def) => ({ label: def.label, page: def.page ?? 1 }))
        .sort((a, b) => a.page - b.page),
    [resolved],
  );

  // Gate send/print on a complete document; otherwise jump to the first gap.
  const guard = (actionLabel: string, run: () => void) => {
    if (missingFields.length > 0) {
      const first = missingFields[0];
      const count = missingFields.length;
      toast.error(`Complete all fields before you ${actionLabel}.`, {
        description: `${count} field${count > 1 ? "s" : ""} still need attention, starting with “${first.label}”.`,
      });
      setActivePage(first.page);
      pageEls.current
        .get(first.page)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    run();
  };

  // A locked contract (sent/viewed/signed/void) is read-only — no more saves.
  const isLocked = status !== "draft";

  // Unsaved-changes guard: only meaningful while the draft is still editable.
  const hasUnsavedChanges =
    !isLocked &&
    draftKey(values, scopeItems, selectedProjectId) !== savedKeyRef.current;

  // Warns (and intercepts in-app navigation) before leaving with unsaved edits.
  // "Save & leave" persists the draft, then the hook navigates.
  const { dialog: leaveDialog } = useUnsavedChangesGuard({
    when: hasUnsavedChanges,
    title: "Save your draft?",
    description:
      "You have unsaved changes to this contract. Save them as a draft before you leave, or discard them.",
    onSave: async () => {
      try {
        const id = await persistDraft();
        if (!id) return false; // persistDraft toasted why; keep the dialog open
        savedKeyRef.current = draftKey(values, scopeItems, selectedProjectId);
        toast.success("Draft saved.");
        return true;
      } catch (error) {
        console.error("Failed to save contract draft:", error);
        toast.error("Couldn't save the draft. Please try again.");
        return false;
      }
    },
  });

  /**
   * Persist the editable draft. Drafts may be incomplete, so this skips the
   * required-field guard — it only needs an org, a user, and a selected
   * project/client. Creates on first save, then updates the same document.
   * Returns the contractId on success, or null on failure / missing prereqs.
   */
  const persistDraft = async (): Promise<string | null> => {
    if (!organizationId || !uid || !selectedProject || !client) {
      toast.error("Pick a project before saving.");
      return null;
    }
    const payload = buildDraftContractPayload({
      selectedProject,
      client,
      values,
      scopeItems,
      resolved,
    });
    if (contractId) {
      await updateContract(contractId, uid, payload);
      return contractId;
    }
    const newId = await createContract(uid, payload);
    setContractId(newId);
    return newId;
  };

  const handleSaveDraft = async () => {
    if (isLocked || saving) return;
    setSaving(true);
    try {
      const id = await persistDraft();
      if (id) {
        savedKeyRef.current = draftKey(values, scopeItems, selectedProjectId);
        toast.success("Draft saved.");
      }
    } catch (error) {
      console.error("Failed to save contract draft:", error);
      toast.error("Couldn't save the draft. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const runSend = async () => {
    if (!selectedProject || !uid) return;
    setSending(true);
    try {
      const id = await persistDraft();
      if (!id) return;
      const snapshot = buildContractSnapshot({
        selectedProject,
        values,
        scopeItems,
        resolved,
      });
      // Server freezes the version, authorizes the company signature, mints the
      // signing link, and emails it. The server determines version/hash/recipient.
      const result = await sendContractForSignature({
        contractId: id,
        userId: uid,
        snapshot,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSendConfirmOpen(false);
      setStatus("sent");
      toast.success(
        result.emailSent
          ? "Contract sent to the client for signature."
          : "Contract sent. Email delivery is not configured — share the link manually.",
      );
      // The contract is now locked; land the user back on the contracts list.
      router.push("/dashboard/contracts");
    } catch (error) {
      console.error("Failed to send contract:", error);
      toast.error("Couldn't send the contract. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleSendContract = () => {
    if (isLocked || sending) return;
    // Send requires a complete document; then confirm the company authorization.
    guard("send", () => {
      setSendConfirmOpen(true);
    });
  };

  // Resend replaces the signing link (the contract itself is untouched). Allowed
  // for a sent/viewed/expired contract — not an executed or voided one. Uses the
  // shared `canResendContract` rule so the builder, the contracts list, the Files
  // tab, and the server guard can't drift.
  const canResend = !!contract && canResendContract(contract);

  const handleResend = async () => {
    if (!contractId || !uid || resending) return;
    setResending(true);
    try {
      const result = await resendContractSigningLink({
        contractId,
        userId: uid,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setStatus("sent");
      toast.success(
        result.emailSent
          ? "A fresh signing link was sent to the client."
          : "New signing link created. Email delivery isn't configured — share the link manually.",
      );
    } catch (error) {
      console.error("Failed to resend signing link:", error);
      toast.error("Couldn't resend the signing link. Please try again.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6 lg:h-[calc(100svh-var(--dashboard-header-height)-3rem)]">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between lg:shrink-0">
        <div className="flex flex-col gap-1">
          <HeaderBackLink href="/dashboard/contracts" />
          <h1 className="font-heading font-semibold text-2xl">
            {contract ? "Edit Contract" : "New Contract"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isLocked
              ? "This contract is locked — its sent copy can no longer be edited."
              : "Fill in the highlighted fields — the document updates as you go."}
          </p>
        </div>
        <div className="sm:self-start">
          <TooltipDropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                disabled={saving || sending || resending}
              >
                {saving || sending || resending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <MoreVertical className="size-4" />
                )}
                <span className="sr-only">Contract actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={handleSendContract}
                  disabled={isLocked || sending}
                >
                  <Send className="size-4" />
                  Send
                </DropdownMenuItem>
                {canResend && (
                  <DropdownMenuItem
                    onClick={() => {
                      void handleResend();
                    }}
                    disabled={resending}
                  >
                    <RefreshCw className="size-4" />
                    Resend signing link
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => {
                    void handleSaveDraft();
                  }}
                  disabled={isLocked || saving}
                >
                  <Save className="size-4" />
                  Save Draft
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => guard("print", () => window.print())}
                >
                  <Printer className="size-4" />
                  Print / PDF
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </TooltipDropdownMenu>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Contract Details (pinned globals + active-page fields) */}
        <Card variant="panel" className="lg:min-h-0">
          <CardHeader>
            <CardTitle>Contract Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 lg:min-h-0 lg:flex-1">
            {isLocked ? (
              <div className="flex flex-1 items-center justify-center lg:min-h-0">
                <p className="rounded border border-border border-dashed bg-muted/20 p-6 text-center text-muted-foreground text-sm">
                  This contract has been sent and is no longer editable.
                </p>
              </div>
            ) : (
              <>
                {/* Pinned global fields — always visible (frozen zone) */}
                <div className="grid grid-cols-3 items-start gap-4 lg:shrink-0">
                  <div className="flex flex-col gap-4">
                    <Field label="Project">
                      <Combobox
                        value={selectedProject ?? null}
                        onValueChange={handleProjectChange}
                        items={[...projects].sort((a, b) =>
                          a.name.localeCompare(b.name),
                        )}
                        disabled={isLocked}
                        filter={(item: Project, inputValue: string) =>
                          item.name
                            .toLowerCase()
                            .includes(inputValue.toLowerCase())
                        }
                      >
                        <ComboboxTrigger
                          render={
                            <button
                              type="button"
                              className={cn(
                                "flex h-10 w-full items-center justify-between whitespace-nowrap rounded border border-input bg-transparent px-2.5 text-sm outline-none transition-colors",
                                "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                                "dark:bg-input/30",
                                isLocked &&
                                  "cursor-not-allowed bg-muted/40 text-muted-foreground opacity-70",
                                !selectedProject && "text-muted-foreground",
                              )}
                              disabled={isLocked}
                            >
                              {selectedProject
                                ? selectedProject.name
                                : projects.length
                                  ? "Select a project"
                                  : "No projects in the CRM yet"}
                            </button>
                          }
                        />
                        <ComboboxContent>
                          <ComboboxInput
                            showTrigger={false}
                            placeholder="Search projects..."
                          />
                          <ComboboxEmpty>No project found.</ComboboxEmpty>
                          <ComboboxList>
                            {(item: Project) => (
                              <ComboboxItem key={item.projectId} value={item}>
                                {item.name}
                              </ComboboxItem>
                            )}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
                    </Field>

                    {selectedProject && (
                      <div className="flex flex-col gap-0.5 text-muted-foreground text-sm">
                        {resolved.CLIENT_NAME && (
                          <span className="text-foreground">
                            {resolved.CLIENT_NAME}
                          </span>
                        )}
                        {resolved.PROJECT_ADDRESS && (
                          <span>{resolved.PROJECT_ADDRESS}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label>Firm Legal Name</Label>
                    <div className="flex h-10 items-center gap-2 rounded border border-input  bg-muted/40 px-3 text-muted-foreground text-sm">
                      <span className="truncate">
                        {company.legalName || "Not set in Company Profile"}
                      </span>
                      <span className="ml-auto shrink-0">
                        <Lock className="size-3.5 text-muted-foreground/50" />
                      </span>
                    </div>
                  </div>

                  <Field label="Effective Date">
                    <Input
                      type="date"
                      value={values.EFFECTIVE_DATE ?? ""}
                      onChange={(e) =>
                        setValue("EFFECTIVE_DATE", e.target.value)
                      }
                    />
                  </Field>
                </div>

                <Separator className="lg:shrink-0" />

                {/* Active-page fields — swap as the user scrolls (scrolling zone) */}
                <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
                  <div className="flex items-center justify-between lg:shrink-0">
                    <span className="font-semibold text-foreground text-sm">
                      Fields to Populate
                    </span>
                    <span className="text-muted-foreground text-xs">
                      Page {activePage} of {totalPages}
                    </span>
                  </div>

                  <div className="lg:min-h-0 lg:flex-1 lg:pb-1">
                    {activeFields.length > 0 ? (
                      <div className="flex flex-wrap gap-4">
                        {activeFields.map((def) =>
                          def.type === "list" ? (
                            <div key={def.token} className="basis-full">
                              <ScopeListField
                                label={def.label}
                                placeholder={def.placeholder}
                                explainer={def.explainer}
                                items={scopeItems}
                                onAdd={addScopeItem}
                                onRemove={removeScopeItem}
                                onChange={updateScopeItem}
                              />
                            </div>
                          ) : (
                            <div
                              key={def.token}
                              className={
                                def.type === "textarea"
                                  ? "basis-full"
                                  : "min-w-40 basis-[calc(50%-0.5rem)]"
                              }
                            >
                              <Field label={def.label}>
                                <PageFieldInput
                                  def={def}
                                  value={values[def.token] ?? ""}
                                  onChange={(v) => setValue(def.token, v)}
                                />
                                <FieldExplainer>{def.explainer}</FieldExplainer>
                              </Field>
                            </div>
                          ),
                        )}
                      </div>
                    ) : (
                      <p className="rounded border border-border border-dashed bg-muted/20 p-4 text-center text-muted-foreground text-sm">
                        No fields on this page — keep scrolling for more fields.
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Right: the paged document (scroll area on screen, A4 sheets on print) */}
        <div className="contract-print-area flex flex-col gap-6 lg:min-h-0 lg:overflow-y-auto lg:pr-1 lg:pb-[55vh]">
          {TEMPLATE_PAGES.map((page) => (
            <div
              key={page.page}
              data-page={page.page}
              ref={(el) => {
                if (el) pageEls.current.set(page.page, el);
                else pageEls.current.delete(page.page);
              }}
              className={`contract-sheet relative scroll-mt-6 rounded border bg-background p-8 transition-colors sm:p-10 ${
                page.page === activePage
                  ? "border-primary/40 shadow-lg ring-1 ring-primary/20"
                  : "border-border"
              }`}
            >
              {/* Editing-only page marker — hidden when printing. */}
              <span className="contract-page-meta absolute top-3 right-4 text-muted-foreground/70 text-xs">
                {page.page} / {totalPages}
              </span>
              {/* Firm dark logo as the document letterhead (page 1 only). */}
              {page.page === 1 && company.logoDarkUrl && (
                // biome-ignore lint/performance/noImgElement: document letterhead uses a dynamic branding URL.
                <img
                  src={company.logoDarkUrl}
                  alt={company.legalName || "Firm logo"}
                  className="mx-auto mb-8 h-32 w-auto object-contain"
                />
              )}
              <DocumentBody body={page.body} resolved={resolved} />
            </div>
          ))}
        </div>
      </div>

      {/* Unsaved-changes leave dialog + nav interception (shared hook). */}
      {leaveDialog}
      <AlertDialog
        open={!!pendingProject}
        onOpenChange={(open) => {
          if (!open) setPendingProject(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Change this contract's project?</AlertDialogTitle>
            <AlertDialogDescription>
              Changing the project will update the client, project address, and
              project name used in the preview. Manually entered fields,
              pricing, and scope items will be kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmProjectChange}>
              Change Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send confirmation — sending IS the company's signature authorization. */}
      <AlertDialog open={sendConfirmOpen} onOpenChange={setSendConfirmOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send this contract for signature?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {COMPANY_SEND_AUTHORIZATION_TEXT}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void runSend();
              }}
              disabled={sending}
            >
              {sending ? "Sending…" : "Send Contract"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
