import { buildContractEmailHtml } from "@/server/contract-email-template";
import { buildContractSignedEmailHtml } from "@/server/contract-signed-email-template";

// Shared mock recipient/company data so both previews read as the same fictional
// engagement. The templates are pure string builders, so this renders the exact
// production HTML — no live contract or Brevo send required.
const MOCK = {
  clientName: "Jordan Avery",
  companyName: "Sarvian Design Group",
  companyPhone: "(305) 555-0199",
  companyPhoneTel: "+13055550199",
  // Dark logo (for the email's light/cream header). Root-relative resolves against
  // the dashboard origin inside the preview iframe; a real send uses the org's
  // configured absolute `logoDarkUrl`.
  logoUrl: "/brands/app.sarviandg.com/logo-dark.svg",
};

/** One labelled email preview: the rendered HTML in an iframe + its source note. */
function EmailPreview({
  title,
  description,
  source,
  html,
}: {
  title: string;
  description: string;
  source: string;
  html: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="font-medium text-sm">{title}</h3>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <div className="overflow-hidden rounded border bg-card">
        <iframe
          title={title}
          srcDoc={html}
          className="h-[680px] w-full border-0"
        />
      </div>
      <code className="text-[11px] text-muted-foreground">{source}</code>
    </div>
  );
}

/**
 * Gallery of the contract transactional emails, rendered from the real templates
 * with mock data so the branded layout can be reviewed in one place.
 */
export function EmailGallery() {
  const readyToSign = buildContractEmailHtml({
    ...MOCK,
    portalUrl: "https://studio.sarviandg.com/portal/EXAMPLE-TOKEN",
    expirationDays: 30,
  });

  const signedConfirmation = buildContractSignedEmailHtml({
    ...MOCK,
    fileName: "Signed Contract - Avery Residence.pdf",
  });

  return (
    <div className="flex flex-col gap-10">
      <EmailPreview
        title="Contract ready to sign"
        description="Sent when a draft is sent for signature, with the secure signing link. The header shows the org's configured dark logo, falling back to the company name when no absolute logo URL is set."
        source="buildContractEmailHtml — src/server/contract-email-template.ts"
        html={readyToSign}
      />
      <EmailPreview
        title="Signed confirmation"
        description="Sent once the contract is fully executed. The executed PDF is attached to the real email (attachments aren't shown in this preview)."
        source="buildContractSignedEmailHtml — src/server/contract-signed-email-template.ts"
        html={signedConfirmation}
      />
    </div>
  );
}
