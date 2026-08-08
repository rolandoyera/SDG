import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/legal-page";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Data Deletion Instructions",
  description: `How to request deletion of your data from ${SITE_NAME}.`,
};

export default function DataDeletionPage() {
  return (
    <LegalPage title="Data Deletion Instructions">
      <LegalSection heading="How to request deletion">
        <p>
          To have your personal data deleted from {SITE_NAME}&rsquo;s systems,
          email{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=Data%20deletion%20request`}
            className="text-neutral-200 underline underline-offset-2"
          >
            {CONTACT_EMAIL}
          </a>{" "}
          with the subject line <em>&ldquo;Data deletion request&rdquo;</em>{" "}
          from the email address associated with your account, or include that
          address in your message.
        </p>
      </LegalSection>

      <LegalSection heading="What happens next">
        <ul>
          <li>We will confirm receipt of your request.</li>
          <li>
            We will delete your personal data from our systems — including
            dashboard account data and stored contact information — within 30
            days.
          </li>
          <li>We will confirm by email once deletion is complete.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Facebook and Instagram data">
        <p>
          If you interacted with us through a Facebook or Instagram integration
          and want data obtained through Meta&rsquo;s platform deleted, the same
          process applies: email the address above and reference your Facebook
          or Instagram account. Data held by Meta itself is controlled through
          your Meta account settings.
        </p>
      </LegalSection>

      <LegalSection heading="Exceptions">
        <p>
          We may retain records we are legally required to keep (such as
          invoices) and data our clients control in their own accounts; in
          that case we will tell you what was retained and why, and direct your
          request to the responsible party where appropriate.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
