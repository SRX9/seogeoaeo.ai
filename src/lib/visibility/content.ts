import { z } from "zod";
import { generateJson } from "@/lib/llm/client";
import { type AiContentLabel, EeatSchema } from "./eeat-schema";
import type { Finding, PageSnapshot } from "./types";

const contentGapResponseSchema = z.object({
  gaps: z.array(z.string().min(1).max(300)).max(8).optional(),
});

/**
 * V4: content quality & E-E-A-T. Ports `agents/geo-content.md`: readability &
 * depth (Step 6), AI-content red flags (Step 7), topical authority (Steps 8,10),
 * freshness (Step 9), E-E-A-T signal tables + 0-25 bands (Steps 2-5), and the
 * Step 10 content-score weighting. Deterministic analyzers run live in the
 * editor (V7.1); the E-E-A-T judgement is LLM-first with a heuristic fallback.
 */

// ── shared text helpers ─────────────────────────────────────────────────────
const words = (t: string): string[] => (t.trim() ? t.trim().split(/\s+/) : []);
const sentences = (t: string): string[] => t.split(/[.!?]+/).filter((s) => s.trim().length > 0);
const stripTags = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function extractParagraphs(html: string): string[] {
  return [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripTags(m[1]))
    .filter((t) => words(t).length >= 8);
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  let n = w.match(/[aeiouy]+/g)?.length ?? 0;
  if (w.endsWith("e")) n -= 1;
  return Math.max(1, n);
}

function safeProtocol(url: string): string {
  try {
    return new URL(url).protocol;
  } catch {
    return "";
  }
}

function schemaTypeSet(structuredData: unknown[]): Set<string> {
  const types = new Set<string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      const t = (node as Record<string, unknown>)["@type"];
      for (const v of Array.isArray(t) ? t : [t]) if (typeof v === "string") types.add(v);
      for (const v of Object.values(node)) walk(v);
    }
  };
  walk(structuredData);
  return types;
}

// ════════════════════════ V4.2: Readability & depth ════════════════════════
export type WordCountTier = "thin" | "short" | "standard" | "long" | "deep-dive";

export interface ReadabilityResult {
  wordCount: number;
  tier: WordCountTier;
  flesch: number;
  fleschLevel: string;
  fleschNote: string;
  avgParagraphWords: number;
  wallOfTextCount: number;
  headings: { h1Count: number; total: number; skippedLevels: boolean; wordsPerSubheading: number };
  score: number;
  findings: Finding[];
}

const FLESCH_LEVELS: [min: number, level: string][] = [
  [90, "Very Easy"],
  [80, "Easy"],
  [70, "Fairly Easy"],
  [60, "Standard"],
  [50, "Fairly Difficult"],
  [30, "Difficult"],
  [0, "Very Difficult"],
];

function wordCountTier(n: number): WordCountTier {
  if (n < 300) return "thin";
  if (n <= 800) return "short";
  if (n <= 1500) return "standard";
  if (n <= 3000) return "long";
  return "deep-dive";
}

