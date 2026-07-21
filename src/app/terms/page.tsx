import type { Metadata } from "next";
import { LegalShell, type LegalSection } from "@/components/marketing/legal-shell";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that govern your use of seogeoaeo.ai and its SEO and AI visibility tools.",
  alternates: { canonical: `${SITE_URL}/terms` },
};

const sections: LegalSection[] = [
  {
    heading: "Acceptance of terms",
    body: [
      'By creating an account or using seogeoaeo.ai (the "service"), you agree to these Terms of Service. If you are using the service on behalf of an organization, you represent that you have authority to bind that organization.',
    ],
  },
  {
    heading: "Your account",
    body: [
      "You are responsible for activity that happens under your account and for keeping your sign-in method secure. You must provide accurate information and use the service in compliance with applicable laws.",
    ],
  },
  {
    heading: "Plans, credits & billing",
    body: [
      "Paid plans include a monthly allowance of credits that resets each billing cycle and does not roll over. One-time credit packs you purchase do not expire and stack on top of your plan.",
      "Subscriptions renew automatically until cancelled. You can cancel at any time and will retain access through the end of the period you have paid for.",
      "All fees, subscription payments, and credit purchases are final and non-refundable, except where a refund is required by applicable law. We do not provide refunds for unused time, unused credits, dissatisfaction with output, or results that do not meet your expectations.",
    ],
  },
  {
    heading: "Acceptable use",
    body: [
      "You agree not to use the service to produce or publish content that is unlawful, infringing, deceptive, or harmful, and not to abuse, reverse engineer, or disrupt the service or its infrastructure.",
      "You are responsible for the content you generate and publish through connected platforms, and for ensuring it complies with each platform's rules and with applicable law.",
    ],
  },
  {
    heading: "AI output is assistive, not a guarantee",
    body: [
      "The service uses AI to research, analyze, and generate content and recommendations. It is a helper for your work, not a replacement for your judgment or professional advice.",
      "AI output can be incomplete, inaccurate, outdated, offensive, or otherwise unsuitable. You must independently review, verify, edit, and approve every recommendation, generated asset, and proposed or published change before relying on it or making it available to others.",
      "Do not rely on the service as legal, financial, medical, tax, security, or other professional advice. Consult a qualified professional where appropriate.",
    ],
  },
  {
    heading: "Intellectual property",
    body: [
      "You retain ownership of the content you create with the service. We retain all rights to the software, design, and underlying technology. You grant us the limited rights needed to operate the service on your behalf.",
    ],
  },
  {
    heading: "No promised results",
    body: [
      'The service is provided "as is" and "as available" without warranties of any kind. We do not guarantee web traffic, search rankings, AI citations, leads, revenue, conversions, a specific business outcome, uninterrupted availability, or 100% accurate results.',
      "Search engines, AI platforms, publishers, and other third parties control their own systems and policies. Their decisions and changes are outside our control, so past or suggested performance is not a promise of future results.",
    ],
  },
  {
    heading: "Your responsibility & limitation of liability",
    body: [
      "You are responsible for deciding whether to use the service, approving all content and changes, maintaining backups, and checking that anything you publish or implement is appropriate for your products, business, audience, and legal obligations.",
      "To the maximum extent permitted by law, seogeoaeo.ai is not liable for losses or damages arising from your use of, reliance on, or inability to use the service or its AI output, including damage to products, websites, content, data, reputation, revenue, traffic, rankings, or business operations. This includes indirect, incidental, special, consequential, and lost-profit damages.",
    ],
  },
  {
    heading: "Changes & termination",
    body: [
      "We may update these terms or the service over time. Material changes will be reflected by the date above. We may suspend or terminate accounts that violate these terms, and you may stop using the service at any time.",
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      lastUpdated="July 21, 2026"
      intro="These terms govern your access to and use of seogeoaeo.ai. Please read them carefully: they form a binding agreement between you and seogeoaeo.ai."
      sections={sections}
    />
  );
}
