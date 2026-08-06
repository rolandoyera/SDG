"use client";

import type {
  Client,
  Organization,
  Project,
  ProjectRoom,
  ProjectRoomItem,
  Vendor,
} from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/app/portal/_components/ui/card";

import { ProposalItemsTable } from "./proposal-items-table";

interface ProposalDocumentProps {
  project: Project;
  client: Client | null;
  organization: Organization | null;
  rooms: ProjectRoom[];
  items: ProjectRoomItem[];
  vendors: Vendor[];
}

const lineTotal = (item: ProjectRoomItem) => item.sellingPrice * item.quantity;

/**
 * Read-only proposal preview rendered from live project data. Sections mirror the
 * project's rooms; each lists its items with the selling price the client sees.
 * Uses fixed light "paper" colors (not theme tokens) so it reads identically
 * inside the always-light client portal regardless of dashboard theme.
 * Presentation only — no persistence yet.
 */
export function ProposalDocument({
  project,
  client,
  organization,
  rooms,
  items,
  vendors,
}: ProposalDocumentProps) {
  const cp = organization?.companyProfile;
  const companyName = cp?.legalName || cp?.displayName || organization?.name;
  const logoDarkUrl = organization?.branding?.logoDarkUrl;

  const grandTotal = items.reduce((acc, item) => acc + lineTotal(item), 0);

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <main className="flex flex-col gap-4 max-w-[1700px] mx-auto">
      <div className="flex justify-between items-center mb-4">
        <div className="flex flex-col">
          <span className="text-muted-foreground text-sm uppercase mb-1">
            Project:
          </span>
          <span className="font-heading font-semibold text-2xl">
            {project.name}
          </span>
        </div>
        <div className="text-right">
          <h1 className="font-heading font-semibold text-2xl mb-1">Proposal</h1>
          <p className="text-muted-foreground text-sm uppercase">{today}</p>
        </div>
      </div>
      <Card>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 p-6">
          <div className="flex flex-col">
            <span className="font-light text-muted-foreground text-xs uppercase tracking-wider mb-2">
              Prepared For:
            </span>
            <span className="font-medium text-base">
              {client?.company ||
                client?.firstName + " " + client?.lastName ||
                " "}
            </span>
            <span>{client?.street && `${client?.street}`}</span>
            <span>
              {client?.city && `${client?.city}`},{" "}
              {client?.state && `${client?.state}`}{" "}
              {client?.zip && `${client?.zip}`}
            </span>
            {client?.email && <span className="text-sm">{client.email}</span>}
            {client?.phone && <span className="text-sm">{client.phone}</span>}
          </div>
          <div className="flex flex-col justify-center items-end">
            {logoDarkUrl ? (
              // biome-ignore lint/performance/noImgElement: branding URL is dynamic.
              <img
                src={logoDarkUrl}
                alt={companyName || "Company logo"}
                className="h-24 w-auto object-contain"
              />
            ) : (
              <span className="font-heading font-semibold text-xl">
                {companyName ?? "Your Company"}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
      {/* Sections — one card per section */}
      {rooms.length === 0 ? (
        <Card>
          <p className="rounded border border-border border-dashed bg-neutral-50 p-8 text-center text-muted-foreground text-sm">
            This project has no sections yet. Add sections and items in the
            Items tab to populate the proposal.
          </p>
        </Card>
      ) : (
        <>
          {rooms.map((room) => {
            const roomItems = items.filter(
              (item) => item.roomId === room.roomId,
            );
            const subtotal = roomItems.reduce(
              (acc, item) => acc + lineTotal(item),
              0,
            );
            return (
              <Card key={room.roomId} className="flex flex-col">
                <CardHeader className="flex flex-col gap-1 border-border border-b">
                  <h2 className="font-heading font-semibold text-lg">
                    {room.name}
                  </h2>
                  {room.description && (
                    <p className="text-muted-foreground text-xs italic pl-4">
                      <span className="font-bold mr-2">—</span>{" "}
                      {room.description}
                    </p>
                  )}
                </CardHeader>

                <CardContent className="px-0">
                  {roomItems.length === 0 ? (
                    <p className="px-6 py-2 text-muted-foreground text-sm">
                      No items in this section.
                    </p>
                  ) : (
                    <ProposalItemsTable
                      items={roomItems}
                      vendors={vendors}
                      layout={project.itemColumnLayout}
                    />
                  )}
                </CardContent>
                <CardFooter className="justify-end gap-12">
                  <div className="flex flex-col items-center gap-1 text-xl">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider">
                      Items
                    </span>
                    {roomItems.length}
                  </div>
                  <div className="flex flex-col items-center gap-1 text-xl">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider">
                      Section Total
                    </span>
                    {formatCurrency(subtotal, { noDecimals: true })}
                  </div>
                </CardFooter>
              </Card>
            );
          })}

          {/* Summary */}
          <Card className="flex flex-col items-end gap-1">
            <CardContent className="flex flex-col items-end gap-4">
              <div className="flex w-full max-w-xs items-center justify-between text-muted-foreground gap-8 text-sm">
                <span>Subtotal</span>
                <span>{formatCurrency(grandTotal, { noDecimals: true })}</span>
              </div>
              <div className="flex w-full max-w-xs items-center justify-between font-semibold text-lg gap-8">
                <span>Total</span>
                <span>{formatCurrency(grandTotal, { noDecimals: true })}</span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
