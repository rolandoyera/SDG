"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  User,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { LoadingState } from "@/components/loading-state";
import { FadeIn } from "@/components/fade-in";
import { useAuth } from "@/components/auth-context";
import { PageTitle } from "@/components/page-title-updater";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { H3 } from "@/components/ui/typography";
import { getClients } from "@/lib/db";
import { createClient } from "@/server/client-actions";
import type { Client } from "@/lib/types";
import { formatPhone } from "@/lib/utils";

import { QuickCreateTrigger } from "../_components/quick-create-trigger";
import type { ClientFormData } from "./_components/client-constants";
import { ClientFormDialog } from "./_components/client-form-dialog";
import { getClientName } from "./_components/client-name";
import PageHeader from "@/components/page-header";
import { DataField } from "@/components/ui/data-field";

export default function ClientsPage() {
  const { profile, organizationId, loading: authLoading } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading || !organizationId) return;
    const orgId = organizationId; // stable string dependency; profile object identity churns on each heartbeat

    async function loadData() {
      try {
        const clientsData = await getClients(orgId);
        setClients(clientsData);
      } catch (error) {
        console.error("Failed to load clients:", error);
        toast.error("Failed to fetch CRM contacts from database.");
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, [organizationId, authLoading]);

  const handleAddSubmit = async (data: ClientFormData) => {
    if (!profile) return;
    if (!data.firstName.trim() || !data.lastName.trim()) {
      toast.error("First name and last name are required.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createClient(data);
      setClients((prev) => [created, ...prev]);
      toast.success("New client created successfully!");
      setIsDialogOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save client.");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredClients = clients.filter((client) => {
    if (!client) return false;
    const term = searchQuery.toLowerCase();

    const { firstName, lastName } = getClientName(client);

    const email = typeof client.email === "string" ? client.email : "";
    const company = typeof client.company === "string" ? client.company : "";
    const clientCode = client.clientCode ?? "";

    return (
      firstName.toLowerCase().includes(term) ||
      lastName.toLowerCase().includes(term) ||
      email.toLowerCase().includes(term) ||
      company.toLowerCase().includes(term) ||
      clientCode.toLowerCase().includes(term)
    );
  });

  if (loading) return <LoadingState label="Loading Clients" />;

  return (
    <>
      <PageTitle title="Client Directory" />
      <FadeIn className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <PageHeader
            title="Client Directory"
            description="Manage your clients."
          />
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="size-4" />
            Client
          </Button>
        </div>

        <div className="relative w-full max-w-md">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search client directory by name, email or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-background/50 pl-9"
          />
        </div>

        {filteredClients.length === 0 ? (
          <div className="flex min-h-75 flex-col items-center justify-center p-8 text-center">
            <Users className="mb-3 size-12 text-muted-foreground/40" />
            <h3 className="font-semibold text-lg mb-1">
              {searchQuery ? "No results found" : "No clients"}
            </h3>
            <p className="max-w-sm text-muted-foreground text-sm">
              {searchQuery
                ? "Try broadening your search query or clear the filter."
                : "Get started by adding your first client."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            {filteredClients.map((client) => {
              const { firstName, lastName } = getClientName(client);

              return (
                <Card
                  variant="panel"
                  key={client.uid}
                  className="group relative flex h-full flex-col overflow-hidden transition-all duration-200 has-[.detail-link:hover]:-translate-y-0.5 has-[.detail-link:hover]:border-primary/30 has-[.detail-link:hover]:shadow-md"
                >
                  <CardHeader className="gap-2">
                    <Link
                      href={`/dashboard/clients/${client.uid}`}
                      className="detail-link shrink-0 cursor-pointer"
                    >
                      <>
                        {client.company ? (
                          <Building2 className="icons" />
                        ) : (
                          <User className="icons" />
                        )}
                      </>
                    </Link>
                    <div className="min-w-0 flex-1">
                      <H3 className="truncate transition-colors group-has-[.detail-link:hover]:text-primary">
                        <Link
                          href={`/dashboard/clients/${client.uid}`}
                          className="detail-link cursor-pointer"
                        >
                          {client.company
                            ? client.company
                            : `${firstName} ${lastName}`}
                        </Link>
                      </H3>
                    </div>
                  </CardHeader>

                  <CardContent className="py-2">
                    <div className="flex flex-col gap-2 rounded border border-muted/50 bg-muted/50 p-3">
                      <DataField
                        variant="icon"
                        label={<Mail />}
                        empty="Not set"
                      >
                        {client.email}
                      </DataField>
                      <DataField
                        variant="icon"
                        label={<Phone />}
                        empty="Not set"
                      >
                        {client.phone && formatPhone(client.phone)}
                      </DataField>
                      <DataField
                        variant="icon"
                        label={<MapPin />}
                        empty="Not set"
                      >
                        {[client.city, client.state].filter(Boolean).join(", ")}
                      </DataField>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      variant="link"
                      size="sm"
                      asChild
                      className="ml-auto -mr-2 detail-link"
                    >
                      <Link
                        href={`/dashboard/clients/${client.uid}`}
                        prefetch={false}
                        className="group/btn flex items-center gap-0.5"
                      >
                        View Client
                        <ArrowRight className="size-3 transition-transform group-hover/btn:translate-x-1" />
                      </Link>
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}

        <QuickCreateTrigger onTrigger={() => setIsDialogOpen(true)} />
        <ClientFormDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          title="Add Client Profile"
          description="Input client contacts, optional company settings, and design preferences."
          submitLabel="Create Profile"
          submitting={submitting}
          onSubmit={handleAddSubmit}
        />
      </FadeIn>
    </>
  );
}
