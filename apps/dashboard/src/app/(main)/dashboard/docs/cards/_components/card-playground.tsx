"use client";

import { CircleAlert, ExternalLink, Mail, Phone, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Client } from "@/lib/types";
import { formatPhone, formatTaxId, normalizePhone } from "@/lib/utils";

import { DataField } from "./data-field";
import { ViewportFrame } from "./viewport-frame";

/** Mock client used to populate the card while we iterate on the theme. */
const mockClient: Client = {
  uid: "mock-client",
  organizationId: "mock-org",
  isCompany: false,
  firstName: "Jordan",
  lastName: "Avery",
  email: "jordan.avery@example.com",
  phone: "2125550143",
  company: "Avery Interiors",
  taxId: "",
  taxable: false,
  street: "415 Riverside Dr",
  city: "New York",
  state: "NY",
  zip: "10025",
  country: "US",
  createdAt: Date.now(),
};

/**
 * Inlined copy of the client contact card. This is a sandbox — edit freely to
 * develop a consistent card theme without touching the production component.
 */
function ContactCard({ client }: { client: Client }) {
  const hasAddress = Boolean(
    client.street ?? client.city ?? client.state ?? client.zip,
  );
  const hasCityLine = Boolean(client.city ?? client.state ?? client.zip);

  return (
    <Card variant="panel">
      <CardHeader>
        <CardTitle>
          <Users className="icons" />
          Client Information
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-x-6 gap-y-6.5 text-sm sm:grid-cols-2">
          <div className="flex flex-col gap-6.5">
            <DataField
              label="Primary Address"
              empty="Not provided"
              className="h-21"
            >
              {hasAddress && (
                <div className="flex flex-col">
                  {client.street && <span>{client.street}</span>}
                  {hasCityLine && (
                    <span className="mt-0.5">
                      {[
                        client.city,
                        [client.state, client.zip].filter(Boolean).join(" "),
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  )}
                  {(() => {
                    const fullAddress = [
                      client.street,
                      client.city,
                      client.state,
                      client.zip,
                    ]
                      .filter(Boolean)
                      .join(", ");
                    return (
                      fullAddress && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 flex w-fit items-center gap-1 text-primary text-xs hover:underline"
                        >
                          google maps
                          <ExternalLink className="size-3" />
                        </a>
                      )
                    );
                  })()}
                </div>
              )}
            </DataField>

            <DataField label="Tax ID" empty="Not provided">
              {client.taxId ? (
                <p>{formatTaxId(client.taxId)}</p>
              ) : !client.taxable ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="flex w-fit items-center gap-1.5 text-yellow-600 text-sm">
                        <span className="relative flex size-4 items-center justify-center">
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-yellow-500/60" />
                          <CircleAlert className="relative size-4" />
                        </span>
                      </p>
                    </TooltipTrigger>
                    <TooltipContent>
                      Client is listed as tax exempt but tax # is not on file.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
            </DataField>

            <DataField label="Tax Status">
              {client.taxable ? <p>Taxable</p> : <p>Tax Exempt</p>}
            </DataField>
          </div>

          {/* Right column: direct contact details */}
          <div className="flex flex-col gap-8">
            <DataField label="Contact">
              {client.firstName} {client.lastName}
            </DataField>

            <DataField label="Email Address" empty="Not provided">
              {client.email && (
                <a
                  href={`mailto:${client.email}`}
                  className="group flex items-center gap-1.5 transition-colors hover:text-primary"
                >
                  <p className="truncate group-hover:underline">
                    {client.email}
                  </p>
                </a>
              )}
            </DataField>

            <DataField label="Phone Number" empty="Not provided">
              {client.phone && (
                <a
                  href={`tel:${normalizePhone(client.phone)}`}
                  className="group flex items-center gap-1.5 transition-colors hover:text-primary"
                >
                  <span className="group-hover:underline">
                    {formatPhone(client.phone)}
                  </span>
                </a>
              )}
            </DataField>
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-4 h-15">
        <div className="flex gap-4 md:hidden">
          <a href={`mailto:${client.email}`} className="w-fit">
            <Button size="lg" variant="secondary" className="w-full text-xs">
              <Mail className="size-3.5" />
              Send Email
            </Button>
          </a>
          {client.phone ? (
            <a href={`tel:${normalizePhone(client.phone)}`} className="w-fit">
              <Button size="lg" variant="secondary" className="w-20 text-xs">
                <Phone className="size-3.5" />
                Call
              </Button>
            </a>
          ) : null}
        </div>
      </CardFooter>
    </Card>
  );
}

/** Preview viewports — widths chosen to straddle Tailwind's sm/lg breakpoints. */
const VIEWPORTS = [
  { name: "Desktop", width: 1280 },
  { name: "Tablet", width: 768 },
  { name: "Mobile", width: 375 },
] as const;

/**
 * Sandbox for developing a consistent card theme. Renders an inlined copy of a
 * real app card with mock data at mobile, tablet, and desktop viewport widths
 * at once. Each width lives in its own iframe so Tailwind breakpoints resolve
 * for real, and all three update live as you edit the card.
 */
export function CardPlayground() {
  return (
    <div className="mt-4 flex flex-col gap-8">
      {VIEWPORTS.map((viewport) => (
        <div key={viewport.name} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{viewport.name}</span>
            <code className="text-[11px] text-muted-foreground">
              {viewport.width}px
            </code>
          </div>
          <div className="overflow-x-auto rounded border bg-muted/30 p-4">
            <ViewportFrame width={viewport.width}>
              <div className="p-4">
                <ContactCard client={mockClient} />
              </div>
            </ViewportFrame>
          </div>
        </div>
      ))}
    </div>
  );
}
