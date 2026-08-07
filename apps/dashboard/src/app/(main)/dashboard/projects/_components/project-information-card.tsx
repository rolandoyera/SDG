"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { AddressValue, hasAddressLines } from "@/components/ui/address-value";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataField } from "@/components/ui/data-field";
import type { Client, Project } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface ProjectInformationCardProps {
  project: Project;
  client: Client | null;
}

export function ProjectInformationCard({
  project,
  client,
}: ProjectInformationCardProps) {
  // First + last name are mandatory at creation, so a simple join is enough;
  // company is the fallback for company-type contacts.
  const clientName = client
    ? `${client.firstName} ${client.lastName}`.trim() || client.company || ""
    : "";

  return (
    <Card variant="panel">
      <CardHeader>
        <CardTitle>
          <Building2 className="icons" />
          Project Information
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 text-sm sm:grid-cols-2 md:h-62">
        <DataField label="Created" empty="Not set">
          {new Date(project.createdAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </DataField>
        <DataField label="Project #" empty="Not set">
          {project.projectCode}
        </DataField>
        <DataField label="Client Name" empty="Not set">
          {client && (
            <Link
              href={`/dashboard/clients/${client.uid}`}
              prefetch={false}
              className="flex items-center gap-1.5 text-primary hover:text-primary hover:underline"
            >
              {clientName}
            </Link>
          )}
        </DataField>
        <DataField label="Budget" empty="Not set">
          {project.budget !== undefined &&
            project.budget > 0 &&
            formatCurrency(project.budget, { noDecimals: true })}
        </DataField>

        <DataField label="Project Site" empty="Not set">
          {hasAddressLines(project) && <AddressValue address={project} />}
        </DataField>
        <DataField label="Project Brief" empty="Not set">
          {project.brief}
        </DataField>
      </CardContent>
    </Card>
  );
}
