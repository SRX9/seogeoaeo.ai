import type { SchemaBlock } from "./detect";

/**
 * V3.1: schema validation. Deterministic syntax/property/nesting checks,
 * Google rich-result eligibility, and the deprecated/restricted table. Ports
 * `agents/geo-schema.md` Steps 2, 3, 5.
 */

export interface ValidatedSchema {
  block: SchemaBlock;
  primaryType: string;
  valid: boolean;
  errors: string[];
  richResultEligible: boolean;
  missingRequired: string[];
  missingRecommended: string[];
  deprecated: boolean;
  deprecatedNote?: string;
}

/** Google rich-result requirements (Step 3, 78-94). */
const RICH_RESULT: Record<string, { required: string[]; recommended: string[] }> = {
  Article: { required: ["headline", "image", "datePublished", "author"], recommended: ["dateModified", "publisher"] },
  NewsArticle: { required: ["headline", "image", "datePublished", "author"], recommended: ["dateModified", "publisher"] },
  BlogPosting: { required: ["headline", "image", "datePublished", "author"], recommended: ["dateModified", "publisher"] },
  BreadcrumbList: { required: ["itemListElement"], recommended: [] },
  FAQPage: { required: ["mainEntity"], recommended: [] },
  LocalBusiness: { required: ["name", "address", "telephone"], recommended: ["openingHoursSpecification", "sameAs"] },
  Organization: { required: ["name", "url", "logo"], recommended: ["sameAs", "description"] },
  Person: { required: ["name"], recommended: ["url", "sameAs", "jobTitle"] },
  Product: { required: ["name", "image", "offers"], recommended: ["aggregateRating", "review", "brand"] },
  Review: { required: ["itemReviewed", "reviewRating", "author"], recommended: [] },
  WebSite: { required: ["url"], recommended: ["potentialAction"] },
  VideoObject: { required: ["name", "description", "thumbnailUrl", "uploadDate"], recommended: [] },
  Event: { required: ["name", "startDate", "location"], recommended: ["eventAttendanceMode"] },
  Recipe: { required: ["name", "image", "author", "datePublished"], recommended: ["prepTime", "cookTime"] },
  SoftwareApplication: { required: ["name", "offers", "applicationCategory"], recommended: ["aggregateRating"] },
  Course: { required: ["name", "description", "provider"], recommended: [] },
};

/** Deprecated / restricted schemas (Step 5, 195-201). */
const DEPRECATED: Record<string, string> = {
  HowTo: "Removed from Google rich results (Sep 2023): no search benefit.",
  FAQPage: "Rich results restricted to gov/health authorities (Aug 2023); still useful for AI Q&A.",
  SpecialAnnouncement: "Deprecated (COVID-era): no longer supported.",
  CourseInfo: "Deprecated: replaced by the Course schema.",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
const PLACEHOLDER = /YOUR_|YOURDOMAIN|\[REPLACE|X{3,}|YYYY-MM-DD/;

function isAbsoluteUrl(v: unknown): boolean {
  return typeof v === "string" && /^https?:\/\//i.test(v);
}

function validateJsonLd(block: SchemaBlock, type: string): Omit<ValidatedSchema, "block" | "primaryType"> {
  const raw = (block.raw ?? {}) as Record<string, unknown>;
  // A @graph block validates its nodes elsewhere; validate the node carrying this type.
  const node =
    type in raw || raw["@type"]
      ? raw
      : (((raw["@graph"] as unknown[]) ?? []).find(
          (n) => typeof n === "object" && n !== null && String((n as Record<string, unknown>)["@type"]).includes(type),
        ) as Record<string, unknown>) ?? raw;

  const errors: string[] = [];

  const context = raw["@context"] ?? node["@context"];
  if (!context || !String(context).includes("schema.org")) {
    errors.push("Missing or invalid @context (should be https://schema.org)");
  }
  if (!node["@type"]) errors.push("Missing @type");

  // Nesting: author must be an object (Person/Organization), not a bare string.
  if ("author" in node && typeof node["author"] === "string") {
    errors.push("author should be a Person/Organization object, not a string");
  }
  // ISO-8601 dates.
  for (const key of ["datePublished", "dateModified", "startDate", "uploadDate"]) {
    const v = node[key];
    if (typeof v === "string" && !ISO_DATE.test(v)) errors.push(`${key} is not ISO-8601`);
  }
  // Absolute URLs where a URL is expected.
  for (const key of ["url", "@id"]) {
    const v = node[key];
    if (typeof v === "string" && v && !isAbsoluteUrl(v) && !v.startsWith("#")) {
      errors.push(`${key} should be an absolute URL`);
    }
  }
  // Placeholder / empty values.
  for (const [key, v] of Object.entries(node)) {
    if (typeof v === "string" && (v.trim() === "" || PLACEHOLDER.test(v))) {
      errors.push(`Placeholder or empty value for "${key}"`);
      break;
    }
  }

  const spec = RICH_RESULT[type];
  const missingRequired = spec ? spec.required.filter((p) => node[p] == null) : [];
  const missingRecommended = spec ? spec.recommended.filter((p) => node[p] == null) : [];
  const restricted = type === "FAQPage" || type === "HowTo";
  const richResultEligible = !!spec && missingRequired.length === 0 && !restricted;

  return {
    valid: errors.length === 0,
    errors,
    richResultEligible,
    missingRequired,
    missingRecommended,
    deprecated: type in DEPRECATED,
    deprecatedNote: DEPRECATED[type],
  };
}

export function validateSchema(blocks: SchemaBlock[]): ValidatedSchema[] {
  return blocks.map((block) => {
    const primaryType = block.types[0] ?? "Unknown";
    if (block.format !== "json-ld") {
      // Microdata/RDFa can't be deeply validated; flag migration to JSON-LD.
      return {
        block,
        primaryType,
        valid: true,
        errors: [],
        richResultEligible: false,
        missingRequired: [],
        missingRecommended: [],
        deprecated: primaryType in DEPRECATED,
        deprecatedNote: DEPRECATED[primaryType],
      };
    }
    return { block, primaryType, ...validateJsonLd(block, primaryType) };
  });
}
