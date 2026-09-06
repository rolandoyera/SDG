"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import {
  ArrowRight,
  Building2,
  DollarSign,
  FolderKanban,
  MapPin,
  Plus,
  PlusCircle,
  Search,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { LoadingState } from "@/components/loading-state";
import { FadeIn } from "@/components/fade-in";
import { DataField } from "@/components/ui/data-field";
import { useAuth } from "@/components/auth-context";
import { PageTitle } from "@/components/page-title-updater";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  formatProjectAddress,
  getClients,
  getProjects,
  updateProject,
} from "@/lib/db";
import { createProject } from "@/server/project-actions";
import type { Client, Project } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";

import {
  EMPTY_PROJECT_FORM,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_VARIANT,
  type ProjectFormData,
  projectToForm,
} from "./_components/project-constants";
import { ProjectFormDialog } from "./_components/project-form-dialog";
import PageHeader from "@/components/page-header";

export default function ProjectsPage() {
  const { profile, organizationId, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Dialog States
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch projects & clients on mount
  useEffect(() => {
    if (authLoading || !organizationId) return;
    const orgId = organizationId; // stable string dependency; profile object identity churns on each heartbeat
    async function loadData() {
      try {
        const [projectsData, clientsData] = await Promise.all([
          getProjects(orgId),
          getClients(orgId),
        ]);
        setProjects(projectsData);
        setClients(clientsData);
      } catch (error) {
        console.error("Failed to load projects/clients:", error);
        toast.error("Failed to fetch Projects list from database.");
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, [organizationId, authLoading]);

  const handleOpenAdd = () => {
    if (clients.length === 0) {
      toast.warning(
        "Please create a client profile before adding a design project.",
      );
      return;
    }
    setEditingProject(null);
    setIsDialogOpen(true);
  };

  const handleSubmitProject = async (data: ProjectFormData) => {
    if (!profile) return;
    setSubmitting(true);
    try {
      if (editingProject) {
        const updatedFields = await updateProject(editingProject.projectId, {
          ...data,
          updatedBy: profile.uid,
        });
        setProjects((prev) =>
          prev.map((p) =>
            p.projectId === editingProject.projectId
              ? { ...p, ...updatedFields }
              : p,
          ),
        );
        toast.success("Project specifications updated successfully!");
      } else {
        const created = await createProject({
          ...data,
          createdBy: profile.uid,
          updatedBy: profile.uid,
        });
        setProjects((prev) => [created, ...prev]);
        toast.success("New design project space initialized successfully!");
      }
      setIsDialogOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save project.");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProjects = projects.filter((project) => {
    if (!project) return false;
    const parentClient = clients.find((c) => c.uid === project.clientId);

    const clientName = parentClient
      ? `${parentClient.firstName ?? ""} ${parentClient.lastName ?? ""}`.trim()
      : "";
    const term = searchQuery.toLowerCase();
    const address = formatProjectAddress(project) || "";

    return (
      (project.name || "").toLowerCase().includes(term) ||
      clientName.toLowerCase().includes(term) ||
      address.toLowerCase().includes(term) ||
      (project.projectCode ?? "").toLowerCase().includes(term) ||
      project.brief?.toLowerCase().includes(term)
    );
  });

  if (loading) return <LoadingState label="Loading Projects" />;

  return (
    <>
      <PageTitle title="Projects" />
      <FadeIn className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <PageHeader
            title="Projects"
            description="Manage and track your projects."
          />

          {clients.length === 0 ? (
            <Link href="/dashboard/clients" prefetch={false}>
              <Button>
                <PlusCircle className="size-4" />
                Add Client First
              </Button>
            </Link>
          ) : (
            <Button onClick={handleOpenAdd}>
              <Plus className="size-4" />
              Project
            </Button>
          )}
        </div>

        {/* Quick search input */}
        <div className="relative w-full max-w-md">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search project title, client parent, or sites..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-background/50 pl-9"
          />
        </div>

        {/* Loading or Visual Grid Cards */}
        {filteredProjects.length === 0 ? (
          <div className="flex min-h-75 flex-col items-center justify-center p-8 text-center">
            <FolderKanban className="mb-3 size-12 text-muted-foreground/40" />
            <h3 className="font-semibold text-lg mb-1">
              {searchQuery ? "No results found" : "No projects"}
            </h3>
            <p className="max-w-sm text-muted-foreground text-sm">
              {searchQuery
                ? "Try broadening your search query or clear the filter."
                : "Get started by adding your first project."}
            </p>
            {!searchQuery && clients.length > 0 && (
              <Button
                onClick={handleOpenAdd}
                className="mt-4 flex items-center gap-2"
              >
                <Plus className="size-4" />
                Start Project
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-1 xl:grid-cols-4">
            {filteredProjects.map((project) => {
              const parentClient = clients.find(
                (c) => c.uid === project.clientId,
              );

              return (
                <Card
                  variant="panel"
                  key={project.projectId}
                  className="group transition-all duration-200 has-[.detail-link:hover]:-translate-y-0.5 has-[.detail-link:hover]:border-primary/30 has-[.detail-link:hover]:shadow-md"
                >
                  <CardHeader className="justify-between">
                    <CardTitle className="transition-colors group-has-[.detail-link:hover]:text-primary">
                      <Link
                        href={`/dashboard/projects/${project.clientId}`}
                        className="detail-link shrink-0 cursor-pointer"
                      >
                        <Avatar className="size-8">
                          {parentClient?.company ? (
                            <Building2 className="size-4" />
                          ) : (
                            <User className="size-4" />
                          )}
                        </Avatar>
                      </Link>
                      <Link
                        href={`/dashboard/projects/${project.projectId}`}
                        prefetch={false}
                        className="detail-link cursor-pointer"
                      >
                        {project.name}
                      </Link>
                    </CardTitle>
                    <Badge variant={PROJECT_STATUS_VARIANT[project.status]}>
                      {PROJECT_STATUS_LABELS[project.status]}
                    </Badge>
                  </CardHeader>

                  <CardContent className="py-2">
                    <div className="flex flex-col gap-2 rounded border border-muted/50 bg-muted p-3">
                      <DataField
                        variant="icon"
                        label={parentClient?.company ? <Building2 /> : <User />}
                        empty="Not set"
                      >
                        {parentClient
                          ? parentClient.company ||
                            `${parentClient.firstName ?? ""} ${parentClient.lastName ?? ""}`.trim()
                          : null}
                      </DataField>
                      <DataField
                        variant="icon"
                        label={<DollarSign />}
                        empty="Not set"
                      >
                        {project.budget
                          ? formatCurrency(project.budget, {
                              noDecimals: true,
                            })
                          : null}
                      </DataField>
                      <DataField
                        variant="icon"
                        label={<MapPin />}
                        empty="Not set"
                      >
                        {[project.city, project.state, project.zip]
                          .filter(Boolean)
                          .join(", ")}
                      </DataField>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      variant="link"
                      size="sm"
                      asChild
                      className="ml-auto p-0 detail-link"
                    >
                      <Link
                        href={`/dashboard/projects/${project.projectId}`}
                        prefetch={false}
                        className="group/btn flex items-center gap-0.5"
                      >
                        View Project
                        <ArrowRight className="size-3 transition-transform group-hover/btn:translate-x-1" />
                      </Link>
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}

        {/* Add / Edit Project Modal */}
        <ProjectFormDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          mode={editingProject ? "edit" : "add"}
          submitting={submitting}
          clients={clients}
          initialData={
            editingProject ? projectToForm(editingProject) : EMPTY_PROJECT_FORM
          }
          onSubmit={handleSubmitProject}
        />
      </FadeIn>
    </>
  );
}
