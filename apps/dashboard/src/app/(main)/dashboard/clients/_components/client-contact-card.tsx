import { CircleAlert, Mail, Phone, User } from "lucide-react";
import { AddressValue, hasAddressLines } from "@/components/ui/address-value";
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
import { DataField } from "@/components/ui/data-field";

interface ClientContactCardProps {
  client: Client;
}

/** Contact credentials panel: email, phone, company, plus quick email/call actions. */
export function ClientContactCard({ client }: ClientContactCardProps) {
  return (
    <Card variant="panel">
      <CardHeader>
        <CardTitle>
          <User className="icons" />
          Client Information
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-6 text-sm lg:grid-cols-3 md:min-h-62">
        <DataField label="Contact" className="order-1 md:order-1">
          {client.firstName} {client.lastName}
        </DataField>
        <DataField
          label="Email Address"
          empty="Not provided"
          className="order-2 md:order-2"
        >
          {client.email && (
            <a
              href={`mailto:${client.email}`}
              className="group flex items-center gap-1.5 transition-colors hover:text-primary"
            >
              <p className="truncate group-hover:underline">{client.email}</p>
            </a>
          )}
        </DataField>
        <DataField
          label="Client #"
          empty="Not provided"
          className="order-4 md:order-3"
        >
          {client.clientCode}
        </DataField>
        <DataField
          label="Phone Number"
          empty="Not provided"
          className="order-3 md:order-4"
        >
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
        <DataField
          label="Tax ID"
          empty="Not provided"
          className="order-5 md:order-5"
        >
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
        <DataField
          label="Added"
          empty="Not provided"
          className="order-8 md:order-6"
        >
          {new Date(client.createdAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </DataField>
        <DataField
          label="Primary Address"
          empty="Not provided"
          className="h-21 order-7 md:order-7"
        >
          {hasAddressLines(client) && <AddressValue address={client} />}
        </DataField>
        <DataField label="Tax Status" className="order-6 md:order-8">
          {client.taxable ? <p>Taxable</p> : <p>Tax Exempt</p>}
        </DataField>
      </CardContent>
      <CardFooter className="justify-end gap-4 h-14">
        <a href={`mailto:${client.email}`} className="w-fit md:hidden">
          <Button size="sm" variant="secondary" className="w-full">
            <Mail className="icons" />
            Email
          </Button>
        </a>
        {client.phone ? (
          <a href={`tel:${normalizePhone(client.phone)}`} className="w-fit">
            <Button size="sm" variant="secondary" className="w-20 md:hidden">
              <Phone className="icons" />
              Call
            </Button>
          </a>
        ) : null}
      </CardFooter>
    </Card>
  );
}