export function analyzeReadability(snapshot: PageSnapshot): ReadabilityResult {
  const wordCount = snapshot.word_count;
  const tier = wordCountTier(wordCount);
  const paragraphs = extractParagraphs(snapshot.html);

  // Flesch from a sample of up to 5 of the longest (representative) paragraphs.
  const sample = [...paragraphs].sort((a, b) => words(b).length - words(a).length).slice(0, 5);
  const sWords = words(sample.join(" "));
  const sSentences = sentences(sample.join(" "));
  let flesch = 0;
  if (sWords.length && sSentences.length) {
    const awps = sWords.length / sSentences.length;
    const aspw = sWords.reduce((s, w) => s + countSyllables(w), 0) / sWords.length;
    flesch = 206.835 - 1.015 * awps - 84.6 * aspw;
  }
  flesch = Math.round(Math.max(0, Math.min(100, flesch)) * 10) / 10;
  const fleschLevel = FLESCH_LEVELS.find(([m]) => flesch >= m)?.[1] ?? "Very Difficult";

  const paraWords = paragraphs.map((p) => words(p).length);
  const avgParagraphWords = paraWords.length
    ? Math.round(paraWords.reduce((a, b) => a + b, 0) / paraWords.length)
    : 0;
  const wallOfTextCount = paraWords.filter((n) => n > 150).length;

  const hs = snapshot.heading_structure;
  const h1Count = hs.filter((h) => h.level === 1).length;
  let skippedLevels = false;
  let prev = 0;
  for (const h of hs) {
    if (prev && h.level > prev + 1) skippedLevels = true;
    prev = h.level;
  }
  const subHeadings = hs.filter((h) => h.level === 2 || h.level === 3).length;
  const wordsPerSubheading = subHeadings ? Math.round(wordCount / subHeadings) : 0;

  let score = 100;
  if (tier === "thin") score -= 30;
  else if (tier === "short") score -= 10;
  if (flesch > 0 && (flesch < 30 || flesch > 85)) score -= 10;
  score -= Math.min(20, wallOfTextCount * 5);
  if (h1Count !== 1) score -= 10;
  if (skippedLevels) score -= 10;
  if (subHeadings === 0 && wordCount > 300) score -= 10;
  score = Math.max(0, score);

  const findings: Finding[] = [];
  if (tier === "thin") {
    findings.push({
      pillar: "seo",
      category: "content_depth",
      severity: "medium",
      title: `Thin content (${wordCount} words)`,
      recommendation: "Expand with specifics, examples, and answers: under 300 words rarely ranks or gets cited.",
      fix_capability: "guided",
    });
  }
  if (h1Count !== 1) {
    findings.push({
      pillar: "seo",
      category: "heading_structure",
      severity: "medium",
      title: h1Count === 0 ? "No H1 heading" : `Multiple H1 headings (${h1Count})`,
      recommendation: "Use exactly one H1 that states the page's main topic.",
      fix_capability: "guided",
    });
  }
  if (skippedLevels) {
    findings.push({
      pillar: "seo",
      category: "heading_structure",
      severity: "low",
      title: "Skipped heading levels",
      recommendation: "Don't jump levels (e.g. H2→H4); keep a logical outline so crawlers parse structure.",
      fix_capability: "guided",
    });
  }
  if (wallOfTextCount > 0) {
    findings.push({
      pillar: "aeo",
      category: "readability",
      severity: "low",
      title: `${wallOfTextCount} "wall of text" paragraph(s)`,
      recommendation: "Break paragraphs over 150 words into 40-80-word chunks: easier to read and to quote.",
      fix_capability: "guided",
    });
  }

  return {
    wordCount,
    tier,
    flesch,
    fleschLevel,
    fleschNote: "Approximation from paragraph sampling: not a certified reading-level measurement.",
    avgParagraphWords,
    wallOfTextCount,
    headings: { h1Count, total: hs.length, skippedLevels, wordsPerSubheading },
    score,
    findings,
  };
}

// ════════════════════════ V4.5: Content freshness ══════════════════════════
export interface FreshnessResult {
  published: string | null;
  modified: string | null;
  ageDays: number | null;
  timeSensitivity: "high" | "low";
  ymyl: boolean;
  stale: boolean;
  score: number;
  refreshCandidate: { url: string; reason: string } | null;
  findings: Finding[];
}

const YMYL_RE =
  /\b(health|medical|medicine|diagnos|treatment|symptom|finance|financial|invest|tax|loan|mortgage|insurance|legal|law|attorney|lawyer|safety|drug|dosage|nutrition)\b/i;
const TIME_SENSITIVE_RE =
  /\b(news|breaking|update|updated|released?|version|latest|202[0-9]|statistic|trend|pricing|price|market|stock|guide for)\b/i;

function parseDate(v: string): Date | null {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function schemaDate(structuredData: unknown[], key: string): string | null {
  let found: string | null = null;
  const walk = (node: unknown) => {
    if (found) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      const v = (node as Record<string, unknown>)[key];
      if (typeof v === "string") {
        found = v;
        return;
      }
      for (const child of Object.values(node)) walk(child);
    }
  };
  walk(structuredData);
  return found;
}

