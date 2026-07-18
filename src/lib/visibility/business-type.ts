import { z } from "zod";
import { generateJson } from "@/lib/llm/client";
import type { BusinessType, BusinessTypeResult, PageSnapshot } from "./types";

/**
 * V0.4: business-type detector. Deterministic signal scan over the homepage
 * snapshot using the signal table from `inspiration-code/geo/SKILL.md`
 * ("Business Type Detection"), with an optional cheap LLM fallback when the
 * deterministic result is low-confidence or ambiguous.
 */

interface SignalContext {
  /** Lowercased visible page text. */
  text: string;
  /** Lowercased internal link URLs + raw HTML (for embeds/paths). */
  urls: string;
  html: string;
  /** Lowercased JSON-LD @type values. */
  schemaTypes: string[];
  metaKeys: string[];
}

type Signal = { name: string; match: (ctx: SignalContext) => boolean };

const PHONE_RE = /(\+\d{1,2}\s?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]?\d{4}/;

const SIGNALS: Record<Exclude<BusinessType, "other">, Signal[]> = {
  saas: [
    { name: "pricing page", match: (c) => c.urls.includes("/pricing") || c.text.includes("pricing") },
    { name: "sign up", match: (c) => c.text.includes("sign up") || c.urls.includes("/signup") },
    { name: "free trial", match: (c) => c.text.includes("free trial") },
    { name: "/app or /dashboard", match: (c) => c.urls.includes("/app") || c.urls.includes("/dashboard") },
    { name: "api docs", match: (c) => c.urls.includes("/docs") || c.urls.includes("/api") || c.text.includes("api documentation") },
    { name: "SoftwareApplication schema", match: (c) => c.schemaTypes.includes("softwareapplication") },
  ],
  local: [
    { name: "phone number", match: (c) => PHONE_RE.test(c.text) || c.html.includes('href="tel:') },
    { name: "address", match: (c) => c.schemaTypes.includes("postaladdress") || /\b(street|avenue|blvd|boulevard|suite|ste\.)\b/.test(c.text) },
    { name: "near me", match: (c) => c.text.includes("near me") },
    { name: "maps embed", match: (c) => c.html.includes("google.com/maps") || c.html.includes("maps.googleapis") },
    { name: "service area", match: (c) => c.text.includes("service area") || c.text.includes("we serve") || c.text.includes("serving ") },
    { name: "LocalBusiness schema", match: (c) => c.schemaTypes.includes("localbusiness") },
  ],
  ecommerce: [
    { name: "product pages", match: (c) => c.urls.includes("/product") || c.urls.includes("/shop") || c.urls.includes("/collections") },
    { name: "cart", match: (c) => c.urls.includes("/cart") || c.text.includes("checkout") },
    { name: "add to cart", match: (c) => c.text.includes("add to cart") || c.text.includes("add to bag") },
    { name: "price elements", match: (c) => /[$€£]\s?\d/.test(c.text) },
    { name: "Product schema", match: (c) => c.schemaTypes.includes("product") },
  ],
  publisher: [
    { name: "blog", match: (c) => c.urls.includes("/blog") || c.text.includes("blog") },
    { name: "articles", match: (c) => c.urls.includes("/article") || c.text.includes("latest articles") },
    { name: "bylines", match: (c) => c.metaKeys.includes("author") || /\bby [a-z]+ [a-z]+\b/.test(c.text) },
    { name: "publication dates", match: (c) => c.metaKeys.includes("article:published_time") || c.html.includes("<time") },
    { name: "Article schema", match: (c) => c.schemaTypes.some((t) => t === "article" || t === "newsarticle" || t === "blogposting") },
  ],
  agency: [
    { name: "portfolio", match: (c) => c.urls.includes("/portfolio") || c.text.includes("portfolio") },
    { name: "case studies", match: (c) => c.text.includes("case stud") || c.urls.includes("/case-stud") },
    { name: "our services", match: (c) => c.text.includes("our services") || c.urls.includes("/services") },
    { name: "client logos", match: (c) => c.text.includes("our clients") || c.text.includes("trusted by") },
    { name: "testimonials", match: (c) => c.text.includes("testimonial") },
  ],
};

const ALL_TYPES: BusinessType[] = ["saas", "local", "ecommerce", "publisher", "agency", "other"];

function collectSchemaTypes(structuredData: unknown[]): string[] {
  const types: string[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      const t = (node as Record<string, unknown>)["@type"];
      if (typeof t === "string") types.push(t.toLowerCase());
      if (Array.isArray(t)) t.forEach((v) => typeof v === "string" && types.push(v.toLowerCase()));
      for (const value of Object.values(node)) walk(value);
    }
  };
  walk(structuredData);
  return types;
}

