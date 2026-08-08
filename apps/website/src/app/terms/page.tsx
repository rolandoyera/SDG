import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/legal-page";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms that govern use of ${SITE_NAME}'s website and services.`,
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <LegalSection heading="Agreement">
        <p>
          These terms govern your use of the {SITE_NAME} website and the Lenis
          Studio dashboard (together, the &ldquo;Services&rdquo;). By using the
          Services you agree to these terms. Client engagements (design,
          development, and marketing work) are governed by the individual
          agreement signed for that engagement; where the two conflict, the
          signed agreement controls.
        </p>
      </LegalSection>

      <LegalSection heading="The services">
        <p>
          {SITE_NAME} provides web design, software development, and digital
          marketing services, and operates a client dashboard for managing
          projects, clients, and marketing activity. The Services are provided
          for business use.
        </p>
      </LegalSection>

      <LegalSection heading="Accounts">
        <p>
          Dashboard accounts are created for clients and their team members.
          You are responsible for keeping your login credentials confidential
          and for activity that occurs under your account. Tell us promptly if
          you believe your account has been compromised.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <ul>
          <li>Do not use the Services for anything unlawful.</li>
          <li>
            Do not attempt to access data belonging to another client or
            organization.
          </li>
          <li>
            Do not probe, disrupt, or reverse-engineer the Services or their
            infrastructure.
          </li>
        </ul>
        <p>
          We may suspend accounts that violate these rules while we investigate.
        </p>
      </LegalSection>

      <LegalSection heading="Your content">
        <p>
          Clients retain ownership of the data they store in the dashboard. You
          grant us the limited right to host and process that data as needed to
          provide the Services. We handle personal information as described in
          our privacy policy.
        </p>
      </LegalSection>

      <LegalSection heading="Our property">
        <p>
          The Services, including their software, design, and content (other
          than client data), belong to {SITE_NAME} and are protected by
          intellectual-property law. These terms grant no license beyond what
          is needed to use the Services normally.
        </p>
      </LegalSection>

      <LegalSection heading="Disclaimers">
        <p>
          The Services are provided &ldquo;as is.&rdquo; We work to keep them
          available and accurate but do not guarantee uninterrupted or
          error-free operation, and we are not responsible for the results of
          third-party platforms (such as search engines or advertising
          networks) that the Services interact with.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the fullest extent permitted by law, {SITE_NAME} is not liable for
          indirect, incidental, or consequential damages arising from use of
          the Services, and our total liability for any claim is limited to the
          amount you paid us for the Services in the twelve months before the
          claim arose.
        </p>
      </LegalSection>

      <LegalSection heading="Termination">
        <p>
          You may stop using the Services at any time. We may suspend or
          terminate access for violation of these terms or where required to
          protect the Services or other users. On termination of a client
          engagement, we will make the client&rsquo;s data available for export
          on request.
        </p>
      </LegalSection>

      <LegalSection heading="Governing law">
        <p>
          These terms are governed by the laws of the State of Florida, United
          States, without regard to conflict-of-law rules.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          We may update these terms from time to time; the date at the top
          reflects the latest revision. Continued use of the Services after a
          change means you accept the updated terms.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about these terms: {" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-neutral-200 underline underline-offset-2"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