export function analyzeFreshness(snapshot: PageSnapshot, now: Date = new Date()): FreshnessResult {
  const meta = snapshot.meta_tags;
  const published =
    meta["article:published_time"] ?? schemaDate(snapshot.structured_data, "datePublished") ?? null;
  let modified =
    meta["article:modified_time"] ?? schemaDate(snapshot.structured_data, "dateModified") ?? null;
  if (!modified) {
    const m = /updated(?:\s*(?:on|for))?[:\s]+([A-Za-z]+ \d{1,2},? \d{4}|\d{4}-\d{2}-\d{2}|[A-Za-z]+ \d{4})/i.exec(
      snapshot.text_content,
    );
    if (m) modified = m[1];
  }

  const latest = (modified && parseDate(modified)) || (published && parseDate(published)) || null;
  const ageDays = latest ? Math.floor((now.getTime() - latest.getTime()) / 86_400_000) : null;

  const haystack = `${snapshot.title ?? ""} ${snapshot.text_content.slice(0, 4000)}`;
  const ymyl = YMYL_RE.test(haystack);
  const timeSensitivity: FreshnessResult["timeSensitivity"] =
    ymyl || TIME_SENSITIVE_RE.test(haystack) ? "high" : "low";

  const stale = ageDays != null && ageDays > 730 && timeSensitivity === "high";
  let score: number;
  if (ageDays == null) score = 50;
  else if (ageDays <= 365) score = 100;
  else if (ageDays <= 730) score = 75;
  else score = timeSensitivity === "high" ? 30 : 60;

  const findings: Finding[] = [];
  if (stale) {
    findings.push({
      pillar: "seo",
      category: "freshness",
      severity: ymyl ? "high" : "medium",
      title: `Stale ${ymyl ? "YMYL " : ""}content (${Math.floor((ageDays ?? 0) / 365)}+ years old)`,
      recommendation: "Refresh facts, stats, and the updated date: time-sensitive pages lose trust and rankings as they age.",
      fix_capability: "guided",
    });
  } else if (ageDays == null && snapshot.word_count > 300) {
    findings.push({
      pillar: "seo",
      category: "freshness",
      severity: "low",
      title: "No visible publish/updated date",
      recommendation: "Show a publish and last-updated date: a freshness and trust signal for search and AI.",
      fix_capability: "guided",
    });
  }

  return {
    published,
    modified,
    ageDays,
    timeSensitivity,
    ymyl,
    stale,
    score,
    refreshCandidate: stale ? { url: snapshot.url, reason: `Time-sensitive content ~${ageDays} days old` } : null,
    findings,
  };
}

// ═════════════════════ V4.4: Topical authority ═════════════════════════════
export interface TopicalAuthorityResult {
  pageCount: number;
  internalLinks: number;
  modifier: number;
  rating: "strong" | "moderate" | "weak" | "minimal";
  findings: Finding[];
}

export function analyzeTopicalAuthority(
  snapshot: PageSnapshot,
  siteUrls: string[],
): TopicalAuthorityResult {
  const internalLinks = snapshot.internal_links.length;
  const pageCount = new Set(siteUrls).size;
  const modifier =
    pageCount >= 20 && internalLinks >= 10 ? 10 : pageCount >= 20 ? 7 : pageCount >= 10 ? 5 : pageCount >= 5 ? 0 : -5;
  const rating = modifier >= 7 ? "strong" : modifier >= 5 ? "moderate" : modifier >= 0 ? "weak" : "minimal";

  const findings: Finding[] = [];
  if (modifier < 0) {
    findings.push({
      pillar: "geo",
      category: "topical_authority",
      severity: "medium",
      title: `Shallow topic coverage (${pageCount} pages)`,
      recommendation:
        "Publish a hub page plus supporting cluster articles on your core topic: breadth builds the authority AI rewards.",
      fix_capability: "guided",
    });
  } else if (internalLinks < 3 && snapshot.word_count > 300) {
    findings.push({
      pillar: "seo",
      category: "internal_linking",
      severity: "low",
      title: "Sparse internal linking",
      recommendation: "Add internal links to related pages so crawlers and readers can traverse your topic cluster.",
      fix_capability: "guided",
    });
  }

  return { pageCount, internalLinks, modifier, rating, findings };
}

/** LLM `light` content-gap synthesis (feeds the topic backlog). Best-effort. */
export async function suggestContentGaps(topic: string, existingTitles: string[]): Promise<string[]> {
  try {
    const { data } = await generateJson("light", [
      {
        role: "system",
        content:
          "List notable missing subtopics for the given topic given the pages that already exist. " +
          'Respond as JSON: {"gaps": ["subtopic", ...]} with up to 8 concise subtopics.',
      },
      { role: "user", content: `Topic: ${topic}\nExisting pages: ${existingTitles.slice(0, 40).join(" | ")}` },
    ], { schema: contentGapResponseSchema });
    return Array.isArray(data.gaps) ? data.gaps.slice(0, 8) : [];
  } catch {
    return [];
  }
}

