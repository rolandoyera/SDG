import type { Metadata } from "next";

import { LegalPage, LegalSection } from "@/components/legal-page";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE_NAME} collects, uses, and protects your information.`,
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <LegalSection heading="Who we are">
        <p>
          {SITE_NAME} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a web design and
          software studio based in the United States. This policy covers this
          website ({SITE_URL}) and the client tools we operate, including the
          Lenis Studio dashboard used by our clients to manage their business.
        </p>
      </LegalSection>

      <LegalSection heading="Information we collect">
        <ul>
          <li>
            <strong className="text-neutral-300">Contact information</strong> —
            name, email address, and phone number when you contact us or when a
            client account is created for you.
          </li>
          <li>
            <strong className="text-neutral-300">Account information</strong> —
            login credentials and profile details for users of the Lenis Studio
            dashboard, managed through Google Firebase Authentication.
          </li>
          <li>
            <strong className="text-neutral-300">Business data</strong> — the
            client, project, and marketing records our clients store in the
            dashboard in the course of using it.
          </li>
          <li>
            <strong className="text-neutral-300">Usage data</strong> — standard
            technical logs (IP address, browser type, pages visited) collected
            by our hosting providers to operate and secure the services.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="How we use it">
        <ul>
          <li>To provide and operate the website and the dashboard.</li>
          <li>To respond when you contact us.</li>
          <li>
            To run marketing campaigns on behalf of our clients through
            platforms such as Google Ads and Meta (Facebook and Instagram).
          </li>
          <li>To secure, debug, and improve our services.</li>
        </ul>
        <p>
          We do not sell personal information, and we do not use it for
          advertising unrelated to the services described here.
        </p>
      </LegalSection>

      <LegalSection heading="Third-party services">
        <p>
          We rely on a small number of service providers to run our services.
          Each processes data only as needed to provide its service:
        </p>
        <ul>
          <li>Google Firebase — authentication, database, and file storage.</li>
          <li>Vercel — website hosting and request logs.</li>
          <li>
            Google Ads and Meta advertising platforms — campaign management on
            behalf of clients, under those platforms&rsquo; own terms and
            privacy policies.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Data retention">
        <p>
          We keep personal information only as long as needed for the purposes
          above: account data for the life of the account, correspondence for as
          long as it is relevant, and technical logs for the retention window of
          the hosting provider. You can request deletion at any time (see
          below).
        </p>
      </LegalSection>

      <LegalSection heading="Security">
        <p>
          Data is transmitted over HTTPS and stored with providers (Google,
          Vercel) that maintain industry-standard security certifications.
          Access to client data is restricted to the people who need it to
          provide the service.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          You can request a copy of the personal information we hold about you,
          ask us to correct it, or ask us to delete it. Email{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-neutral-200 underline underline-offset-2"
          >
            {CONTACT_EMAIL}
          </a>{" "}
          and we will respond within 30 days. See our{" "}
          <a
            href="/data-deletion"
            className="text-neutral-200 underline underline-offset-2"
          >
            data deletion instructions
          </a>{" "}
          for details.
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          Our services are business tools and are not directed at children
          under 13. We do not knowingly collect information from children.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          If we change this policy we will update this page and the date at the
          top. Material changes affecting dashboard users will be communicated
          directly.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about this policy: {" "}
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
