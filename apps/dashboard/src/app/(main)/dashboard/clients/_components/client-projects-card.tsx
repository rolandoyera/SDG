import Link from "next/link";

import { FolderKanban, MapPin, Plus, ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { H3 } from "@/components/ui/typography";
import type { Project } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_VARIANT,
} from "../../projects/_components/project-constants";

interface ClientProjectsCardProps {
  projects: Project[];
  onAddProject: () => void;
}

/** Associated project spaces grid with an "Initialize Project" entry point. */
export function ClientProjectsCard({
  projects,
  onAddProject,
}: ClientProjectsCardProps) {
  return (
    <Card variant="panel">
      <CardHeader>
        <CardTitle>
          <FolderKanban className="icons" />
          Projects
        </CardTitle>
      </CardHeader>
      <CardContent className="md:h-62">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FolderKanban className="mb-2 size-10 text-muted-foreground/50 stroke-[1.5]" />
            <p className="font-medium text-sm">No projects yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {projects.map((project) => (
              <div
                key={project.projectId}
                className="flex flex-col gap-3 rounded border border-border/50 bg-background/50 p-4">
                <div className="mt-1 flex items-center justify-between">
                  <H3 className="text-base">{project.name}</H3>
                  <Badge variant={PROJECT_STATUS_VARIANT[project.status]}>
                    {PROJECT_STATUS_LABELS[project.status]}
                  </Badge>
                </div>

                <div className="flex flex-col gap-1.5 rounded-md border border-muted/30 bg-muted/20 p-2.5 text-muted-foreground text-xs">
                  {project.budget !== undefined && project.budget > 0 && (
                    <div className="flex items-center gap-1.5 font-medium text-foreground/80">
                      Budget:{" "}
                      <span className="font-semibold text-foreground/90">
                        {formatCurrency(project.budget, { noDecimals: true })}
                      </span>
                    </div>
                  )}
                  {project.address && (
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin className="size-3.5 shrink-0 text-primary/70" />
                      {project.address}
                    </div>
                  )}
                </div>

                <div className="mt-1 flex items-center justify-end">
                  <Button
                    variant="link"
                    size="sm"
                    asChild
                    className="ml-auto p-0 detail-link">
                    <Link
                      href={`/dashboard/projects/${project.projectId}`}
                      prefetch={false}
                      className="group/btn flex items-center gap-0.5">
                      View Project
                      <ArrowRight className="size-3 transition-transform group-hover/btn:translate-x-1" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-end h-14">
        <Button size="sm" variant="secondary" onClick={onAddProject}>
          <Plus className="size-3.5" />
          Project
        </Button>
      </CardFooter>
    </Card>
  );
}