// ═════════════════════ V4.3: AI-content detector ═══════════════════════════
export interface AiContentResult {
  redFlags: { indicator: string; evidence?: string }[];
  label: AiContentLabel;
  score: number;
  findings: Finding[];
}

const GENERIC_PHRASES = [
  "in today's digital landscape",
  "it's important to note",
  "in conclusion",
  "delve into",
  "navigating the",
  "ever-evolving",
  "in the world of",
  "when it comes to",
  "at the end of the day",
  "unlock the power",
  "harness the power",
  "game-changer",
  "testament to",
  "the landscape of",
  "plays a crucial role",
];
const HEDGING_RE = /\b(may|might|could potentially|it depends|can vary|generally|typically|perhaps)\b/gi;
const ORIGINAL_DATA_RE = /\d+%|\$[\d,]|\bour (?:research|study|data|survey)\b|\bwe (?:found|analyzed|measured|tested)\b|case study/i;
const SPECIFIC_RE = /\b\d{4}\b|\b[A-Z][a-z]+\s[A-Z][a-z]+\b|\d+(?:,\d{3})+/;

const LABEL_SCORE: Record<AiContentLabel, number> = {
  "Highly Likely Human": 100,
  "Likely Human-Edited AI": 75,
  "Likely AI with Light Editing": 45,
  "Likely Unedited AI": 15,
};

function labelForFlags(n: number): AiContentLabel {
  if (n <= 1) return "Highly Likely Human";
  if (n === 2) return "Likely Human-Edited AI";
  if (n <= 4) return "Likely AI with Light Editing";
  return "Likely Unedited AI";
}

/**
 * Deterministic red-flag scan (Step 7 table). Framed as likelihood, never a
 * definitive "this is AI" claim (per the agent's caveat).
 */
export function detectAiContent(snapshot: PageSnapshot): AiContentResult {
  const text = snapshot.text_content;
  const lower = text.toLowerCase();
  const wordCount = snapshot.word_count || words(text).length;
  const redFlags: AiContentResult["redFlags"] = [];

  const generics = GENERIC_PHRASES.filter((p) => lower.includes(p));
  if (generics.length >= 2) redFlags.push({ indicator: "Generic phrasing", evidence: generics.slice(0, 3).join("; ") });

  if (wordCount > 150 && !SPECIFIC_RE.test(text)) {
    redFlags.push({ indicator: "Lack of specifics", evidence: "No dates, proper nouns, or large figures" });
  }
  if (wordCount > 150 && !ORIGINAL_DATA_RE.test(text)) {
    redFlags.push({ indicator: "No original data" });
  }
  const hedges = text.match(HEDGING_RE)?.length ?? 0;
  if (wordCount > 0 && hedges / wordCount > 0.02) {
    redFlags.push({ indicator: "Hedging overload", evidence: `${hedges} hedging terms` });
  }
  if (!/\b(i |we |our team|in my experience|i've|we've)\b/i.test(text) && wordCount > 300) {
    redFlags.push({ indicator: "No authorial voice" });
  }

  const label = labelForFlags(redFlags.length);
  const findings: Finding[] = [];
  if (label === "Likely Unedited AI" || label === "Likely AI with Light Editing") {
    findings.push({
      pillar: "aeo",
      category: "ai_content",
      severity: "medium",
      title: `Content reads as low-effort (${label})`,
      recommendation:
        "Add first-hand experience, original data, and specific examples. Low-effort AI content without E-E-A-T rarely gets cited.",
      fix_capability: "guided",
    });
  }
  return { redFlags, label, score: LABEL_SCORE[label], findings };
}

// ═══════════════════════════ V4.1: E-E-A-T ═════════════════════════════════
export interface EeatDimension {
  score: number;
  evidence: string[];
}
export interface EeatResult {
  experience: EeatDimension;
  expertise: EeatDimension;
  authoritativeness: EeatDimension;
  trustworthiness: EeatDimension;
  total: number;
  source: "llm" | "heuristic";
  findings: Finding[];
}

const cap = (n: number, max = 25) => Math.min(n, max);

