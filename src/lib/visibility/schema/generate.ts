import { extractContentBlocks } from "../blocks";
import type { BusinessType, PageSnapshot } from "../types";
import type { SameAsEntry, SchemaPresence } from "./score";
import {
  articleTemplate,
  faqTemplate,
  localBusinessTemplate,
  organizationTemplate,
  productTemplate,
  type QA,
  R,
  type SiteHints,
  softwareApplicationTemplate,
  websiteSearchActionTemplate,
} from "./templates";

/**
 * V3.3 — pick + fill the JSON-LD templates a page is missing, business-type
 * aware (`agents/geo-schema.md` Step 7). Each fix is stored as a `fix_payload`
 * for V7.2 auto-insert. Generation is deterministic (no LLM needed).
 */

export interface SchemaFix {
  schema: string;
  jsonLd: object;
}

/** Priority sameAs platforms we always want on an Organization. */
const PRIORITY: [platform: string, placeholder: string][] = [
  ["Wikipedia", "https://en.wikipedia.org/wiki/…"],
  ["LinkedIn", "https://www.linkedin.com/company/…"],
  ["YouTube", "https://www.youtube.com/@…"],
  ["Crunchbase", "https://www.crunchbase.com/organization/…"],
  ["Wikidata", "https://www.wikidata.org/wiki/…"],
  ["X/Twitter", "https://twitter.com/…"],
];

export function siteHints(snapshot: PageSnapshot): SiteHints {
  const origin = (() => {
    try {
      return new URL(snapshot.url).origin;
    } catch {
      return snapshot.url;
    }
  })();
  const name =
    snapshot.title?.split(/[|\-–—]/)[0].trim() ||
    snapshot.h1_tags[0]?.trim() ||
    new URL(origin).host;
  return {
    origin,
    name,
    description: snapshot.description?.trim() ?? "",
    logo: snapshot.meta_tags["og:image"],
  };
}

/** Existing linked sameAs URLs + `[REPLACE:]` placeholders for missing priorities. */
function sameAsSuggestions(sameAsAudit: SameAsEntry[]): string[] {
  const existing = sameAsAudit.filter((e) => e.linked && e.url).map((e) => e.url as string);
  const missing = PRIORITY.filter(([p]) => !sameAsAudit.find((e) => e.platform === p)?.linked).map(
    ([, placeholder]) => R(placeholder),
  );
  return [...existing, ...missing];
}

/** Question-style headings on the page → FAQ entries (AEO answer surface). */
function extractQA(html: string): QA[] {
  return extractContentBlocks(html)
    .filter((b) => b.heading?.trim().endsWith("?"))
    .slice(0, 6)
    .map((b) => ({ question: b.heading!.trim(), answer: b.content.slice(0, 300).trim() }));
}

export function generateSchema(opts: {
  present: SchemaPresence;
  sameAsAudit: SameAsEntry[];
  types: string[];
  businessType: BusinessType;
  snapshot: PageSnapshot;
}): SchemaFix[] {
  const { present, sameAsAudit, types, businessType, snapshot } = opts;
  const h = siteHints(snapshot);
  const sameAs = sameAsSuggestions(sameAsAudit);
  const fixes: SchemaFix[] = [];
  const push = (schema: string, jsonLd: object) => fixes.push({ schema, jsonLd });

  // Primary entity identity.
  if (businessType === "local" && !present.localBusiness) {
    push("LocalBusiness", localBusinessTemplate(h, sameAs));
  } else if (!present.organization) {
    push("Organization", organizationTemplate(h, sameAs));
  } else {
    // Present but sameAs incomplete → offer the enriched block.
    const linked = sameAsAudit.filter((e) => e.linked).length;
    if (linked < 3) push("Organization", organizationTemplate(h, sameAs));
  }

  if (!present.website) push("WebSite", websiteSearchActionTemplate(h));

  if (businessType === "saas" && !types.includes("SoftwareApplication")) {
    push("SoftwareApplication", softwareApplicationTemplate(h, sameAs));
  }
  if (businessType === "ecommerce" && !types.includes("Product")) {
    push("Product", productTemplate(h));
  }

  const wantArticle = businessType === "publisher" || present.article;
  if (wantArticle && (!present.article || !present.person || !present.speakable)) {
    push("Article", articleTemplate(h, { headline: snapshot.h1_tags[0], authorName: undefined }));
  }

  const faq = faqTemplate(extractQA(snapshot.html));
  if (faq) push("FAQPage", faq);

  return fixes;
}