/** Deterministic classification: score each type by matched signals. */
export function detectBusinessType(snapshot: PageSnapshot): BusinessTypeResult {
  const ctx: SignalContext = {
    text: snapshot.text_content.toLowerCase(),
    urls: snapshot.internal_links.map((l) => l.url.toLowerCase()).join(" "),
    html: snapshot.html.toLowerCase(),
    schemaTypes: collectSchemaTypes(snapshot.structured_data),
    metaKeys: Object.keys(snapshot.meta_tags),
  };

  const matches = Object.fromEntries(ALL_TYPES.map((t) => [t, [] as string[]])) as Record<
    BusinessType,
    string[]
  >;
  for (const [type, signals] of Object.entries(SIGNALS)) {
    for (const signal of signals) {
      if (signal.match(ctx)) matches[type as BusinessType].push(signal.name);
    }
  }

  const scored = (Object.entries(matches) as [BusinessType, string[]][])
    .map(([type, hit]) => ({ type, score: hit.length }))
    .sort((a, b) => b.score - a.score);
  const [top, second] = scored;

  if (top.score === 0) {
    return { type: "other", confidence: 0, matches };
  }
  // Confidence: how dominant the top type is over the runner-up (1 = unrivalled,
  // 0.5 = tied). Callers treat <0.6 as ambiguous.
  const confidence = top.score / (top.score + (second?.score ?? 0));
  return { type: top.type, confidence, matches };
}

const LLM_LABELS = z.object({ type: z.enum(["saas", "local", "ecommerce", "publisher", "agency", "other"]) });

/**
 * Deterministic first; a single cheap LLM `light` call only when the signal
 * scan is low-confidence or ambiguous. Falls back to the deterministic result
 * if the LLM is unavailable or returns garbage.
 */
export async function classifyBusinessType(snapshot: PageSnapshot): Promise<BusinessTypeResult> {
  const deterministic = detectBusinessType(snapshot);
  if (deterministic.confidence >= 0.6) return deterministic;

  try {
    const navText = snapshot.internal_links.map((l) => l.text).filter(Boolean).slice(0, 30).join(" | ");
    const { data } = await generateJson("light", [
      {
        role: "system",
        content:
          "Classify the website as one of: saas, local, ecommerce, publisher, agency, other. " +
          'Respond with JSON: {"type": "<label>"}',
      },
      {
        role: "user",
        content: `Title: ${snapshot.title ?? ""}\nDescription: ${snapshot.description ?? ""}\nNav: ${navText}`,
      },
    ], { schema: LLM_LABELS });
    const parsed = LLM_LABELS.safeParse(data);
    if (parsed.success) {
      return { ...deterministic, type: parsed.data.type, confidence: Math.max(deterministic.confidence, 0.6) };
    }
  } catch {
    // LLM fallback is best-effort; the deterministic result always stands.
  }
  return deterministic;
}

export interface RecommendationProfile {
  /** Schema.org types to generate/validate for this business type. */
  schemaTypes: string[];
  /** Optimization priorities downstream tickets surface as recommendations. */
  priorities: string[];
}

/** Per-type hints from geo/SKILL.md's "adjust recommendations" guidance. */
export function recommendationProfile(type: BusinessType): RecommendationProfile {
  switch (type) {
    case "saas":
      return {
        schemaTypes: ["SoftwareApplication", "Organization", "FAQPage"],
        priorities: ["comparison pages", "pricing transparency", "API/developer docs", "G2/Capterra presence"],
      };
    case "local":
      return {
        schemaTypes: ["LocalBusiness", "PostalAddress", "FAQPage"],
        priorities: ["Google Business Profile", "NAP consistency", "service-area pages", "local reviews"],
      };
    case "ecommerce":
      return {
        schemaTypes: ["Product", "Offer", "AggregateRating", "BreadcrumbList"],
        priorities: ["Product schema on every PDP", "review aggregation", "merchant feeds", "category page content"],
      };
    case "publisher":
      return {
        schemaTypes: ["Article", "Person", "BreadcrumbList"],
        priorities: ["author bios + bylines", "publication/updated dates", "topic hubs", "E-E-A-T signals"],
      };
    case "agency":
      return {
        schemaTypes: ["Organization", "Service", "Review"],
        priorities: ["case studies with outcomes", "service pages", "client proof", "team credentials"],
      };
    default:
      return {
        schemaTypes: ["Organization", "WebSite"],
        priorities: ["general GEO best practices", "clear entity definition", "citable content blocks"],
      };
  }
}