/** Observable-signal E-E-A-T scoring (also the fallback when the LLM is off). */
export function heuristicEeat(snapshot: PageSnapshot): Omit<EeatResult, "findings" | "source"> {
  const text = snapshot.text_content;
  const lower = text.toLowerCase();
  const urls = snapshot.internal_links.map((l) => l.url.toLowerCase()).join(" ");
  const externalLinks = snapshot.external_links.length;
  const types = schemaTypeSet(snapshot.structured_data);
  const hasAuthor = !!snapshot.meta_tags["author"] || /\bby [A-Z][a-z]+ [A-Z][a-z]+/.test(text);
  const hasContact =
    /[\w.+-]+@[\w-]+\.[\w.-]+/.test(text) || /\+?\d[\d ().-]{7,}/.test(text) || /contact/.test(urls);

  const experience: EeatDimension = { score: 0, evidence: [] };
  if (ORIGINAL_DATA_RE.test(text)) experience.score += 8, experience.evidence.push("Original data / research");
  if (/\b(i |we |our team|in my experience|when i )\b/i.test(text)) experience.score += 6, experience.evidence.push("First-hand narrative");
  if (SPECIFIC_RE.test(text)) experience.score += 6, experience.evidence.push("Specific names/dates/figures");
  if (/before and after|step \d|our process/i.test(text)) experience.score += 5, experience.evidence.push("Process / before-after");
  experience.score = cap(experience.score);

  const expertise: EeatDimension = { score: 0, evidence: [] };
  if (hasAuthor) expertise.score += 6, expertise.evidence.push("Named author byline");
  if (/\/author|\/team|\/about/.test(urls)) expertise.score += 6, expertise.evidence.push("Author/team page");
  if (externalLinks >= 3) expertise.score += 6, expertise.evidence.push("Cites external sources");
  if (types.has("Person")) expertise.score += 4, expertise.evidence.push("Person schema");
  if (snapshot.word_count > 1000) expertise.score += 3, expertise.evidence.push("In-depth coverage");
  expertise.score = cap(expertise.score);

  const authoritativeness: EeatDimension = { score: 0, evidence: [] };
  if (/\/about/.test(urls) || /about us/.test(lower)) authoritativeness.score += 6, authoritativeness.evidence.push("About page");
  if (externalLinks >= 3) authoritativeness.score += 6, authoritativeness.evidence.push("External citations");
  if (types.has("Organization") && snapshot.html.toLowerCase().includes("sameas")) authoritativeness.score += 5, authoritativeness.evidence.push("Organization sameAs");
  if (/featured in|as seen (?:on|in)|press|award/i.test(text)) authoritativeness.score += 4, authoritativeness.evidence.push("Media / recognition");
  if (snapshot.internal_links.length >= 10) authoritativeness.score += 4, authoritativeness.evidence.push("Broad internal coverage");
  authoritativeness.score = cap(authoritativeness.score);

  const trustworthiness: EeatDimension = { score: 0, evidence: [] };
  if (safeProtocol(snapshot.url) === "https:") trustworthiness.score += 6, trustworthiness.evidence.push("HTTPS");
  if (hasContact) trustworthiness.score += 5, trustworthiness.evidence.push("Contact info");
  if (/privacy/.test(urls)) trustworthiness.score += 4, trustworthiness.evidence.push("Privacy policy");
  if (/terms/.test(urls)) trustworthiness.score += 3, trustworthiness.evidence.push("Terms of service");
  if (externalLinks >= 3) trustworthiness.score += 4, trustworthiness.evidence.push("Transparent sourcing");
  if (snapshot.meta_tags["article:published_time"] || /updated/i.test(text)) trustworthiness.score += 3, trustworthiness.evidence.push("Content dating");
  trustworthiness.score = cap(trustworthiness.score);

  const total = experience.score + expertise.score + authoritativeness.score + trustworthiness.score;
  return { experience, expertise, authoritativeness, trustworthiness, total };
}

