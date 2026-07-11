import type { Finding } from "../types";
import type { ValidatedSchema } from "./validate";

/**
 * V3.2: schema completeness score (0-100) + sameAs entity-graph audit. Ports
 * `agents/geo-schema.md` Step 8 point table (exact) and Step 4b sameAs priority.
 * sameAs is the single most impactful GEO property (cross-platform entity
 * resolution), so it drives both the score and the top recommendations.
 */

export interface SameAsEntry {
  platform: string;
  linked: boolean;
  url: string | null;
  valid: boolean;
}

export interface SchemaPresence {
  organization: boolean;
  localBusiness: boolean;
  person: boolean;
  article: boolean;
  website: boolean;
  speakable: boolean;
  breadcrumb: boolean;
}

export interface SchemaScoreResult {
  score: number;
  breakdown: Record<string, number>;
  sameAsAudit: SameAsEntry[];
  present: SchemaPresence;
  findings: Finding[];
}

/** ~14-platform sameAs priority list (Step 4b + adjacents). */
const PLATFORMS: [platform: string, pattern: RegExp][] = [
  ["Wikipedia", /wikipedia\.org/i],
  ["Wikidata", /wikidata\.org/i],
  ["LinkedIn", /linkedin\.com/i],
  ["YouTube", /youtube\.com|youtu\.be/i],
  ["Crunchbase", /crunchbase\.com/i],
  ["X/Twitter", /twitter\.com|x\.com/i],
  ["GitHub", /github\.com/i],
  ["Facebook", /facebook\.com/i],
  ["Instagram", /instagram\.com/i],
  ["Reddit", /reddit\.com/i],
  ["G2", /g2\.com/i],
  ["Capterra", /capterra\.com/i],
  ["Yelp", /yelp\.com/i],
  ["BBB", /bbb\.org/i],
];

/** Platforms whose absence we actively recommend fixing. */
const PRIORITY = ["Wikipedia", "LinkedIn", "YouTube", "Crunchbase", "Wikidata", "X/Twitter"];

type Node = { type: string; obj: Record<string, unknown> };

function flattenNodes(validated: ValidatedSchema[]): Node[] {
  const nodes: Node[] = [];
  for (const v of validated) {
    if (v.block.format !== "json-ld" || !v.block.raw) {
      nodes.push({ type: v.primaryType, obj: {} });
      continue;
    }
    const raw = v.block.raw as Record<string, unknown>;
    const graph = raw["@graph"];
    const entries = Array.isArray(graph) ? graph : [raw];
    for (const e of entries) {
      if (!e || typeof e !== "object") continue;
      const t = (e as Record<string, unknown>)["@type"];
      for (const tt of Array.isArray(t) ? t : [t]) {
        if (typeof tt === "string") nodes.push({ type: tt, obj: e as Record<string, unknown> });
      }
    }
  }
  return nodes;
}

const sameAsOf = (node?: Node): string[] => {
  const s = node?.obj["sameAs"];
  if (Array.isArray(s)) return s.filter((x): x is string => typeof x === "string");
  return typeof s === "string" ? [s] : [];
};

const isAbsolute = (v: string) => /^https?:\/\//i.test(v);

