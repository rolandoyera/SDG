"use client";

import { DashboardImage } from "@/components/dashboard-image";
import {
  FacebookIcon,
  GlobeIcon,
  InstagramIcon,
  PinterestIcon,
  XTwitterIcon,
  YoutubeIcon,
} from "@/components/icons/icons";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Vendor } from "@/lib/types";

import { vendorGradient } from "./vendor-gradient";
import { getDisplayUrl, getVendorSocialHrefs } from "./vendor-links";
import { DataField } from "@/components/ui/data-field";
import { formatVendorPhone } from "@/lib/utils";
import { AddressValue } from "@/components/ui/address-value";
import { formatVendorAddressLines } from "../_components/vendor-constants";

interface VendorHeroProps {
  vendor: Vendor;
}

export function VendorHero({ vendor }: VendorHeroProps) {
  const gradient = vendorGradient(vendor.name);
  const {
    websiteHref,
    instagramHref,
    pinterestHref,
    facebookHref,
    youtubeHref,
    xTwitterHref,
  } = getVendorSocialHrefs(vendor);

  const socialLinks = [
    { key: "website", href: websiteHref, Icon: GlobeIcon },
    { key: "instagram", href: instagramHref, Icon: InstagramIcon },
    { key: "pinterest", href: pinterestHref, Icon: PinterestIcon },
    { key: "facebook", href: facebookHref, Icon: FacebookIcon },
    { key: "youtube", href: youtubeHref, Icon: YoutubeIcon },
    { key: "xTwitter", href: xTwitterHref, Icon: XTwitterIcon },
  ];

  // Compose the address from the discrete fields, falling back to the deprecated
  // US-only fields on older docs. Display is multi-line; the stored
  // formattedAddress drives the Google Maps query.
  const addressLines = formatVendorAddressLines({
    addressLine1: vendor.addressLine1 ?? vendor.street,
    addressLine2: vendor.addressLine2,
    city: vendor.city,
    region: vendor.region ?? vendor.state,
    postalCode: vendor.postalCode ?? vendor.zip,
    country: vendor.country,
  });
  const addressText =
    vendor.formattedAddress?.trim() || addressLines.join(", ");

  return (
    <Card className="overflow-hidden pt-0">
      {/* Banner: hero image → gradient fallback */}
      <div className="relative flex aspect-5/4 w-full items-end overflow-hidden">
        {vendor.heroImageUrl ? (
          <DashboardImage
            priority
            src={vendor.heroImageUrl}
            alt={`${vendor.name} banner`}
            sizes="(min-width: 1024px) 75vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className={`absolute inset-0 bg-linear-to-br ${gradient}`} />
        )}

        {vendor.description && (
          <div className="absolute bottom-4 left-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded border border-white/10 bg-black/50 p-4 text-white shadow-lg backdrop-blur-md">
            <p className="line-clamp-4 text-white/90 text-xs leading-relaxed">
              {vendor.description}
            </p>
          </div>
        )}
      </div>

      {/* Name row */}
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1 w-full">
          <div className="grid grid-cols-2 gap-4 space-y-2">
            <DataField label="Account Number" empty="Not provided">
              {vendor.accountNumber}
            </DataField>
            <DataField label="Main Contact" empty="Not provided">
              {vendor.repName}
            </DataField>
            <DataField label="Email" empty="Not provided">
              {vendor.repEmail}
            </DataField>
            <DataField label="Phone" empty="Not provided">
              {vendor.repPhone
                ? formatVendorPhone(vendor.repPhone, vendor.repPhoneCountry)
                : undefined}
            </DataField>
            <DataField
              label="Address"
              empty="Not provided"
              className="min-h-21"
            >
              {addressLines.length > 0 && (
                <AddressValue lines={addressLines} query={addressText} />
              )}
            </DataField>
            <DataField
              label="Sourcing Notes"
              empty="Not provided"
              className="h-21"
            >
              {vendor.notes}
            </DataField>
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-center">
        <div className="flex h-6 items-center gap-3">
          {socialLinks.map(({ key, href, Icon }) =>
            href ? (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.currentTarget.blur()}
                    className="cursor-pointer text-muted-foreground transition-colors hover:text-primary border border-border bg-background dark:border-input dark:bg-input/30 rounded-full p-1 shadow"
                  >
                    <Icon strokeWidth={1.25} />
                  </a>
                </TooltipTrigger>
                <TooltipContent>{getDisplayUrl(href)}</TooltipContent>
              </Tooltip>
            ) : (
              <span
                key={key}
                className="cursor-not-allowed text-muted-foreground/20"
              >
                <Icon strokeWidth={1.5} />
              </span>
            ),
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
