import type { Metadata } from "next";
import { LegalShell, type LegalSection } from "@/components/marketing/legal-shell";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How seogeoaeo.ai collects, uses, and protects your data when you use the SEO·AEO·GEO suite.",
  alternates: { canonical: `${SITE_URL}/privacy` },
};

const sections: LegalSection[] = [
  {
    heading: "Information we collect",
    body: [
      "We collect only the information needed to provide, secure, and support the service: account details you provide when signing in, such as your name and email address.",
      "We also process the workspace content you choose to create or connect, such as brands, sites, topics, articles, and publishing-integration credentials, plus limited usage and technical data needed to operate and secure the service.",
      "When you submit our contact form, we use your account email address and collect the request category and message you provide so our support team can respond.",
    ],
  },
  {
    heading: "How we use your information",
    body: [
      "To provide the service: authenticating you, running audits, generating and publishing content, and processing billing.",
      "To improve reliability, performance, security, and the quality of our features.",
      "To communicate with you about your account, security, and important product changes.",
      "To respond to questions and requests you submit through our contact form.",
    ],
  },
  {
    heading: "Publishing integrations & credentials",
    body: [
      "When you connect a platform such as dev.to, WordPress, Ghost, or Hashnode, we store the credentials needed to publish on your behalf. Secrets are encrypted at rest and are never returned to the browser after they are saved.",
      "You can disconnect any integration at any time from your settings, which removes the stored credentials.",
    ],
  },
  {
    heading: "No sale of personal data",
    body: [
      "We do not sell or rent your personal information. We do not share your personal information or workspace content with third parties for their independent advertising or marketing purposes.",
      "We may use carefully selected service providers, such as authentication providers, Stripe for payments, cloud-hosting providers, and AI model providers. They process information only as needed to provide their service to us and to you, subject to their applicable terms and privacy practices.",
    ],
  },
  {
    heading: "Data retention",
    body: [
      "We keep your information for as long as your account is active or as needed to provide the service. You can request deletion of your account and associated data at any time.",
    ],
  },
  {
    heading: "Your rights",
    body: [
      "You may access, correct, export, or delete your personal information. To exercise these rights, submit a Privacy & data request through our Contact page and we will respond within a reasonable timeframe.",
    ],
  },
  {
    heading: "Changes to this policy",
    body: [
      "We may update this policy from time to time. When we make material changes, we will update the date above and, where appropriate, notify you in the app or by email.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      lastUpdated="July 21, 2026"
      intro="This Privacy Policy explains what information seogeoaeo.ai collects, how we use it, and the choices you have. By using the service you agree to the practices described here."
      sections={sections}
    />
  );
}
