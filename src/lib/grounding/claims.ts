import { type EvidencePacket, type EvidenceRecord } from "./evidence";
import { parseMarkdownCitations, type ParsedMarkdownCitation } from "./citations";

export const CLAIM_EXTRACTOR_VERSION = "deterministic-claim-extractor.v1";

export type MaterialClaimType =
  | "factual"
  | "opinion"
  | "brand_fact"
  | "calculation"
  | "example"
  | "prediction";

export type ClaimLedgerEntry = {
  claimId: string;
  text: string;
  claimType: MaterialClaimType;
  material: boolean;
  citationIds: string[];
  evidenceIds: string[];
  quoteTexts: string[];
  start: number;
  end: number;
  supportStrength: "none";
  contradictionStatus: "unchecked";
  verificationResult: "unverified";
  evaluatorVersion: typeof CLAIM_EXTRACTOR_VERSION;
};

type SentenceSpan = { start: number; end: number; raw: string };

const IMPERATIVE_STARTS = new Set([
  "add", "avoid", "build", "check", "choose", "click", "compare", "consider", "create", "define",
  "download", "ensure", "follow", "include", "install", "keep", "learn", "make", "open", "publish",
  "read", "remove", "review", "run", "select", "start", "try", "update", "use", "visit", "write",
]);

const DECLARATIVE_VERBS = /\b(?:am|are|be|became|become|can|caused?|contains?|costs?|could|did|do|does|drives?|grew|had|has|have|helps?|improves?|includes?|increases?|is|leads?|may|means?|might|must|offers?|provides?|reduces?|remains?|requires?|shows?|supports?|uses?|was|were|will|would)\b/i;
const OPINION_PATTERN = /\b(?:i (?:believe|feel|think)|in (?:my|our) (?:opinion|view)|we (?:believe|feel|think)|arguably|subjectively)\b/i;
const CALCULATION_PATTERN = /(?:\b(?:calculate[ds]?|computed?|equals?|multipl(?:y|ied)|divid(?:e|ed)|sum of|total of|average of|percent change|ratio of)\b|\d[\d,.]*\s*[+×*÷/]\s*\d|\d[\d,.]*\s*-\s*\d[\d,.]*\s*=)/i;
const EXAMPLE_PATTERN = /^\s*(?:for example|for instance|as an example|consider a hypothetical|imagine|suppose)\b/i;
const HYPOTHETICAL_PATTERN = /\b(?:hypothetical|imagine|suppose|could,? for example|might,? for example)\b/i;
const PREDICTION_PATTERN = /\b(?:forecast|projected?|predict(?:s|ed)?|expected to|likely to|will (?:grow|fall|rise|decline|increase|decrease|reach|become|remain))\b/i;
const BRAND_FACT_PATTERN = /\b(?:our|we|us|my company|this company|this product|our customers?|our platform|our service)\b/i;
const CUSTOMER_STORY_PATTERN =
  /\b(?:case stud(?:y|ies)|clients?|customers?|success stor(?:y|ies)|testimonial|said|says|reported|credited|transformed)\b/i;
const OUTCOME_ATTRIBUTION_PATTERN =
  /(?:\b(?:a|an|the)\s+(?:agency|business|company|organization|retailer|store|team|user)\b|\b[A-Z][A-Za-z0-9&.-]{2,}\b)[^.!?\n]{0,100}\b(?:cut|doubled?|grew|halved?|improved?|increased?|reduced?|saved|slash(?:ed|es|ing)?|tripled?)\b/;
