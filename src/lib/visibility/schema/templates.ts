/**
 * V3.3: JSON-LD template builders. Typed ports of the 6 reference templates in
 * `inspiration-code/schema/*.json` (+ FAQ/speakable), per `agents/geo-schema.md`
 * Step 7. Known values are filled from the snapshot; everything else uses the
 * `[REPLACE: …]` placeholder convention. Always JSON-LD, `@context: schema.org`.
 */

export const R = (label: string) => `[REPLACE: ${label}]`;

export interface SiteHints {
  origin: string;
  name: string;
  description: string;
  logo?: string;
}

export function organizationTemplate(h: SiteHints, sameAs: string[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${h.origin}/#organization`,
    name: h.name,
    url: h.origin,
    logo: { "@type": "ImageObject", url: h.logo ?? R("https://…/logo.png") },
    description: h.description || R("one-line company description"),
    sameAs,
    knowsAbout: [R("core topic 1"), R("core topic 2"), R("core topic 3")],
  };
}

export function localBusinessTemplate(h: SiteHints, sameAs: string[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${h.origin}/#localbusiness`,
    name: h.name,
    url: h.origin,
    description: h.description || R("what the business does"),
    telephone: R("+1-XXX-XXX-XXXX"),
    address: {
      "@type": "PostalAddress",
      streetAddress: R("street"),
      addressLocality: R("city"),
      addressRegion: R("state"),
      postalCode: R("zip"),
      addressCountry: R("US"),
    },
    openingHoursSpecification: [
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "09:00", closes: "17:00" },
    ],
    sameAs,
  };
}

export function articleTemplate(h: SiteHints, opts: { headline?: string; authorName?: string } = {}): object {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: opts.headline ?? R("article title"),
    description: R("article summary"),
    image: h.logo ?? R("https://…/featured.jpg"),
    datePublished: R("YYYY-MM-DD"),
    dateModified: R("YYYY-MM-DD"),
    author: {
      "@type": "Person",
      name: opts.authorName ?? R("author full name"),
      url: `${h.origin}/about/${R("author-slug")}`,
      jobTitle: R("author role"),
      knowsAbout: [R("expertise 1"), R("expertise 2")],
      sameAs: [R("https://www.linkedin.com/in/…"), R("https://twitter.com/…")],
    },
    publisher: {
      "@type": "Organization",
      "@id": `${h.origin}/#organization`,
      name: h.name,
      logo: { "@type": "ImageObject", url: h.logo ?? R("https://…/logo.png") },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": R("https://…/article-url") },
    speakable: { "@type": "SpeakableSpecification", cssSelector: [".article-summary", ".key-takeaway", "h2"] },
    inLanguage: "en-US",
  };
}

export function softwareApplicationTemplate(h: SiteHints, sameAs: string[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${h.origin}/#software`,
    name: h.name,
    url: h.origin,
    description: h.description || R("what the software does"),
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "AggregateOffer",
      lowPrice: R("0"),
      highPrice: R("99"),
      priceCurrency: "USD",
      offerCount: R("3"),
    },
    featureList: [R("feature 1"), R("feature 2"), R("feature 3")],
    sameAs: sameAs.length ? sameAs : [R("https://www.g2.com/products/…"), R("https://www.capterra.com/p/…")],
  };
}

export function productTemplate(h: SiteHints): object {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: R("product name"),
    url: `${h.origin}/products/${R("product-slug")}`,
    description: R("product description"),
    image: [R("https://…/product.jpg")],
    brand: { "@type": "Brand", name: h.name },
    sku: R("SKU"),
    offers: {
      "@type": "Offer",
      url: `${h.origin}/products/${R("product-slug")}`,
      price: R("00.00"),
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
    },
    aggregateRating: { "@type": "AggregateRating", ratingValue: R("4.6"), reviewCount: R("120"), bestRating: "5" },
  };
}

export function websiteSearchActionTemplate(h: SiteHints): object {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${h.origin}/#website`,
    name: h.name,
    url: h.origin,
    description: h.description || R("what the site is about"),
    publisher: { "@type": "Organization", "@id": `${h.origin}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${h.origin}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
    inLanguage: "en-US",
  };
}

export interface QA {
  question: string;
  answer: string;
}

export function faqTemplate(pairs: QA[]): object | null {
  if (pairs.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: pairs.map((p) => ({
      "@type": "Question",
      name: p.question,
      acceptedAnswer: { "@type": "Answer", text: p.answer },
    })),
  };
}
