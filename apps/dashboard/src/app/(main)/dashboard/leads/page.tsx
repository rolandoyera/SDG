"use client";

import { useEffect, useMemo, useState } from "react";

import { toast } from "sonner";

import { LoadingState } from "@/components/loading-state";
import { FadeIn } from "@/components/fade-in";
import { useAuth } from "@/components/auth-context";
import PageHeader from "@/components/page-header";
import { PageTitle } from "@/components/page-title-updater";
import { addLead, getLeads, getOrganizationUsers } from "@/lib/db";
import type { ActivityActor, Lead, UserProfile } from "@/lib/types";

import { PipelineActivity } from "./_components/pipeline-activity";
import { TaskReminders } from "./_components/task-reminders";
import { QuickCreateTrigger } from "../_components/quick-create-trigger";
import {
  type LeadFormData,
  leadFormToFields,
} from "./_components/lead-constants";
import { LeadFormDialog } from "./_components/lead-form-dialog";
import { LeadsTable } from "./_components/leads-table";
import { KpiCards } from "./_components/kpi-cards";

export default function LeadsPage() {
  const { uid, profile, organizationId, loading: authLoading } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading || !organizationId) return;
    const orgId = organizationId; // stable string dependency; profile object identity churns on each heartbeat

    async function loadData() {
      try {
        const [leadsData, usersData] = await Promise.all([
          getLeads(orgId),
          getOrganizationUsers(orgId),
        ]);
        setLeads(leadsData);
        setUsers(usersData);
      } catch (error) {
        console.error("Failed to load leads:", error);
        toast.error("Failed to fetch leads from database.");
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, [organizationId, authLoading]);

  const userMap = useMemo(
    () => Object.fromEntries(users.map((u) => [u.uid, u.fullName])),
    [users],
  );

  const handleAddSubmit = async (data: LeadFormData) => {
    if (!uid || !organizationId || !profile) return;
    setSubmitting(true);
    try {
      const fields = leadFormToFields(data);
      const actor: ActivityActor = {
        type: "user",
        id: profile.uid,
        name: profile.fullName,
      };
      const created = await addLead({
        ...fields,
        ...(fields.assignedTo ? { assignedAt: Date.now() } : {}),
        organizationId,
        createdBy: actor,
        updatedBy: actor,
      });
      setLeads((prev) => [created, ...prev]);
      toast.success("New lead created successfully!");
      setIsAddOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save lead.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState label="Loading Leads" />;

  return (
    <>
      <PageTitle title="Leads" />
      <FadeIn className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <PageHeader
            title="Leads"
            description="Capture, qualify, and convert your pipeline."
          />
        </div>
        <KpiCards />

        <LeadsTable
          leads={leads}
          userMap={userMap}
          currentUserId={uid ?? undefined}
          onAddLead={() => setIsAddOpen(true)}
        />
        <TaskReminders />
        <PipelineActivity />

        <QuickCreateTrigger onTrigger={() => setIsAddOpen(true)} />
        <LeadFormDialog
          open={isAddOpen}
          onOpenChange={setIsAddOpen}
          title="Add a Lead"
          description="Capture a new lead and its project fit details."
          submitLabel="Create Lead"
          submitting={submitting}
          users={users}
          onSubmit={handleAddSubmit}
        />
      </FadeIn>
    </>
  );
}
