/**
 * Centralized marketing/site metadata used by the public pages, the sitemap,
 * and per-route `metadata` exports. Keeping these in one place means the footer,
 * sitemap, and OpenGraph tags can never drift apart.
 */

export const SITE_URL = "https://seogeoaeo.ai";

/** Return a clean app origin so transactional links never contain a double slash. */
export function resolveSiteOrigin(configuredOrigin?: string | null): string {
  return (configuredOrigin?.trim() || SITE_URL).replace(/\/+$/, "");
}

export const SITE_NAME = "SeoGeoAeo AI";

export const SITE_DESCRIPTION =
  "SeoGeoAeo AI gives your business Claudia, an AI employee for organic growth. She finds and prepares SEO, AEO, and GEO work, asks before sensitive changes, and checks the results.";

/** Primary marketing nav, used by the public site header. */
export const NAV_LINKS = [
  { label: "How she works", href: "/#how-it-works" },
  { label: "What you get", href: "/#features" },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/#faq" },
] as const;

/** Grouped footer links. Internal anchors resolve on the landing page. */
export const FOOTER_LINKS = [
  {
    title: "Product",
    links: [
      { label: "How she works", href: "/#how-it-works" },
      { label: "What you get", href: "/#features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Integration guide", href: "/help/integrations" },
    ],
  },
  {
    title: "Where she wins",
    links: [
      { label: "Google & search", href: "/#features" },
      { label: "Answer boxes", href: "/#features" },
      { label: "AI assistants", href: "/#features" },
      { label: "Buyer-intent content", href: "/#features" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Sign in", href: "/login" },
      { label: "Put Claudia to work", href: "/login" },
      { label: "Contact", href: "/contact" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
] as const;
