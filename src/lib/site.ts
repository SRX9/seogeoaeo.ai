/**
 * Centralized marketing/site metadata used by the public pages, the sitemap,
 * and per-route `metadata` exports. Keeping these in one place means the footer,
 * sitemap, and OpenGraph tags can never drift apart.
 */

export const SITE_URL = "https://seogeoaeo.ai";

export const SITE_NAME = "seogeoaeo.ai";

export const SITE_DESCRIPTION =
  "Hire Claudia — an autonomous AI employee who audits your visibility across " +
  "Google and AI assistants, fixes what she can, writes brand-tuned content, " +
  "and proves the gain. You pay, connect, and approve.";

/** Primary marketing nav, used by the public site header. */
export const NAV_LINKS = [
  { label: "How she works", href: "/#how-it-works" },
  { label: "What she does", href: "/#features" },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/#faq" },
] as const;

/** Grouped footer links. Internal anchors resolve on the landing page. */
export const FOOTER_LINKS = [
  {
    title: "Product",
    links: [
      { label: "How she works", href: "/#how-it-works" },
      { label: "What she does", href: "/#features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Publishing", href: "/#publish" },
      { label: "Integration guide", href: "/help/integrations" },
    ],
  },
  {
    title: "Where she wins",
    links: [
      { label: "Google & search", href: "/#features" },
      { label: "Answer boxes", href: "/#features" },
      { label: "AI assistants", href: "/#features" },
      { label: "Visibility score", href: "/#features" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Sign in", href: "/login" },
      { label: "Hire Claudia", href: "/login" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
] as const;