function eeatFindings(e: Omit<EeatResult, "findings" | "source">): Finding[] {
  const findings: Finding[] = [];
  if (e.trustworthiness.score < 12) {
    findings.push({
      pillar: "seo",
      category: "eeat_trust",
      severity: "high",
      title: "Weak trust signals",
      recommendation: "Add visible contact info, a privacy policy, inline sourcing, and content dates: trust is Google's top E-E-A-T dimension.",
      fix_capability: "guided",
    });
  }
  if (e.expertise.score < 10) {
    findings.push({
      pillar: "seo",
      category: "eeat_expertise",
      severity: "medium",
      title: "No clear author expertise",
      recommendation: "Add a named byline, a linked author page, and Person schema with credentials + knowsAbout.",
      fix_capability: "guided",
    });
  }
  if (e.experience.score < 8) {
    findings.push({
      pillar: "aeo",
      category: "eeat_experience",
      severity: "medium",
      title: "Little first-hand experience shown",
      recommendation: "Add original data, case studies, screenshots, or 'what we did' narratives: the newest E-E-A-T signal.",
      fix_capability: "guided",
    });
  }
  return findings;
}

const EEAT_SYSTEM = [
  "You score a web page on Google's E-E-A-T framework from observable signals only.",
  "Rate Experience, Expertise, Authoritativeness, and Trustworthiness each 0-25 using these bands:",
  "0-5 none · 6-10 minimal · 11-15 moderate · 16-20 strong · 21-25 exceptional.",
  "Trustworthiness is the most important dimension (HTTPS, contact info, sourcing, dating, policies).",
  'Return JSON: {"experience":{"score":N,"evidence":[...]},"expertise":{...},"authoritativeness":{...},"trustworthiness":{...}}.',
].join(" ");

/** LLM-first E-E-A-T (heavy tier), falling back to the heuristic scorer. */
export async function analyzeEeat(snapshot: PageSnapshot): Promise<EeatResult> {
  try {
    const excerpt = snapshot.text_content.slice(0, 6000);
    const { data } = await generateJson("heavy", [
      { role: "system", content: EEAT_SYSTEM },
      {
        role: "user",
        content: `URL: ${snapshot.url}\nAuthor byline: ${snapshot.meta_tags["author"] ?? "none"}\nExternal links: ${snapshot.external_links.length}\n\nContent:\n${excerpt}`,
      },
    ], { schema: EeatSchema });
    const parsed = EeatSchema.safeParse(data);
    if (parsed.success) {
      const d = parsed.data;
      const total = d.experience.score + d.expertise.score + d.authoritativeness.score + d.trustworthiness.score;
      return { ...d, total, source: "llm", findings: eeatFindings({ ...d, total }) };
    }
  } catch {
    // fall through to heuristic
  }
  const h = heuristicEeat(snapshot);
  return { ...h, source: "heuristic", findings: eeatFindings(h) };
}

// ══════════════════════ Step 10: content score ═════════════════════════════
export function computeContentScore(p: {
  eeatTotal: number; // 0-100 (sum of four 0-25 dims)
  contentMetrics: number; // 0-100
  aiContent: number; // 0-100
  topicalModifier: number; // −5..10
  freshness: number; // 0-100
}): number {
  const eeatPts = (p.eeatTotal / 100) * 60; // four dims → 15% each = 60
  const metricsPts = (p.contentMetrics / 100) * 15;
  const aiPts = (p.aiContent / 100) * 10;
  const topicalPts = ((p.topicalModifier + 5) / 15) * 10;
  const freshnessPts = (p.freshness / 100) * 5;
  return Math.round(eeatPts + metricsPts + aiPts + topicalPts + freshnessPts);
}

export interface ContentAnalysis {
  subScore: { key: "eeat"; score: number };
  findings: Finding[];
  details: {
    readability: ReadabilityResult;
    freshness: FreshnessResult;
    topical: TopicalAuthorityResult;
    ai: AiContentResult;
    eeat: EeatResult;
  };
}

/** V4 orchestrator → the `eeat` sub-score for the composite audit. */
export async function analyzeContent(
  snapshot: PageSnapshot,
  siteUrls: string[],
): Promise<ContentAnalysis> {
  const readability = analyzeReadability(snapshot);
  const freshness = analyzeFreshness(snapshot);
  const topical = analyzeTopicalAuthority(snapshot, siteUrls);
  const ai = detectAiContent(snapshot);
  const eeat = await analyzeEeat(snapshot);

  const score = computeContentScore({
    eeatTotal: eeat.total,
    contentMetrics: readability.score,
    aiContent: ai.score,
    topicalModifier: topical.modifier,
    freshness: freshness.score,
  });

  return {
    subScore: { key: "eeat", score },
    findings: [...eeat.findings, ...readability.findings, ...ai.findings, ...topical.findings, ...freshness.findings],
    details: { readability, freshness, topical, ai, eeat },
  };
}
