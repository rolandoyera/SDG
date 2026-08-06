"use client";

import { use, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-context";
import {
  addClientNote,
  deleteClient,
  getClient,
  getClientNotes,
  getProjects,
  softDeleteClientNote,
  updateClient,
} from "@/lib/db";
import { createProject } from "@/server/project-actions";
import type { ActivityActor, Client, ClientNote, Project } from "@/lib/types";

import type { ProjectFormData } from "../../projects/_components/project-constants";
import { ProjectFormDialog } from "../../projects/_components/project-form-dialog";
import type { ClientFormData } from "../_components/client-constants";
import { ClientContactCard } from "../_components/client-contact-card";
import { ClientDetailHeader } from "../_components/client-detail-header";
import { ClientFormDialog } from "../_components/client-form-dialog";
import { getClientName } from "../_components/client-name";
import { ClientNotesLogCard } from "../_components/client-notes-log-card";
import { ClientProjectsCard } from "../_components/client-projects-card";
import { DeleteClientDialog } from "../_components/delete-client-dialog";

interface PageProps {
  params: Promise<{ clientId: string }>;
}

export default function ClientProfilePage({ params }: PageProps) {
  const { clientId } = use(params);
  const router = useRouter();
  const { profile, organizationId, loading: authLoading } = useAuth();

  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [loading, setLoading] = useState(true);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [deletingProfile, setDeletingProfile] = useState(false);
  const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
  const [addingProject, setAddingProject] = useState(false);

  useEffect(() => {
    if (authLoading || !organizationId) return;
    const orgId = organizationId; // stable string dependency; profile object identity churns on each heartbeat

    async function loadClientData() {
      try {
        const [clientData, projectsData, notesData] = await Promise.all([
          getClient(clientId),
          getProjects(orgId),
          getClientNotes(clientId),
        ]);

        if (!clientData || clientData.organizationId !== orgId) {
          toast.error("Client profile not found.");
          router.push("/dashboard/clients");
          return;
        }

        setClient(clientData);
        setProjects(projectsData.filter((p) => p.clientId === clientId));
        setNotes(notesData);
      } catch (error) {
        console.error("Failed to load client details:", error);
        toast.error("Failed to retrieve client credentials from database.");
      } finally {
        setLoading(false);
      }
    }
    void loadClientData();
  }, [clientId, router, organizationId, authLoading]);

  const handleEditSubmit = async (data: ClientFormData) => {
    if (!client) return;
    if (!data.firstName.trim() || !data.lastName.trim()) {
      toast.error("First name and last name are required.");
      return;
    }

    setUpdatingProfile(true);
    try {
      await updateClient(client.uid, data);
      setClient({ ...client, ...data });
      setIsEditOpen(false);
      toast.success("Client profile updated successfully!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update client details.");
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleAddProject = async (data: ProjectFormData) => {
    if (!profile) return;
    setAddingProject(true);
    try {
      const created = await createProject({
        ...data,
        createdBy: profile.uid,
        updatedBy: profile.uid,
      });
      setProjects((prev) => [created, ...prev]);
      setIsAddProjectOpen(false);
      toast.success("New design project successfully mapped to this client!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to initialize design project space.");
    } finally {
      setAddingProject(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!client) return;
    setDeletingProfile(true);
    try {
      await deleteClient(client.uid);
      toast.success("Client profile successfully removed from studio roster!");
      router.push("/dashboard/clients");
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete client contact.");
    } finally {
      setDeletingProfile(false);
      setIsDeleteAlertOpen(false);
    }
  };

  const currentActor: ActivityActor | null = profile
    ? {
        type: "user",
        id: profile.uid,
        name: profile.fullName,
      }
    : null;

  const handleAddNote = async (body: string) => {
    if (!client || !currentActor) return;
    try {
      const created = await addClientNote({
        organizationId: client.organizationId,
        clientId: client.uid,
        body,
        author: currentActor,
        sourceLabel: clientName,
      });
      setNotes((prev) => [created, ...prev]);
      toast.success("Note added.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to add note.");
      throw error; // keep the composer text so the user can retry
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!client || !currentActor) return;
    try {
      await softDeleteClientNote({
        clientId: client.uid,
        noteId,
        organizationId: client.organizationId,
        actor: currentActor,
        sourceLabel: clientName,
      });
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      toast.success("Note deleted.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete note.");
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex min-h-100 flex-col items-center justify-center gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
          Fetching Client Specifications
        </p>
      </div>
    );
  }

  if (!client) return null;

  const { firstName, lastName } = getClientName(client);
  const clientName = `${firstName} ${lastName}`.trim() || "Unnamed Client";

  return (
    <div className="flex w-full flex-col gap-6">
      <ClientDetailHeader
        client={client}
        onEdit={() => setIsEditOpen(true)}
        onRequestDelete={() => setIsDeleteAlertOpen(true)}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="col-span-1 xl:col-span-6">
          <ClientContactCard client={client} />
        </div>
        <div className="col-span-1 xl:col-span-6">
          <ClientProjectsCard
            projects={projects}
            onAddProject={() => setIsAddProjectOpen(true)}
          />
        </div>
        {currentActor && (
          <div className="col-span-1 xl:col-span-6">
            <ClientNotesLogCard
              notes={notes}
              currentActor={currentActor}
              onAddNote={handleAddNote}
              onDeleteNote={handleDeleteNote}
            />
          </div>
        )}
      </div>

      <ClientFormDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        title="Edit Client Profile"
        description="Modify client or company profile information."
        submitLabel="Save Changes"
        submitting={updatingProfile}
        defaultValues={{
          isCompany: client.isCompany,
          firstName,
          lastName,
          email: client.email || "",
          phone: client.phone ?? "",
          company: client.company ?? "",
          taxId: client.taxId ?? "",
          taxable: client.taxable ?? true,
          street: client.street ?? "",
          city: client.city ?? "",
          state: client.state ?? "",
          zip: client.zip ?? "",
          country: client.country ?? "US",
        }}
        onSubmit={handleEditSubmit}
      />

      <ProjectFormDialog
        open={isAddProjectOpen}
        onOpenChange={setIsAddProjectOpen}
        mode="add"
        submitting={addingProject}
        lockedClientId={client.uid}
        clientName={clientName}
        clients={[client]}
        onSubmit={handleAddProject}
      />

      <DeleteClientDialog
        open={isDeleteAlertOpen}
        onOpenChange={setIsDeleteAlertOpen}
        clientName={clientName}
        deleting={deletingProfile}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
