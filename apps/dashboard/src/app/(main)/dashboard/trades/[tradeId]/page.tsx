"use client";

import { use, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Globe,
  Hammer,
  Loader2,
  Mail,
  MapPin,
  MoreVertical,
  Phone,
  Shield,
  User,
  Edit,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { LoadingState } from "@/components/loading-state";
import { FadeIn } from "@/components/fade-in";
import { useAuth } from "@/components/auth-context";
import { AddressValue } from "@/components/ui/address-value";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  TooltipDropdownMenu,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { H1 } from "@/components/ui/typography";
import { deleteTrade, getTrade, updateTrade } from "@/lib/db";
import type { Trade } from "@/lib/types";
import { formatPhone, normalizePhone } from "@/lib/utils";

import HeaderBackLink from "../../_components/HeaderBackLink";
import {
  type TradeFormData,
  tradeToForm,
} from "../_components/trade-constants";
import { TradeFormDialog } from "../_components/trade-form-dialog";

interface PageProps {
  params: Promise<{ tradeId: string }>;
}

export default function TradeDetailPage({ params }: PageProps) {
  const { tradeId } = use(params);
  const router = useRouter();
  const { organizationId, loading: authLoading } = useAuth();

  const [trade, setTrade] = useState<Trade | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (authLoading || !organizationId) return;
    const orgId = organizationId; // stable string dependency; profile object identity churns on each heartbeat

    async function load() {
      try {
        const data = await getTrade(tradeId);
        if (!data || data.organizationId !== orgId) {
          toast.error("Trade profile not found.");
          router.push("/dashboard/trades");
          return;
        }
        setTrade(data);
      } catch {
        toast.error("Failed to load trade profile.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [tradeId, router, organizationId, authLoading]);

  const handleEdit = async (data: TradeFormData) => {
    if (!trade) return;
    try {
      await updateTrade(trade.tradeId, data);
      setTrade({ ...trade, ...data });
      toast.success("Trade specifications updated successfully!");
      setIsEditOpen(false);
    } catch {
      toast.error("Failed to update trade profile details.");
    }
  };

  const handleDelete = async () => {
    if (!trade) return;
    setDeleting(true);
    try {
      await deleteTrade(trade.tradeId);
      toast.success("Trade profile successfully deleted.");
      router.push("/dashboard/trades");
    } catch {
      toast.error("Failed to remove trade profile from directory.");
      setDeleting(false);
    }
  };

  if (loading || authLoading) {
    return <LoadingState label="Loading Trade" />;
  }

  if (!trade) return null;

  return (
    <FadeIn className="mx-auto flex max-w-7xl flex-col gap-6">
      <HeaderBackLink href="/dashboard/trades" />

      {/* Detail Header Control Bar */}
      <div className="flex flex-col justify-between gap-4 border-b pb-6 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary shadow-xs">
            <Hammer className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <H1>{trade.companyName}</H1>
              <span className="rounded-full border border-primary/20 bg-primary/15 px-2.5 py-0.5 font-semibold text-[10px] text-primary uppercase tracking-wider">
                {[
                  "Contractors",
                  "Installers",
                  "Fabricators",
                  "Engineer",
                ].includes(trade.tradeType) && trade.tradeSubcategory
                  ? `${trade.tradeType} - ${trade.tradeSubcategory}`
                  : trade.tradeType}
              </span>
            </div>
            <p className="mt-1 flex items-center gap-2 font-medium text-muted-foreground text-sm">
              <User className="size-3.5" />
              {(trade.contactFirstName &&
                trade.contactLastName &&
                `${trade.contactFirstName} ${trade.contactLastName} `) || (
                <span className="text-muted-foreground/50 text-xs italic">
                  No Primary Contact
                </span>
              )}
            </p>
          </div>
        </div>

        <div>
          <TooltipDropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="size-4" />
                <span className="sr-only">Actions Menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setIsEditOpen(true)}>
                <Edit size={4} />
                Edit Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setIsDeleteOpen(true)}
                variant="destructive"
              >
                <Trash2 size={4} />
                Delete Profile
              </DropdownMenuItem>
            </DropdownMenuContent>
          </TooltipDropdownMenu>
        </div>
      </div>

      {/* Profile Sections Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Contact Information */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle>
              <Phone className="icons" />
              Contact Info
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4.5 pt-5 text-sm">
            <div className="flex flex-col gap-1">
              <Label>Primary Contact</Label>
              <span className="font-medium text-foreground">
                {trade.contactFirstName} {trade.contactLastName}
              </span>
            </div>

            {trade.email && (
              <div className="flex flex-col gap-1">
                <Label>Email Address</Label>
                <a
                  href={`mailto:${trade.email}`}
                  className="flex items-center gap-2 text-foreground/80 hover:text-primary hover:underline"
                >
                  <Mail className="size-4 shrink-0 text-muted-foreground" />
                  {trade.email}
                </a>
              </div>
            )}

            {trade.phone && (
              <div className="flex flex-col gap-1">
                <Label>Phone Number</Label>
                <a
                  href={`tel:${normalizePhone(trade.phone)}`}
                  className="flex items-center gap-2 text-foreground/80 hover:text-primary hover:underline"
                >
                  <Phone className="size-4 shrink-0 text-muted-foreground" />
                  {formatPhone(trade.phone)}
                </a>
              </div>
            )}

            {trade.website && (
              <div className="flex flex-col gap-1">
                <Label>Website URL</Label>
                <a
                  href={
                    trade.website.startsWith("http")
                      ? trade.website
                      : `https://${trade.website}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-foreground/80 hover:text-primary hover:underline"
                >
                  <Globe className="size-4 shrink-0 text-muted-foreground" />
                  {trade.website}
                  <ExternalLink className="size-3 text-muted-foreground" />
                </a>
              </div>
            )}

            {!trade.email && !trade.phone && !trade.website && (
              <p className="text-muted-foreground/60 text-xs italic">
                No contact information specified.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Address Location */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle>
              <MapPin className="icons" />
              Office & Location
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4.5 pt-5 text-sm">
            {trade.street || trade.city || trade.state || trade.zip ? (
              <div className="flex flex-col gap-1">
                <Label>Location Address</Label>
                <div className="flex items-start gap-2 text-foreground/80">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <AddressValue address={trade} mapsLabel="Open Google Maps" />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <Label>Location Address</Label>
                <p className="text-muted-foreground/60 text-xs italic">
                  No office address specified.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Compliance Credentials & Coverages */}
        <Card className="md:col-span-2">
          <CardHeader className="border-b">
            <CardTitle>
              <Shield className="icons" />
              Compliance Credentials & Coverages
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-6 pt-5 md:grid-cols-2">
            {/* License details */}
            <div className="flex flex-col gap-4 rounded border bg-muted/20 p-4">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="font-semibold text-foreground text-sm">
                  Professional License
                </span>
                <ComplianceBadge dateStr={trade.licenseExpirationDate} />
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label>License #</Label>
                  <p className="mt-1 font-medium font-mono text-foreground/80">
                    {trade.licenseNumber || "—"}
                  </p>
                </div>
                <div>
                  <Label>Expiration Date</Label>
                  <p className="mt-1 font-medium text-foreground/80">
                    {trade.licenseExpirationDate
                      ? new Date(
                          trade.licenseExpirationDate,
                        ).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          timeZone: "UTC",
                        })
                      : "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Insurance details */}
            <div className="flex flex-col gap-4 rounded border bg-muted/20 p-4">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="font-semibold text-foreground text-sm">
                  Liability Insurance
                </span>
                <ComplianceBadge dateStr={trade.insuranceExpirationDate} />
              </div>
              <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
                <div>
                  <Label>Insurance Policy #</Label>
                  <p className="mt-1 font-medium font-mono text-foreground/80">
                    {trade.insurancePolicyNumber || "—"}
                  </p>
                </div>
                <div>
                  <Label>Insurance Provider</Label>
                  <p className="mt-1 font-medium text-foreground/80">
                    {trade.insuranceProvider || "—"}
                  </p>
                </div>
                <div>
                  <Label>Expiration Date</Label>
                  <p className="mt-1 font-medium text-foreground/80">
                    {trade.insuranceExpirationDate
                      ? new Date(
                          trade.insuranceExpirationDate,
                        ).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          timeZone: "UTC",
                        })
                      : "—"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog modal */}
      {trade && (
        <TradeFormDialog
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          mode="edit"
          initialData={tradeToForm(trade)}
          onSave={handleEdit}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent className="bg-popover sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trade Profile?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete the trade profile for
              "{trade.companyName}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="gap-2"
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Delete Profile
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FadeIn>
  );
}

function checkExpiration(dateStr?: string): {
  expired: boolean;
  expiringSoon: boolean;
  none: boolean;
} {
  if (!dateStr) return { expired: false, expiringSoon: false, none: true };
  const expDate = new Date(dateStr);
  if (Number.isNaN(expDate.getTime()))
    return { expired: false, expiringSoon: false, none: true };

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  expDate.setHours(0, 0, 0, 0);

  if (expDate < now) {
    return { expired: true, expiringSoon: false, none: false };
  }

  const limit = new Date();
  limit.setDate(limit.getDate() + 30);
  limit.setHours(0, 0, 0, 0);

  if (expDate <= limit) {
    return { expired: false, expiringSoon: true, none: false };
  }

  return { expired: false, expiringSoon: false, none: false };
}

function ComplianceBadge({ dateStr }: { dateStr?: string }) {
  const { expired, expiringSoon, none } = checkExpiration(dateStr);

  if (none) {
    return <Badge variant="outline">N/A</Badge>;
  }

  if (expired) {
    return (
      <Badge variant="destructive">
        <AlertTriangle className="size-3" /> Expired
      </Badge>
    );
  }

  if (expiringSoon) {
    return (
      <Badge variant="warning">
        <AlertTriangle className="size-3" /> Expiring Soon
      </Badge>
    );
  }

  return (
    <Badge variant="success">
      <CheckCircle2 className="size-3" /> Active
    </Badge>
  );
}
