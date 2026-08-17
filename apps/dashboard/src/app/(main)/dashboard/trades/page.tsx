"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import {
  AlertTriangle,
  Hammer,
  Loader2,
  Mail,
  Phone,
  Plus,
  Search,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-context";
import { PageTitle } from "@/components/page-title-updater";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { H1, H3 } from "@/components/ui/typography";
import { addTrade, getTrades } from "@/lib/db";
import type { Trade } from "@/lib/types";
import { formatPhone, getInitials } from "@/lib/utils";

import { QuickCreateTrigger } from "../_components/quick-create-trigger";
import {
  EMPTY_TRADE_FORM,
  TRADE_TYPES,
  type TradeFormData,
} from "./_components/trade-constants";
import { TradeFormDialog } from "./_components/trade-form-dialog";

// Accent gradients by company name first letter for premium aesthetic
const CARD_GRADIENTS = [
  "from-violet-500/15 via-violet-500/5 to-transparent",
  "from-sky-500/15 via-sky-500/5 to-transparent",
  "from-emerald-500/15 via-emerald-500/5 to-transparent",
  "from-amber-500/15 via-amber-500/5 to-transparent",
  "from-rose-500/15 via-rose-500/5 to-transparent",
  "from-indigo-500/15 via-indigo-500/5 to-transparent",
  "from-teal-500/15 via-teal-500/5 to-transparent",
];

function tradeGradient(name: string) {
  const idx = name.charCodeAt(0) % CARD_GRADIENTS.length;
  return CARD_GRADIENTS[idx];
}