export function scoreSchema(validated: ValidatedSchema[]): SchemaScoreResult {
  const nodes = flattenNodes(validated);
  const find = (...types: string[]) => nodes.find((n) => types.includes(n.type));

  const orgNode = find("Organization", "LocalBusiness");
  const personNode = find("Person");
  const articleNode = find("Article", "NewsArticle", "BlogPosting");
  const websiteNode = find("WebSite");
  const breadcrumbNode = find("BreadcrumbList");
  const hasSpeakable = nodes.some((n) => "speakable" in n.obj);

  const present: SchemaPresence = {
    organization: !!find("Organization"),
    localBusiness: !!find("LocalBusiness"),
    person: !!personNode,
    article: !!articleNode,
    website: !!websiteNode,
    speakable: hasSpeakable,
    breadcrumb: !!breadcrumbNode,
  };

  // ── sameAs audit ────────────────────────────────────────────────────────
  const allSameAs = [...new Set([...sameAsOf(orgNode), ...sameAsOf(personNode)])];
  const sameAsAudit: SameAsEntry[] = PLATFORMS.map(([platform, pattern]) => {
    const url = allSameAs.find((u) => pattern.test(u)) ?? null;
    return { platform, linked: !!url, url, valid: url ? isAbsolute(url) : false };
  });
  const linkedCount = sameAsAudit.filter((e) => e.linked).length;
  const hasWikipedia = sameAsAudit.find((e) => e.platform === "Wikipedia")?.linked ?? false;
  const orgSameAsCount = sameAsOf(orgNode).length;

  // ── Point table (Step 8, exact) ─────────────────────────────────────────
  const b: Record<string, number> = {};
  b.organization = orgNode ? (orgSameAsCount >= 3 ? 20 : 10) : 0;

  b.article = 0;
  if (articleNode) {
    b.article = 8;
    const author = articleNode.obj["author"];
    const authorIsPerson =
      !!author && typeof author === "object" && String((author as Record<string, unknown>)["@type"]).includes("Person");
    if (authorIsPerson) b.article = Math.max(b.article, 12);
    if (articleNode.obj["dateModified"]) b.article = Math.max(b.article, 15);
  }

  b.person = 0;
  if (personNode) {
    b.person = 8;
    if (sameAsOf(personNode).length > 0) b.person = Math.max(b.person, 12);
    if (personNode.obj["jobTitle"] && personNode.obj["knowsAbout"]) b.person = Math.max(b.person, 15);
  }

  b.sameAs = linkedCount >= 5 && hasWikipedia ? 15 : linkedCount >= 3 ? 10 : linkedCount >= 1 ? 5 : 0;
  b.speakable = hasSpeakable ? 10 : 0;
  b.breadcrumb = breadcrumbNode ? 5 : 0;
  b.website = websiteNode && websiteNode.obj["potentialAction"] ? 5 : 0;
  // Quality points require schema to exist (an empty page earns none).
  b.noDeprecated = validated.length > 0 && !validated.some((v) => v.deprecated) ? 5 : 0;
  b.jsonLdFormat = validated.length > 0 && validated.every((v) => v.block.format === "json-ld") ? 5 : 0;
  b.validation = validated.length > 0 && validated.every((v) => v.valid) ? 5 : 0;

  const score = Math.min(100, Object.values(b).reduce((s, n) => s + n, 0));

  // ── Findings ────────────────────────────────────────────────────────────
  const findings: Finding[] = [];
  const gap = (severity: Finding["severity"], title: string, recommendation: string, schema: string) =>
    findings.push({
      pillar: "geo",
      category: "schema",
      severity,
      title,
      recommendation,
      fix_capability: "artifact",
      fix_payload: { kind: "schema_gap", schema },
    });

  if (!orgNode) {
    gap("critical", "No Organization schema", "Add Organization schema with sameAs links to the brand's official profiles.", "Organization");
  } else {
    const missing = PRIORITY.filter((p) => !sameAsAudit.find((e) => e.platform === p)?.linked);
    if (missing.length > 0) {
      gap("high", `Organization sameAs is incomplete (${linkedCount} linked)`, `Add sameAs links for ${missing.slice(0, 3).join(", ")} so crawlers can connect those profiles to the brand.`, "Organization");
    }
  }
  if (articleNode && b.article < 15) {
    gap("medium", "Article schema is missing author/dateModified", "Link author to a Person object and add dateModified so AI can attribute and freshness-rank the content.", "Article");
  }
  if (!personNode && articleNode) {
    gap("medium", "No Person schema for the author", "Add Person schema (name, url, sameAs, jobTitle, knowsAbout): a key E-E-A-T + entity signal.", "Person");
  }
  if (!hasSpeakable) {
    gap("low", "No speakable property", "Add speakable to identify the sections that work well when read aloud.", "speakable");
  }
  if (!websiteNode) {
    gap("low", "No WebSite + SearchAction schema", "Add WebSite schema with a SearchAction to enable the sitelinks search box.", "WebSite");
  }
  for (const v of validated) {
    if (v.deprecated && v.primaryType === "HowTo") {
      findings.push({
        pillar: "seo",
        category: "schema",
        severity: "low",
        title: "Deprecated HowTo schema present",
        recommendation: v.deprecatedNote ?? "Remove HowTo because Google no longer uses it for rich results.",
        fix_capability: "guided",
      });
    }
  }
  if (validated.some((v) => v.block.format !== "json-ld")) {
    findings.push({
      pillar: "seo",
      category: "schema",
      severity: "low",
      title: "Schema uses Microdata/RDFa",
      recommendation: "Migrate to JSON-LD: the format Google and AI crawlers prefer.",
      fix_capability: "guided",
    });
  }

  return { score, breakdown: b, sameAsAudit, present, findings };
}
