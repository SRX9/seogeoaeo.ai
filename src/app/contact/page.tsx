import type { Metadata } from "next";
import { LegalShell, type LegalSection } from "@/components/marketing/legal-shell";
import { ContactForm } from "@/components/marketing/contact-form";
import { getSession } from "@/lib/auth/session";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with the SeoGeoAeo AI team for account, billing, privacy, or product questions.",
  alternates: { canonical: `${SITE_URL}/contact` },
};

const sections: LegalSection[] = [
  {
    heading: "What happens next",
    body: [
      "Your request is stored securely for our support team and sent to the configured support inbox. We will reply to the email address associated with your account.",
    ],
  },
  {
    heading: "Privacy and data requests",
    body: [
      "Choose Privacy & data in the form above to request access to, correction of, export of, or deletion of your personal information. We may need to verify your identity before completing a request.",
    ],
  },
];

export default async function ContactPage() {
  const session = await getSession();

  return (
    <LegalShell
      title="Contact"
      lastUpdated="July 21, 2026"
      intro="Need help with SeoGeoAeo AI? We are happy to point you in the right direction."
      sections={sections}
      category="Support"
    >
      <ContactForm isAuthenticated={Boolean(session)} />
    </LegalShell>
  );
}