export default function TradesPage() {
  const { profile, organizationId, loading: authLoading } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeType, setActiveType] = useState("All");
  const [isAddOpen, setIsAddOpen] = useState(false);

  const handleOpenAdd = () => setIsAddOpen(true);

  useEffect(() => {
    if (authLoading || !organizationId) return;
    const orgId = organizationId; // stable string dependency; profile object identity churns on each heartbeat

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const searchParam = params.get("search");
      if (searchParam) setSearchQuery(searchParam);
    }

    async function loadData() {
      try {
        const data = await getTrades(orgId);
        setTrades(data);
      } catch {
        toast.error("Failed to fetch trades from database.");
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, [organizationId, authLoading]);

  const handleAdd = async (data: TradeFormData, customTradeId?: string) => {
    if (!profile) return;
    const tradeId =
      customTradeId ?? `trade-${Math.random().toString(36).substr(2, 9)}`;
    try {
      const created = await addTrade(
        {
          ...data,
          organizationId: profile.organizationId,
        },
        tradeId,
      );
      setTrades((prev) => [created, ...prev]);
      toast.success("New trade profile successfully registered!");
      setIsAddOpen(false);
    } catch {
      toast.error("Failed to save trade specifications.");
      throw new Error("save failed");
    }
  };

  const filteredTrades = trades.filter((t) => {
    const term = searchQuery.toLowerCase();
    const matchesSearch =
      t.companyName.toLowerCase().includes(term) ||
      (t.contactFirstName?.toLowerCase().includes(term) ?? false) ||
      (t.contactLastName?.toLowerCase().includes(term) ?? false) ||
      t.tradeType.toLowerCase().includes(term) ||
      (t.tradeSubcategory?.toLowerCase().includes(term) ?? false);

    const matchesType = activeType === "All" || t.tradeType === activeType;
    return matchesSearch && matchesType;
  });

  return (
    <>
      <PageTitle title="Trades & Services" />
      <div className="flex w-full flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <H1>Trades & Services</H1>
            <p className="mt-1 text-muted-foreground text-sm">
              Manage subcontractors, installers, service entities, and
              credentials.
            </p>
          </div>
          <Button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/95 sm:self-start">
            <Plus className="size-4" />
            Add Trade Profile
          </Button>
        </div>

        {/* Filters and search controls */}
        <div className="flex flex-col items-center justify-between gap-4 border-b pb-4 xl:flex-row">
          {/* Trade Type Tabs */}
          <div className="w-full pb-2 xl:pb-0">
            <Tabs
              value={activeType}
              onValueChange={setActiveType}
              className="w-auto">
              <TabsList className="flex h-auto! w-max gap-0.5">
                <TabsTrigger
                  value="All"
                  className="cursor-pointer px-3 py-1.5 font-semibold text-[12px]">
                  All Trades
                </TabsTrigger>
                {TRADE_TYPES.map((type) => (
                  <TabsTrigger
                    key={type}
                    value={type}
                    className="cursor-pointer px-3 py-1.5 font-semibold text-[12px]">
                    {type}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {/* Quick Search */}
          <div className="relative w-full max-w-xs shrink-0 self-end xl:self-auto">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by company or contact..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-background/50 pl-9"
            />
          </div>
        </div>

        {/* Directory Grid */}
        {loading ? (
          <div className="flex min-h-75 flex-col items-center justify-center gap-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
              Loading Directory
            </p>
          </div>
        ) : filteredTrades.length === 0 ? (
          <Card className="flex min-h-75 flex-col items-center justify-center border-dashed bg-background/30 p-8 text-center">
            <Hammer className="mb-3 size-12 text-muted-foreground/40" />
            <h3 className="font-semibold text-lg">No trade profiles found</h3>
            <p className="mt-1 max-w-sm text-muted-foreground text-sm">
              {searchQuery
                ? "Try broadening your search or clear filters."
                : "Get started by adding your first trade subcontractor contact."}
            </p>
            {!searchQuery && (
              <Button
                onClick={handleOpenAdd}
                className="mt-4 flex items-center gap-2">
                <Plus className="size-4" />
                Add Trade Profile
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredTrades.map((trade) => (
              <TradeCard key={trade.tradeId} trade={trade} />
            ))}
          </div>
        )}

        <QuickCreateTrigger onTrigger={() => setIsAddOpen(true)} />
        <TradeFormDialog
          open={isAddOpen}
          onOpenChange={setIsAddOpen}
          mode="add"
          initialData={EMPTY_TRADE_FORM}
          onSave={handleAdd}
        />
      </div>
    </>
  );
}

function checkExpiration(dateStr?: string): {
  expired: boolean;
  expiringSoon: boolean;
} {
  if (!dateStr) return { expired: false, expiringSoon: false };
  const expDate = new Date(dateStr);
  if (Number.isNaN(expDate.getTime()))
    return { expired: false, expiringSoon: false };

  const now = new Date();
  // Clear times for date comparisons
  now.setHours(0, 0, 0, 0);
  expDate.setHours(0, 0, 0, 0);

  if (expDate < now) {
    return { expired: true, expiringSoon: false };
  }

  const limit = new Date();
  limit.setDate(limit.getDate() + 30);
  limit.setHours(0, 0, 0, 0);

  if (expDate <= limit) {
    return { expired: false, expiringSoon: true };
  }

  return { expired: false, expiringSoon: false };
}

function TradeCard({ trade }: { trade: Trade }) {
  const initials = getInitials(trade.companyName);
  const gradient = tradeGradient(trade.companyName);

  const licExp = checkExpiration(trade.licenseExpirationDate);
  const insExp = checkExpiration(trade.insuranceExpirationDate);

  const hasAlert =
    licExp.expired ||
    licExp.expiringSoon ||
    insExp.expired ||
    insExp.expiringSoon;

  return (
    <Card className="group relative flex h-full flex-col overflow-hidden pt-0 transition-all duration-200 has-[.detail-link:hover]:-translate-y-0.5 has-[.detail-link:hover]:border-primary/30 has-[.detail-link:hover]:shadow-md">
      {/* Visual Header */}
      <Link
        href={`/dashboard/trades/${trade.tradeId}`}
        className="detail-link relative flex h-36 w-full cursor-pointer items-center justify-center overflow-hidden bg-muted/20">
        <div className={`absolute inset-0 bg-linear-to-br ${gradient}`} />
        <div className="absolute inset-0 bg-black/5" />

        {/* Monogram circle */}
        <div className="relative flex size-14 items-center justify-center rounded-full border bg-background shadow-xs">
          <span className="select-none font-bold font-heading text-primary/80 text-xl">
            {initials.slice(0, 2)}
          </span>
        </div>

        <div className="absolute top-3 left-3">
          <Badge variant="overlay">
            {["Contractors", "Installers", "Fabricators", "Engineer"].includes(
              trade.tradeType,
            ) && trade.tradeSubcategory
              ? trade.tradeSubcategory
              : trade.tradeType}
          </Badge>
        </div>
      </Link>

      <CardContent className="flex flex-1 flex-col gap-3.5 pt-4">
        {/* Company Title */}
        <div>
          <H3 className="line-clamp-1 transition-colors group-has-[.detail-link:hover]:text-primary">
            <Link
              href={`/dashboard/trades/${trade.tradeId}`}
              className="detail-link cursor-pointer">
              {trade.companyName}
            </Link>
          </H3>
          <p className="mt-1 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
            {trade.contactFirstName} {trade.contactLastName}
          </p>
        </div>

        {/* Alerts / Credentials Badges */}
        {hasAlert && (
          <div className="flex flex-wrap gap-1.5">
            {licExp.expired && (
              <Badge variant="destructive">
                <ShieldAlert className="size-3" /> Lic. Expired
              </Badge>
            )}
            {licExp.expiringSoon && (
              <Badge variant="warning">
                <AlertTriangle className="size-3" /> Lic. Expiring
              </Badge>
            )}
            {insExp.expired && (
              <Badge variant="destructive">
                <ShieldAlert className="size-3" /> Ins. Expired
              </Badge>
            )}
            {insExp.expiringSoon && (
              <Badge variant="warning">
                <AlertTriangle className="size-3" /> Ins. Expiring
              </Badge>
            )}
          </div>
        )}

        {/* Contact Links */}
        <div className="mt-auto flex flex-col gap-1.5 text-muted-foreground text-xs">
          {trade.email && (
            <span className="flex items-center gap-1.5 truncate">
              <Mail className="size-3.5 shrink-0" />
              <span className="truncate">{trade.email}</span>
            </span>
          )}
          {trade.phone && (
            <span className="flex items-center gap-1.5">
              <Phone className="size-3.5 shrink-0" />
              <span>{formatPhone(trade.phone)}</span>
            </span>
          )}
        </div>
      </CardContent>

      <CardFooter className="border-t bg-muted/20 px-4 py-2.5">
        <Link
          href={`/dashboard/trades/${trade.tradeId}`}
          className="detail-link w-full text-center font-semibold text-primary/80 text-xs hover:text-primary hover:underline">
          View Trade Profile
        </Link>
      </CardFooter>
    </Card>
  );
}