const NAMED_ENTITY_ASSERTION_PATTERN =
  /^(?!(?:A|An|For|How|I|In|It|On|Our|The|These|This|Those|To|We|What|When|Why|You)\b)[\p{Lu}][\p{L}\p{N}&.-]{2,}(?:\s+[\p{L}\p{N}&.'-]+){0,3}\s+(?:became|caused?|contains?|costs?|cut|doubled?|grew|had|has|helps?|improved?|increased?|is|offers?|provides?|reduced?|reported|saved|slash(?:ed|es|ing)?|supports?|tripled?|uses?|was|will)\b/u;
const HIGH_IMPACT_ADVICE_PATTERN =
  /(?:\b(?:buy|declare bankruptcy|double (?:a |the |your )?(?:dose|dosage|insulin|medication)|file (?:a )?(?:claim|lawsuit)|fire|invest in|sell|start taking|stop taking|take)\b|(?:^|[\n.!?]\s*)double\s+(?:a |the |your )?[\p{L}][\p{L}\p{N}-]*\b)/iu;
const RISKY_FRAGMENT_PATTERN = /(?:\d|["“”]|#1|\b(?:best|better|fastest|highest|leading|less than|more than|most|only|versus|vs\.?)\b)/i;

function stableClaimHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function maskExcludedMarkdown(markdown: string): string {
  const chars = [...markdown];
  const mask = (start: number, end: number) => {
    for (let index = start; index < end; index += 1) {
      if (chars[index] !== "\n" && chars[index] !== "\r") chars[index] = " ";
    }
  };
  for (const match of markdown.matchAll(/```[\s\S]*?```|~~~[\s\S]*?~~~/g)) {
    mask(match.index, match.index + match[0].length);
  }
  for (const match of markdown.matchAll(/^\s{0,3}\[[^\]\n]+\]:.*$/gm)) {
    mask(match.index, match.index + match[0].length);
  }
  return chars.join("");
}

function sentenceSpans(markdown: string): SentenceSpan[] {
  const masked = maskExcludedMarkdown(markdown);
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  const spans: SentenceSpan[] = [];
  for (const lineMatch of masked.matchAll(/^.*$/gm)) {
    const line = lineMatch[0];
    const lineStart = lineMatch.index;
    const trimmed = line.trim();
    if (!trimmed || /^\|?(?:\s*:?-+:?\s*\|)+/.test(trimmed)) continue;
    for (const segment of segmenter.segment(line)) {
      const raw = segment.segment;
      const leading = raw.search(/\S/);
      if (leading < 0) continue;
      const trailing = raw.length - raw.trimEnd().length;
      const start = lineStart + segment.index + leading;
      const end = lineStart + segment.index + raw.length - trailing;
      spans.push({ start, end, raw: markdown.slice(start, end) });
    }
  }
  return spans;
}

function cleanClaimText(raw: string): string {
  return raw
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    // Link labels identify citations; they are not part of the proposition
    // whose support is being evaluated.
    .replace(/\[[^\]]+\]\(\s*<?https?:\/\/[^)]*\)/g, " ")
    .replace(/\[[^\]]+\]\[[^\]]*\]/g, " ")
    .replace(/\[\^[^\]]+\]/g, "")
    .replace(/<https?:\/\/[^>]+>/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_~`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuotes(text: string): string[] {
  return [...text.matchAll(/[“"]([^”"\n]{4,400})[”"]/g)]
    .map((match) => (match[1] ?? "").trim())
    .filter(Boolean);
}

function brandNamePattern(brandNames: readonly string[]): RegExp | null {
  const escaped = brandNames
    .map((name) => name.trim())
    .filter((name) => name.length >= 2)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return escaped.length > 0 ? new RegExp(`\\b(?:${escaped.join("|")})\\b`, "i") : null;
}

function classifyClaim(text: string, brands: RegExp | null): MaterialClaimType {
  if (CALCULATION_PATTERN.test(text)) return "calculation";
  if (EXAMPLE_PATTERN.test(text)) return "example";
  if (PREDICTION_PATTERN.test(text)) return "prediction";
  if (OPINION_PATTERN.test(text)) return "opinion";
  if (
    BRAND_FACT_PATTERN.test(text) ||
    CUSTOMER_STORY_PATTERN.test(text) ||
    OUTCOME_ATTRIBUTION_PATTERN.test(text) ||
    NAMED_ENTITY_ASSERTION_PATTERN.test(text) ||
    brands?.test(text)
  ) return "brand_fact";
  // Fail closed: an uncertain declarative sentence is factual, not opinion.
  return "factual";
}

function isClaim(text: string, brands: RegExp | null): boolean {
  if (!text) return false;
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const risky =
    RISKY_FRAGMENT_PATTERN.test(text) ||
    BRAND_FACT_PATTERN.test(text) ||
    CUSTOMER_STORY_PATTERN.test(text) ||
    OUTCOME_ATTRIBUTION_PATTERN.test(text) ||
    NAMED_ENTITY_ASSERTION_PATTERN.test(text) ||
    HIGH_IMPACT_ADVICE_PATTERN.test(text) ||
    Boolean(brands?.test(text));
  if (text.endsWith("?") && !risky) return false;
  if (words.length < 3 && !/\d/.test(text) && !risky) return false;
  if (risky) return true;
  const firstWord = words[0]?.toLowerCase() ?? "";
  if (IMPERATIVE_STARTS.has(firstWord) && !DECLARATIVE_VERBS.test(text)) return false;
  if (OPINION_PATTERN.test(text) || DECLARATIVE_VERBS.test(text) || /\d/.test(text)) return true;
  // Full declarative-looking prose remains material rather than silently escaping verification.
  return words.length >= 3 && /[.!]$/.test(text);
}

function isMaterial(text: string, type: MaterialClaimType): boolean {
  if (/\d|%|[$€£]/.test(text) || extractQuotes(text).length > 0) return true;
  if (type === "opinion") return false;
  if (type === "example" && HYPOTHETICAL_PATTERN.test(text)) return false;
  return true;
}

function citationsForSpan(
  span: SentenceSpan,
  nextSpan: SentenceSpan | undefined,
  citations: readonly ParsedMarkdownCitation[],
  markdown: string,
): ParsedMarkdownCitation[] {
  return citations.filter((citation) => {
    if (citation.start >= span.start && citation.start < span.end) return true;
    if (citation.start < span.end) return false;
    const attachmentEnd = Math.min(nextSpan?.start ?? markdown.length, span.end + 160);
    if (citation.start > attachmentEnd) return false;
    const between = markdown.slice(span.end, citation.start);
    return !/[\p{L}\p{N}]{2,}/u.test(between);
  });
}

function evidenceForCitations(
  citations: readonly ParsedMarkdownCitation[],
  evidence: readonly EvidenceRecord[],
): string[] {
  const citedUrls = new Set(citations.flatMap((citation) => citation.canonicalUrl ? [citation.canonicalUrl] : []));
  return evidence.flatMap((record) =>
    citedUrls.has(record.canonicalUrl) || citedUrls.has(record.sourceUrl) ? [record.evidenceId] : [],
  );
}

function packetRecords(evidence: EvidencePacket | readonly EvidenceRecord[]): readonly EvidenceRecord[] {
  return "records" in evidence ? evidence.records : evidence;
}

/**
 * Deterministically extract a conservative claim ledger from final Markdown.
 * This avoids a second model call and defaults ambiguous assertions to material
 * factual claims so unsupported prose cannot slip through the publication gate.
 */
export function extractMaterialClaims(
  markdown: string,
  options: {
    evidence?: EvidencePacket | readonly EvidenceRecord[];
    brandNames?: readonly string[];
  } = {},
): ClaimLedgerEntry[] {
  const citations = parseMarkdownCitations(markdown);
  const records = options.evidence ? packetRecords(options.evidence) : [];
  const brands = brandNamePattern(options.brandNames ?? []);
  const spans = sentenceSpans(markdown);
  const claims: ClaimLedgerEntry[] = [];
  for (let index = 0; index < spans.length; index += 1) {
    const span = spans[index];
    if (!span) continue;
    const text = cleanClaimText(span.raw);
    if (!isClaim(text, brands)) continue;
    const claimType = classifyClaim(text, brands);
    const attached = citationsForSpan(span, spans[index + 1], citations, markdown);
    const claimId = `claim_${stableClaimHash(`${text.toLowerCase()}\n${claimType}`)}_${String(claims.length + 1).padStart(3, "0")}`;
    claims.push({
      claimId,
      text,
      claimType,
      material: isMaterial(text, claimType),
      citationIds: attached.map((citation) => citation.citationId),
      evidenceIds: [...new Set(evidenceForCitations(attached, records))],
      quoteTexts: extractQuotes(text),
      start: span.start,
      end: span.end,
      supportStrength: "none",
      contradictionStatus: "unchecked",
      verificationResult: "unverified",
      evaluatorVersion: CLAIM_EXTRACTOR_VERSION,
    });
  }
  return claims;
}
