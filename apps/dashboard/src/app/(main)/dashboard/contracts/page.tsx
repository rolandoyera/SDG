"use client";
"use no memo";

import { type ReactNode, useEffect, useState } from "react";

import Link from "next/link";

import type { Column, ColumnDef } from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDownIcon,
  Eye,
  FileText,
  ListFilter,
  Loader2,
  MoreVertical,
  Plus,
  Send,
} from "lucide-react";
import {
  type ColumnFiltersState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { toast } from "sonner";

import { LoadingState } from "@/components/loading-state";
import { FadeIn } from "@/components/fade-in";
import { useAuth } from "@/components/auth-context";
import { ContractStatusChain } from "@/app/(main)/dashboard/contracts/_components/contract-status-chain";
import { useResendSigningLink } from "@/app/(main)/dashboard/contracts/_components/use-resend-signing-link";
import PageHeader from "@/components/page-header";
import { PageTitle } from "@/components/page-title-updater";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  TooltipDropdownMenu,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { TanTable } from "@/components/ui/tan-table";
import { canResendContract } from "@/lib/contract-resend";
import { getOrganizationUsers } from "@/lib/db";
import { db } from "@/lib/firebase";
import { expireLapsedContractLinks } from "@/server/contract-signing";
import type { Contract, ContractStatus } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

/** "Jun 18, 2026" from an epoch-ms timestamp. */
function formatUpdated(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Project duration in months (a raw text value), e.g. "6 months". */
function durationLabel(contract: Contract): string {
  const raw = contract.values.PROJECT_DURATION_MONTHS?.trim();
  return raw ? `${raw} months` : "—";
}

/** The contract's headline figure is the initial retainer (a raw number string). */
function retainerLabel(contract: Contract): string {
  const raw = contract.values.RETAINER_FEE;
  const amount = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(amount)
    ? formatCurrency(amount, { noDecimals: true })
    : "—";
}

const statusOptions = [
  "all",
  "draft",
  "sent",
  "viewed",
  "fully_executed",
  "expired",
  "voided",
] as const satisfies readonly ("all" | ContractStatus)[];

function SortableHeader({
  column,
  children,
  align = "left",
}: {
  column: Column<Contract, unknown>;
  children: ReactNode;
  align?: "left" | "right";
}) {
  const sorted = column.getIsSorted();
  const Icon =
    sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <Button
      variant="ghost"
      onClick={() => column.toggleSorting(sorted === "asc")}
      className={cn(
        "-mx-3 h-8 gap-1.5 px-3 font-medium text-foreground text-sm hover:bg-transparent",
        align === "right" && "flex-row-reverse",
      )}
    >
      {children}
      <Icon
        className={cn(
          "size-3.5",
          sorted ? "text-foreground" : "text-muted-foreground/60",
        )}
      />
    </Button>
  );
}

export default function ContractsPage() {
  const { organizationId, uid, loading: authLoading } = useAuth();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  useEffect(() => {
    if (authLoading || !organizationId) return;
    const orgId = organizationId; // stable string dep; profile identity churns

    // Lazy expiry sweep (no cron): flip any lapsed signing links to `expired`
    // server-side; the realtime listener below then reflects the change. The
    // render-time badge overlay already shows Expired before this resolves.
    void expireLapsedContractLinks(orgId);

    // Org user names rarely change within a session — fetch once.
    void getOrganizationUsers(orgId)
      .then((users) =>
        setUserNames(Object.fromEntries(users.map((u) => [u.uid, u.fullName]))),
      )
      .catch((error) =>
        console.error("Failed to load organization users:", error),
      );

    // Realtime contracts so the Status chain updates as delivery/view/sign
    // events land (the server keeps `contractDisplay` in sync with the audit
    // trail). Sort newest-first in memory to avoid a composite index, matching
    // the one-time `getContracts` it replaces.
    const contractsQuery = query(
      collection(db, "contracts"),
      where("organizationId", "==", orgId),
    );
    const unsubscribe = onSnapshot(
      contractsQuery,
      (snapshot) => {
        const list = snapshot.docs.map((d) => d.data() as Contract);
        setContracts(list.sort((a, b) => b.updatedAt - a.updatedAt));
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load contracts:", error);
        toast.error("Failed to fetch contracts from database.");
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [organizationId, authLoading]);

  /** Resolve a contract's editor UID to a name, showing "You" for the signed-in user. */
  const updatedByLabel = (contract: Contract): string => {
    if (contract.updatedBy === uid) return "You";
    return userNames[contract.updatedBy] ?? "—";
  };

  const { resendingId, resend } = useResendSigningLink(uid);

  const columns: ColumnDef<Contract>[] = [
    {
      accessorKey: "title",
      header: ({ column }) => (
        <SortableHeader column={column}>Contract</SortableHeader>
      ),
      cell: ({ row }) => (
        <Link
          href={`/dashboard/contracts/${row.original.contractId}`}
          className="font-medium text-foreground text-sm hover:text-primary hover:underline"
        >
          {row.original.title}
        </Link>
      ),
    },
    {
      accessorKey: "clientName",
      header: ({ column }) => (
        <SortableHeader column={column}>Client</SortableHeader>
      ),
      cell: ({ row }) => (
        <div className="text-sm">{row.original.clientName}</div>
      ),
    },
    {
      accessorKey: "projectName",
      header: ({ column }) => (
        <SortableHeader column={column}>Project</SortableHeader>
      ),
      cell: ({ row }) => (
        <div className="text-sm">{row.original.projectName}</div>
      ),
    },
    {
      id: "duration",
      header: ({ column }) => (
        <SortableHeader column={column}>Duration</SortableHeader>
      ),
      accessorFn: (contract) => {
        const raw = contract.values.PROJECT_DURATION_MONTHS?.trim();
        return raw ? Number(raw) : Number.NaN;
      },
      cell: ({ row }) => (
        <div className="text-sm">{durationLabel(row.original)}</div>
      ),
      sortingFn: (a, b) => {
        const aValue = Number(a.getValue("duration"));
        const bValue = Number(b.getValue("duration"));

        if (!Number.isFinite(aValue) && !Number.isFinite(bValue)) return 0;
        if (!Number.isFinite(aValue)) return 1;
        if (!Number.isFinite(bValue)) return -1;
        return aValue - bValue;
      },
    },
    {
      id: "retainer",
      header: ({ column }) => (
        <SortableHeader column={column}>Retainer</SortableHeader>
      ),
      accessorFn: (contract) => {
        const amount = Number(contract.values.RETAINER_FEE);
        return Number.isFinite(amount) ? amount : Number.NaN;
      },
      cell: ({ row }) => (
        <div className="font-mono text-sm text-foreground/80">
          {retainerLabel(row.original)}
        </div>
      ),
      sortingFn: (a, b) => {
        const aValue = Number(a.getValue("retainer"));
        const bValue = Number(b.getValue("retainer"));

        if (!Number.isFinite(aValue) && !Number.isFinite(bValue)) return 0;
        if (!Number.isFinite(aValue)) return 1;
        if (!Number.isFinite(bValue)) return -1;
        return aValue - bValue;
      },
    },
    {
      // Display-only status chain. Keeps `accessorKey: "status"` + `filterFn`
      // so the Status filter dropdown still works off the coarse status enum,
      // but renders the realtime chain text and is not sortable.
      accessorKey: "status",
      header: () => <span className="text-foreground text-sm">Status</span>,
      cell: ({ row }) => <ContractStatusChain contract={row.original} />,
      enableSorting: false,
      filterFn: "equalsString",
    },
    {
      id: "updatedByName",
      header: ({ column }) => (
        <SortableHeader column={column}>Updated by</SortableHeader>
      ),
      accessorFn: updatedByLabel,
      cell: ({ row }) => (
        <div className="text-sm">{updatedByLabel(row.original)}</div>
      ),
    },
    {
      accessorKey: "updatedAt",
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column} align="right">
            Updated
          </SortableHeader>
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right text-sm">
          {formatUpdated(row.original.updatedAt)}
        </div>
      ),
    },
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const contract = row.original;
        const resending = resendingId === contract.contractId;
        return (
          <div className="flex justify-end">
            <TooltipDropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8">
                  <MoreVertical className="size-4" />
                  <span className="sr-only">Contract actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                {contract.status === "fully_executed" ? (
                  <DropdownMenuItem asChild>
                    <a
                      href={`${contract.executedFileUrl}?inline=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileText className="size-4" />
                      View signed PDF
                    </a>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem asChild>
                    <Link href={`/dashboard/contracts/${contract.contractId}`}>
                      <Eye className="size-4" />
                      View contract
                    </Link>
                  </DropdownMenuItem>
                )}
                {canResendContract(contract) && (
                  <DropdownMenuItem
                    disabled={resending}
                    onSelect={() => void resend(contract.contractId)}
                  >
                    {resending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    Resend signing link
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </TooltipDropdownMenu>
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
    },
  ];

  const table = useReactTable({
    data: contracts,
    columns,
    state: {
      columnFilters,
      sorting,
      globalFilter,
      pagination,
    },
    getRowId: (row) => row.contractId,
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // Search across the human-facing identity fields plus the reference code.
    globalFilterFn: (row, _columnId, filterValue: string) => {
      const term = filterValue.toLowerCase();
      const c = row.original;
      return [c.title, c.clientName, c.projectName, c.contractCode].some(
        (value) => (value ?? "").toLowerCase().includes(term),
      );
    },
  });
  const searchQuery = table.getState().globalFilter ?? "";
  const statusFilter =
    (table.getColumn("status")?.getFilterValue() as string) ?? "all";

  if (loading) return <LoadingState label="Loading Contracts" />;

  return (
    <>
      <PageTitle title="Contracts" />
      <FadeIn className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <PageHeader
            title="Contracts"
            description="Draft, send, and track client design agreements."
          />
        </div>

        <Card variant="panel" className="gap-0">
          <CardHeader className="h-17!">
            <CardTitle className="leading-none">Recent Contracts</CardTitle>
            <div className="flex items-center gap-2">
              <Input
                className="w-44 md:w-52"
                placeholder="Search contracts..."
                value={searchQuery}
                onChange={(event) => {
                  table.setGlobalFilter(event.target.value || undefined);
                  table.setPageIndex(0);
                }}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <ListFilter data-icon="inline-start" />
                    Status
                    <ChevronDownIcon data-icon="inline-end" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuRadioGroup
                    value={statusFilter}
                    onValueChange={(value) => {
                      table
                        .getColumn("status")
                        ?.setFilterValue(value === "all" ? undefined : value);
                      table.setPageIndex(0);
                    }}
                  >
                    {statusOptions.map((option) => (
                      <DropdownMenuRadioItem key={option} value={option}>
                        {option === "all"
                          ? "All statuses"
                          : option
                              .split("_")
                              .map(
                                (w) => w.charAt(0).toUpperCase() + w.slice(1),
                              )
                              .join(" ")}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button asChild>
                <Link href="/dashboard/contracts/new">
                  <Plus className="size-4" />
                  Contract
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 px-0 pt-0">
            <TanTable
              table={table}
              pagination
              noun="contracts"
              emptyMessage="No contracts found."
            />
          </CardContent>
        </Card>
      </FadeIn>
    </>
  );
}
