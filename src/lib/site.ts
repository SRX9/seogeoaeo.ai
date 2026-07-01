/**
 * Centralized marketing/site metadata used by the public pages, the sitemap,
 * and per-route `metadata` exports. Keeping these in one place means the footer,
 * sitemap, and OpenGraph tags can never drift apart.
 */

export const SITE_URL = "https://seogeoaeo.ai";

export const SITE_NAME = "seogeoaeo.ai";

export const SITE_DESCRIPTION =
  "The all-in-one SEO·AEO·GEO suite that measures how findable your site is, " +
  "fixes the gaps, and ships search-optimized articles to every platform you " +
  "publish on — on autopilot.";

/** Primary marketing nav, used by the public site header. */
export const NAV_LINKS = [
  { label: "Features", href: "/#features" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/#faq" },
] as const;

/** Grouped footer links. Internal anchors resolve on the landing page. */
export const FOOTER_LINKS = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "How it works", href: "/#how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "Publishing", href: "/#publish" },
    ],
  },
  {
    title: "Engines",
    links: [
      { label: "SEO", href: "/#features" },
      { label: "AEO — answer engines", href: "/#features" },
      { label: "GEO — AI assistants", href: "/#features" },
      { label: "Visibility audit", href: "/#features" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Sign in", href: "/login" },
      { label: "Get started free", href: "/login" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
] as const;
