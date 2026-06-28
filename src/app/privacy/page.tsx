import type { Metadata } from "next";
import { LegalShell, type LegalSection } from "@/components/marketing/legal-shell";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy — seogeoaeo.ai",
  description:
    "How seogeoaeo.ai collects, uses, and protects your data when you use the SEO·AEO·GEO suite.",
  alternates: { canonical: `${SITE_URL}/privacy` },
};

const sections: LegalSection[] = [
  {
    heading: "Information we collect",
    body: [
      "Account information you provide when you sign in with Google or GitHub, such as your name and email address.",
      "Workspace content you create or connect, including the brands, sites, topics, and articles you set up, and the credentials you supply for publishing integrations.",
      "Usage data such as the actions you take in the app and basic technical information (browser, device, and log data) needed to operate and secure the service.",
    ],
  },
  {
    heading: "How we use your information",
    body: [
      "To provide the service — authenticating you, running audits, generating and publishing content, and processing billing.",
      "To improve reliability, performance, and the quality of our features.",
      "To communicate with you about your account, security, and important product changes.",
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
    heading: "Third-party services",
    body: [
      "We rely on trusted providers to operate the product, including authentication providers, a payments processor (Stripe), cloud hosting, and AI model providers used to research and generate content. These providers process data only as needed to deliver their part of the service.",
      "We do not sell your personal information.",
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
      "You may access, correct, export, or delete your personal information. To exercise these rights, contact us using the email below and we will respond within a reasonable timeframe.",
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
      lastUpdated="June 28, 2026"
      intro="This Privacy Policy explains what information seogeoaeo.ai collects, how we use it, and the choices you have. By using the service you agree to the practices described here."
      sections={sections}
    />
  );
}
