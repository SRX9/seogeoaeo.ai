import { fetchPageResilient } from "@/lib/visibility/resilient-fetch";
import {
  canonicalizeSourceUrl,
  scoreSourceFreshness,
  type EvidencePacket,
  type EvidenceRecord,
  sourceDomain,
} from "./evidence";
import type { ClaimLedgerEntry } from "./claims";

export const CITATION_VERIFIER_VERSION = "citation-verifier.v1";

export type MarkdownCitationSyntax =
  | "inline"
  | "autolink"
  | "bare"
  | "footnote"
  | "reference";

export type ParsedMarkdownCitation = {
  citationId: string;
  url: string;
  canonicalUrl: string | null;
  label: string | null;
  syntax: MarkdownCitationSyntax;
  start: number;
  end: number;
  raw: string;
};

export type CitationPageSnapshot = {
  requestedUrl: string;
  finalUrl: string;
  statusCode: number | null;
  canonicalUrl: string | null;
  title: string | null;
  textContent: string;
  errors: string[];
};

export type CitationPageFetcher = (url: string) => Promise<CitationPageSnapshot>;

export type ClaimSupportResult = {
  claimId: string;
  supportScore: number;
  supported: boolean;
  quoteSupported: boolean | null;
  missingNumbers: string[];
  negationConsistent: boolean;
  comparisonConsistent: boolean;
};

export type CitationVerification = {
  citationId: string;
  url: string;
  canonicalUrl: string | null;
  evidenceId: string | null;
  claimIds: string[];
  invented: boolean;
  available: boolean;
  movedToUnrelatedPage: boolean;
  domainConsistent: boolean | null;
  canonicalConsistent: boolean | null;
  titleConsistent: boolean | null;
  stale: boolean;
  primarySource: boolean;
  valid: boolean;
  fetched: CitationPageSnapshot | null;
  claimSupport: ClaimSupportResult[];
  errors: string[];
};

export type VerifiedClaim = {
  claimId: string;
  material: boolean;
  citationIds: string[];
  evidenceIds: string[];
  supported: boolean;
  supportStrength: "none" | "weak" | "strong";
  quoteVerified: boolean | null;
  contradictionStatus: "none" | "disclosed" | "unresolved";
  staleEvidence: boolean;
  primarySourceAvailable: boolean;
  primarySourceUsed: boolean;
  verificationResult: "verified" | "unsupported" | "unverifiable";
  reasons: string[];
};

export type CitationVerificationReport = {
  passed: boolean;
  evaluatorVersion: typeof CITATION_VERIFIER_VERSION;
  citations: CitationVerification[];
  claims: VerifiedClaim[];
  citationPrecision: number;
  materialClaimCoverage: number;
  primarySourcePreference: {
    claimsWithPrimaryAvailable: number;
    claimsUsingPrimary: number;
    rate: number;
  };
  inventedCitationCount: number;
  unavailableCitationCount: number;
  movedCitationCount: number;
  staleEvidenceIds: string[];
  conflictingEvidenceIds: string[];
  excludedInternalCitationIds: string[];
  blockingReasons: string[];
};

type CitationDraft = Omit<ParsedMarkdownCitation, "citationId">;

function overlaps(start: number, end: number, ranges: ReadonlyArray<[number, number]>): boolean {
  return ranges.some(([rangeStart, rangeEnd]) => start < rangeEnd && end > rangeStart);
}

function trimUrlPunctuation(url: string): string {
  return url.replace(/[.,;:!?]+$/, "");
}

function citationDraft(input: {
  markdown: string;
  url: string;
  label?: string | null;
  syntax: MarkdownCitationSyntax;
  start: number;
  end: number;
}): CitationDraft {
  const url = trimUrlPunctuation(input.url.replace(/^<|>$/g, ""));
  return {
    url,
    canonicalUrl: canonicalizeSourceUrl(url),
    label: input.label?.trim() || null,
    syntax: input.syntax,
    start: input.start,
    end: input.end,
    raw: input.markdown.slice(input.start, input.end),
  };
}

/** Parse URL-bearing Markdown citations while retaining source offsets for claim attachment. */
export function parseMarkdownCitations(markdown: string): ParsedMarkdownCitation[] {
  const drafts: CitationDraft[] = [];
  const occupied: Array<[number, number]> = [];
  const referenceDefinitions = new Map<string, { url: string; start: number; end: number }>();

  // Images are content, not citations. Reserve their complete ranges before
  // scanning for bare URLs nested inside the destination.
  for (const match of markdown.matchAll(/!\[[^\]\n]*\]\([^\n)]*\)|!\[[^\]\n]*\]\[[^\]\n]*\]|<img\b[^>]*>/gi)) {
    occupied.push([match.index, match.index + match[0].length]);
  }

  const definitionPattern = /^\s{0,3}\[([^\]\n]+)\]:\s*<?(https?:\/\/[^\s>]+)>?(?:\s+(?:["'(].*?["')]))?\s*$/gim;
  for (const match of markdown.matchAll(definitionPattern)) {
    const start = match.index;
    const end = start + match[0].length;
    referenceDefinitions.set((match[1] ?? "").trim().toLowerCase(), {
      url: match[2] ?? "",
      start,
      end,
    });
    occupied.push([start, end]);
  }

  const inlinePattern = /(?<!!)\[([^\]\n]+)\]\(\s*<?(https?:\/\/[^\s)>]+)>?(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/gi;
  for (const match of markdown.matchAll(inlinePattern)) {
    const start = match.index;
    const end = start + match[0].length;
    if (overlaps(start, end, occupied)) continue;
    drafts.push(citationDraft({
      markdown,
      url: match[2] ?? "",
      label: match[1],
      syntax: "inline",
      start,
      end,
    }));
    occupied.push([start, end]);
  }

  const referencePattern = /(?<!!)\[([^\]\n]+)\]\[([^\]\n]*)\]/g;
  for (const match of markdown.matchAll(referencePattern)) {
    const start = match.index;
    const end = start + match[0].length;
    if (overlaps(start, end, occupied)) continue;
    const label = (match[1] ?? "").trim();
    const key = ((match[2] ?? "").trim() || label).toLowerCase();
    const definition = referenceDefinitions.get(key);
    if (!definition) continue;
    drafts.push(citationDraft({ markdown, url: definition.url, label, syntax: "reference", start, end }));
    occupied.push([start, end]);
  }

  const footnotePattern = /\[\^([^\]\n]+)\]/g;
  for (const match of markdown.matchAll(footnotePattern)) {
    const start = match.index;
    const end = start + match[0].length;
    if (overlaps(start, end, occupied)) continue;
    const definition = referenceDefinitions.get(`^${(match[1] ?? "").trim().toLowerCase()}`);
    if (!definition) continue;
    drafts.push(citationDraft({ markdown, url: definition.url, label: match[1], syntax: "footnote", start, end }));
    occupied.push([start, end]);
  }

  const autolinkPattern = /<(https?:\/\/[^\s<>]+)>/gi;
  for (const match of markdown.matchAll(autolinkPattern)) {
    const start = match.index;
    const end = start + match[0].length;
    if (overlaps(start, end, occupied)) continue;
    drafts.push(citationDraft({ markdown, url: match[1] ?? "", syntax: "autolink", start, end }));
    occupied.push([start, end]);
  }

  const barePattern = /https?:\/\/[^\s<>()\[\]]+/gi;
  for (const match of markdown.matchAll(barePattern)) {
    const start = match.index;
    const rawUrl = trimUrlPunctuation(match[0]);
    const end = start + rawUrl.length;
    if (overlaps(start, end, occupied)) continue;
    drafts.push(citationDraft({ markdown, url: rawUrl, syntax: "bare", start, end }));
    occupied.push([start, end]);
  }

  return drafts
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .map((draft, index) => ({ ...draft, citationId: `cit_${String(index + 1).padStart(3, "0")}` }));
}

export const defaultCitationPageFetcher: CitationPageFetcher = async (url) => {
  const result = await fetchPageResilient(url, { skipRender: true });
  const snapshot = result.snapshot;
  let canonicalUrl: string | null = null;
  if (snapshot.canonical) {
    try {
      canonicalUrl = new URL(snapshot.canonical, snapshot.url).toString();
    } catch {
      canonicalUrl = null;
    }
  }
  return {
    requestedUrl: url,
    finalUrl: snapshot.url,
    statusCode: snapshot.status_code,
    canonicalUrl,
    title: snapshot.title,
    textContent: snapshot.text_content,
    errors: snapshot.errors,
  };
};

const SUPPORT_STOP_WORDS = new Set([
  "about", "after", "also", "among", "because", "before", "being", "between", "could",
  "does", "from", "have", "into", "more", "most", "other", "over", "said", "such",
  "than", "that", "their", "there", "these", "they", "this", "those", "through", "under",
  "using", "very", "were", "what", "when", "where", "which", "while", "with", "would",
  "according", "source", "report", "reports", "study", "states", "says", "show", "shows",
]);

function normalizedText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}%$€£.'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return [...new Set(
    normalizedText(value)
      .split(" ")
      .map((token) => token.replace(/^[.'-]+|[.'-]+$/g, ""))
      .filter((token) => token.length >= 3 && !SUPPORT_STOP_WORDS.has(token)),
  )];
}

function sequenceTokens(value: string): string[] {
  return normalizedText(value)
    .split(" ")
    .map((token) => token.replace(/^[.'-]+|[.'-]+$/g, ""))
    .filter((token) => token.length >= 3 && !SUPPORT_STOP_WORDS.has(token));
}

function longestCommonSubsequenceLength(left: readonly string[], right: readonly string[]): number {
  const previous = new Array<number>(right.length + 1).fill(0);
  for (const leftToken of left) {
    const current = new Array<number>(right.length + 1).fill(0);
    for (let index = 1; index <= right.length; index += 1) {
      current[index] = leftToken === right[index - 1]
        ? (previous[index - 1] ?? 0) + 1
        : Math.max(previous[index] ?? 0, current[index - 1] ?? 0);
    }
    for (let index = 0; index < current.length; index += 1) previous[index] = current[index] ?? 0;
  }
  return previous[right.length] ?? 0;
}

/**
 * Conservative general relation binding. Automatic support requires the
 * shared content anchors (entities, predicates, metrics, and values) to retain
 * their order. This catches unmodeled transitive verbs and swapped values;
 * legitimate but heavily reordered paraphrases route to review.
 */
function orderedAnchorsConsistent(claim: string, source: string): boolean {
  const claimSequence = sequenceTokens(claim);
  const sourceSequence = sequenceTokens(source);
  const sourceSet = new Set(sourceSequence);
  const sharedClaimSequence = claimSequence.filter((token) => sourceSet.has(token));
  if (sharedClaimSequence.length < 3) return claimSequence.length < 3;
  const sharedSet = new Set(sharedClaimSequence);
  const sharedSourceSequence = sourceSequence.filter((token) => sharedSet.has(token));
  const lcs = longestCommonSubsequenceLength(sharedClaimSequence, sharedSourceSequence);
  return lcs / sharedClaimSequence.length >= 0.8;
}

const GENERIC_CAPITALIZED_STARTS = new Set([
  "a", "an", "according", "after", "although", "as", "because", "before", "for", "however",
  "if", "in", "it", "the", "this", "when", "while",
]);

function namedEntityAnchors(value: string): string[] {
  return [...new Set(
    [...value.matchAll(/\b[A-Z][A-Za-z0-9&.-]{1,}\b/g)]
      .map((match) => match[0].toLowerCase())
      .filter((anchor) => !GENERIC_CAPITALIZED_STARTS.has(anchor)),
  )];
}

function namedEntityOrderConsistent(claim: string, source: string): boolean {
  const anchors = namedEntityAnchors(claim);
  if (anchors.length < 2) return true;
  const normalizedSource = normalizedText(source);
  const positions = anchors.map((anchor) => normalizedSource.indexOf(anchor));
  if (positions.some((position) => position < 0)) return false;
  return positions.every((position, index) => index === 0 || position > (positions[index - 1] ?? -1));
}

function numericValueFrames(value: string): Map<string, string[]> {
  const sequence = sequenceTokens(value);
  const frames = new Map<string, string[]>();
  for (let index = 0; index < sequence.length; index += 1) {
    const token = sequence[index] ?? "";
    if (!/^\d/.test(token)) continue;
    const context = sequence
      .slice(Math.max(0, index - 2), index)
      .filter((candidate) => !/^\d/.test(candidate))
      .join(" ");
    frames.set(token, [...(frames.get(token) ?? []), context]);
  }
  return frames;
}

function numericValuesBoundConsistently(claim: string, source: string): boolean {
  const claimFrames = numericValueFrames(claim);
  if (claimFrames.size === 0) return true;
  const sourceFrames = numericValueFrames(source);
  for (const [value, contexts] of claimFrames) {
    const candidates = sourceFrames.get(value);
    if (!candidates) return false;
    if (!contexts.every((context) => candidates.includes(context))) return false;
  }
  return true;
}

function numbers(value: string): string[] {
  return [...new Set((value.match(/\d[\d,.]*(?:\s?%|\s?[xX])?/g) ?? []).map((number) => number.replace(/[\s,]/g, "").toLowerCase()))];
}

const NEGATION_PATTERN = /\b(?:cannot|can't|deni(?:ed|es|al)|didn't|doesn't|false|incorrect|isn't|never|no|not|refut(?:e|ed|es)|untrue|wasn't|without|won't)\b/i;
const UPWARD_PATTERN = /\b(?:above|gain(?:ed|s)?|grew|grow(?:s|th)?|higher|improv(?:e|ed|ement|es)|increas(?:e|ed|es)|more than|rise|rises|rose)\b/i;
const DOWNWARD_PATTERN = /\b(?:below|declin(?:e|ed|es)|decreas(?:e|ed|es)|fall|fell|falls|less than|lower|reduc(?:e|ed|es|tion))\b/i;
const EXPLICIT_COMPARISON_PATTERN =
  /\b(higher than|lower than|faster than|slower than|better than|worse than|more than|less than|cheaper than|costlier than|outperforms?|underperforms?|beats?)\b/i;

type ComparisonRelation = { left: string; right: string; polarity: "up" | "down" };

function comparisonRelation(value: string): ComparisonRelation | null {
  const normalized = normalizedText(value);
  const match = EXPLICIT_COMPARISON_PATTERN.exec(normalized);
  if (!match || match.index <= 0) return null;
  const operator = match[1]?.toLowerCase() ?? "";
  const leftTokens = normalized
    .slice(0, match.index)
    .split(" ")
    .filter((token) => token && !["is", "are", "was", "were", "has", "have"].includes(token))
    .slice(-3);
  const rightTokens = normalized
    .slice(match.index + match[0].length)
    .split(" ")
    .filter((token) => token && !["the", "a", "an"].includes(token))
    .slice(0, 3);
  if (leftTokens.length === 0 || rightTokens.length === 0) return null;
  const polarity = /^(?:lower|slower|worse|less|cheaper|underperform)/.test(operator)
    ? "down"
    : "up";
  return { left: leftTokens.join(" "), right: rightTokens.join(" "), polarity };
}

function sameComparisonEntity(left: string, right: string): boolean {
  return left === right || left.endsWith(` ${right}`) || right.endsWith(` ${left}`);
}

function comparisonRelationsConsistent(claim: string, source: string): boolean | null {
  const claimRelation = comparisonRelation(claim);
  if (!claimRelation) return null;
  const sourceRelation = comparisonRelation(source);
  if (!sourceRelation) return false;
  const sameOrder =
    sameComparisonEntity(claimRelation.left, sourceRelation.left) &&
    sameComparisonEntity(claimRelation.right, sourceRelation.right);
  if (sameOrder) return claimRelation.polarity === sourceRelation.polarity;
  const reversedOrder =
    sameComparisonEntity(claimRelation.left, sourceRelation.right) &&
    sameComparisonEntity(claimRelation.right, sourceRelation.left);
  return reversedOrder && claimRelation.polarity !== sourceRelation.polarity;
}

function comparisonDirection(value: string): "up" | "down" | "mixed" | null {
  const up = UPWARD_PATTERN.test(value);
  const down = DOWNWARD_PATTERN.test(value);
  if (up && down) return "mixed";
  if (up) return "up";
  if (down) return "down";
  return null;
}

const TRANSITIVE_RELATION_PATTERN =
  /\b(acquir(?:e|ed|es|ing)|bought|buy|buys|defeat(?:ed|s)?|beat(?:s)?|fir(?:e|ed|es|ing)|hir(?:e|ed|es|ing)|own(?:ed|s)?|purchas(?:e|ed|es|ing)|su(?:e|ed|es|ing))\b/i;

type TransitiveRelation = { subject: string; predicate: string; object: string };
type DirectionalRelation = {
  subject: string;
  direction: "up" | "down";
  values: string[];
};

function relationPredicate(value: string): string {
  if (/^(?:acquir|bought|buy|purchas)/.test(value)) return "acquire";
  if (/^(?:defeat|beat)/.test(value)) return "defeat";
  if (/^fir/.test(value)) return "fire";
  if (/^hir/.test(value)) return "hire";
  if (/^own/.test(value)) return "own";
  return "sue";
}

function relationEntity(value: string, side: "left" | "right"): string {
  const bounded = side === "right"
    ? value.split(/\b(?:after|at|before|by|during|for|from|in|on|to|with)\b/i)[0] ?? value
    : value;
  const entityTokens = tokens(bounded).filter((token) => !/^\d/.test(token));
  return (side === "left" ? entityTokens.slice(-3) : entityTokens.slice(0, 3)).join(" ");
}

function transitiveRelation(value: string): TransitiveRelation | null {
  const normalized = normalizedText(value);
  const match = TRANSITIVE_RELATION_PATTERN.exec(normalized);
  if (!match || match.index <= 0) return null;
  const subject = relationEntity(normalized.slice(0, match.index), "left");
  const object = relationEntity(normalized.slice(match.index + match[0].length), "right");
  if (!subject || !object) return null;
  return {
    subject,
    predicate: relationPredicate(match[1]?.toLowerCase() ?? ""),
    object,
  };
}

function transitiveRelationsConsistent(claim: string, source: string): boolean | null {
  const claimRelation = transitiveRelation(claim);
  if (!claimRelation) return null;
  const sourceRelation = transitiveRelation(source);
  return Boolean(
    sourceRelation &&
    claimRelation.predicate === sourceRelation.predicate &&
    sameComparisonEntity(claimRelation.subject, sourceRelation.subject) &&
    sameComparisonEntity(claimRelation.object, sourceRelation.object),
  );
}

function directionalRelations(value: string): DirectionalRelation[] | null {
  const relations: DirectionalRelation[] = [];
  const clauses = normalizedText(value).split(/\b(?:but|whereas|while)\b|[;]+/i);
  for (const clause of clauses) {
    const upMatch = UPWARD_PATTERN.exec(clause);
    const downMatch = DOWNWARD_PATTERN.exec(clause);
    if (!upMatch && !downMatch) continue;
    // Two opposing directions in one unsplittable clause are ambiguous. A
    // human must review rather than accepting a bag-of-words match.
    if (upMatch && downMatch) return null;
    const match = upMatch ?? downMatch;
    if (!match) continue;
    const subject = relationEntity(clause.slice(0, match.index), "left");
    if (!subject) return null;
    relations.push({
      subject,
      direction: upMatch ? "up" : "down",
      values: numbers(clause),
    });
  }
  return relations;
}

function directionalRelationsConsistent(claim: string, source: string): boolean | null {
  const claimRelations = directionalRelations(claim);
  if (claimRelations === null) return false;
  if (claimRelations.length === 0) return null;
  const sourceRelations = directionalRelations(source);
  if (!sourceRelations || sourceRelations.length === 0) return false;
  return claimRelations.every((claimRelation) =>
    sourceRelations.some((sourceRelation) =>
      sameComparisonEntity(claimRelation.subject, sourceRelation.subject) &&
      claimRelation.direction === sourceRelation.direction &&
      claimRelation.values.every((value) => sourceRelation.values.includes(value)),
    ),
  );
}

function quoteIsAffirmed(source: string, quote: string): boolean {
  let offset = source.indexOf(quote);
  while (offset >= 0) {
    const before = source.slice(Math.max(0, offset - 48), offset);
    const after = source.slice(offset + quote.length, offset + quote.length + 64);
    const refutedBefore = /\b(?:(?:falsely|incorrectly)\s+(?:claim(?:ed|s)?|report(?:ed|s)?|stat(?:e|ed|es))|deny|denied|false|incorrect|refute|refuted|untrue)(?:\s+that)?\s*$/i.test(before);
    const refutedAfter = /^\s*(?:is|was|are|were)?\s*(?:false|incorrect|misleading|refuted|untrue)\b/i.test(after);
    if (!refutedBefore && !refutedAfter) return true;
    offset = source.indexOf(quote, offset + quote.length);
  }
  return false;
}

function candidateSentences(sourceText: string): string[] {
  const candidates = sourceText
    .split(/(?<=[.!?])\s+|[\r\n]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return candidates.length > 0 ? candidates : [sourceText];
}

function lexicalSupport(claim: ClaimLedgerEntry, sourceText: string): ClaimSupportResult {
  const claimTokens = tokens(claim.text);
  const candidates = candidateSentences(sourceText);
  const best = candidates.reduce((current, candidate) => {
    const candidateTokens = new Set(tokens(candidate));
    const coverage = claimTokens.length === 0
      ? Number(normalizedText(candidate).includes(normalizedText(claim.text)))
      : claimTokens.filter((token) => candidateTokens.has(token)).length / claimTokens.length;
    return coverage > current.coverage ? { value: candidate, coverage } : current;
  }, { value: sourceText, coverage: 0 });
  const source = normalizedText(sourceText);
  const missingNumbers = numbers(claim.text).filter((number) => !numbers(best.value).includes(number));
  const quoteSupported = claim.quoteTexts.length === 0
    ? null
    : claim.quoteTexts.every((quote) => quoteIsAffirmed(source, normalizedText(quote)));
  const negationConsistent = NEGATION_PATTERN.test(claim.text) === NEGATION_PATTERN.test(best.value);
  const claimDirection = comparisonDirection(claim.text);
  const sourceDirection = comparisonDirection(best.value);
  const explicitComparison = comparisonRelationsConsistent(claim.text, best.value);
  const directionalComparison = directionalRelationsConsistent(claim.text, best.value);
  const comparisonConsistent = explicitComparison ?? directionalComparison ?? (
    claimDirection === null ||
    (sourceDirection !== null &&
      (claimDirection === "mixed" || sourceDirection === "mixed" || claimDirection === sourceDirection))
  );
  const relationConsistent = transitiveRelationsConsistent(claim.text, best.value) ?? true;
  const anchorsConsistent = orderedAnchorsConsistent(claim.text, best.value);
  const namedEntitiesConsistent = namedEntityOrderConsistent(claim.text, best.value);
  const numericBindingsConsistent = numericValuesBoundConsistently(claim.text, best.value);
  const supportScore = Math.round(best.coverage * 100);
  return {
    claimId: claim.claimId,
    supportScore,
    supported: supportScore >= 75 && missingNumbers.length === 0 && quoteSupported !== false &&
      negationConsistent && comparisonConsistent && relationConsistent && anchorsConsistent &&
      namedEntitiesConsistent && numericBindingsConsistent,
    quoteSupported,
    missingNumbers,
    negationConsistent,
    comparisonConsistent,
  };
}

function titleSimilarity(left: string | null, right: string | null): number | null {
  if (!left || !right) return null;
  const leftTokens = new Set(tokens(left));
  const rightTokens = new Set(tokens(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return null;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.min(leftTokens.size, rightTokens.size);
}

function findEvidence(recordList: readonly EvidenceRecord[], citationUrl: string | null): EvidenceRecord | null {
  if (!citationUrl) return null;
  return recordList.find((record) =>
    record.canonicalUrl === citationUrl || record.sourceUrl === citationUrl,
  ) ?? null;
}

function recordConflicts(record: EvidenceRecord, records: readonly EvidenceRecord[]): string[] {
  const citedUrls = new Set(records.flatMap((candidate) => [candidate.sourceUrl, candidate.canonicalUrl]));
  return record.conflictsWith.filter((url) => citedUrls.has(url));
}

function relevantPrimarySources(claim: ClaimLedgerEntry, records: readonly EvidenceRecord[]): EvidenceRecord[] {
  return records.filter((record) =>
    record.isPrimarySource && lexicalSupport(claim, record.supportingExcerpt).supported,
  );
}

function roundedRatio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : Math.round((numerator / denominator) * 1_000) / 1_000;
}

function packetRecords(evidence: EvidencePacket | readonly EvidenceRecord[]): readonly EvidenceRecord[] {
  return "records" in evidence ? evidence.records : evidence;
}

/**
 * Re-fetch and verify every citation. The default fetcher goes through the
 * hardened bounded/egress-checked page layer; tests and jobs may inject an
 * equivalent snapshot seam without bypassing verification logic.
 */
export async function verifyCitations(input: {
  markdown: string;
  evidence: EvidencePacket | readonly EvidenceRecord[];
  claims: readonly ClaimLedgerEntry[];
  fetchPage?: CitationPageFetcher;
  minFreshnessScore?: number;
  requirePrimaryWhenAvailable?: boolean;
  siteOrigin?: string;
  knownInternalTargets?: readonly string[];
}): Promise<CitationVerificationReport> {
  const evidenceRecords = packetRecords(input.evidence);
  const parsedCitations = parseMarkdownCitations(input.markdown);
  const canonicalSiteOrigin = input.siteOrigin ? canonicalizeSourceUrl(input.siteOrigin) : null;
  const siteDomain = canonicalSiteOrigin ? sourceDomain(canonicalSiteOrigin) : null;
  const internalTargets = new Set((input.knownInternalTargets ?? []).flatMap((target) => {
    if (!input.siteOrigin) return [];
    try {
      const canonical = canonicalizeSourceUrl(new URL(target, input.siteOrigin).toString());
      return canonical ? [canonical] : [];
    } catch {
      return [];
    }
  }));
  const excludedInternalCitationIds = parsedCitations.flatMap((citation) =>
    citation.canonicalUrl && sourceDomain(citation.canonicalUrl) === siteDomain && internalTargets.has(citation.canonicalUrl)
      ? [citation.citationId]
      : [],
  );
  const excludedInternal = new Set(excludedInternalCitationIds);
  const citations = parsedCitations.filter((citation) => !excludedInternal.has(citation.citationId));
  const fetchPage = input.fetchPage ?? defaultCitationPageFetcher;
  const minFreshnessScore = input.minFreshnessScore ?? 35;
  const claimByCitation = new Map<string, ClaimLedgerEntry[]>();
  for (const claim of input.claims) {
    for (const citationId of claim.citationIds) {
      claimByCitation.set(citationId, [...(claimByCitation.get(citationId) ?? []), claim]);
    }
  }

  const verifiedCitations = await Promise.all(citations.map(async (citation): Promise<CitationVerification> => {
    const evidence = findEvidence(evidenceRecords, citation.canonicalUrl);
    const attachedClaims = claimByCitation.get(citation.citationId) ?? [];
    const errors: string[] = [];
    let fetched: CitationPageSnapshot | null = null;
    try {
      fetched = await fetchPage(citation.url);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Citation fetch failed");
    }
    if (fetched?.errors.length) errors.push(...fetched.errors);

    const available = Boolean(
      fetched?.statusCode && fetched.statusCode >= 200 && fetched.statusCode < 300,
    );
    const finalCanonical = fetched
      ? canonicalizeSourceUrl(fetched.canonicalUrl || fetched.finalUrl)
      : null;
    const expectedUrls = evidence ? new Set([evidence.sourceUrl, evidence.canonicalUrl]) : new Set<string>();
    const domainConsistent = evidence && finalCanonical
      ? sourceDomain(finalCanonical) === evidence.domain
      : evidence ? false : null;
    const canonicalConsistent = evidence && finalCanonical
      ? expectedUrls.has(finalCanonical)
      : evidence ? false : null;
    const titleScore = evidence ? titleSimilarity(evidence.title, fetched?.title ?? null) : null;
    const titleConsistent = titleScore === null ? null : titleScore >= 0.5;
    const movedToUnrelatedPage = Boolean(
      available && evidence && canonicalConsistent === false &&
      (domainConsistent === false || titleConsistent === false),
    );
    const currentFreshnessScore = evidence
      ? scoreSourceFreshness({
          publishedAt: evidence.publishedAt,
          fetchedAt: new Date(),
          sourceType: evidence.sourceType,
          retrievalStatus: "fetched_verified",
          now: new Date(),
        }).score
      : 0;
    const stale = Boolean(evidence && currentFreshnessScore < minFreshnessScore);
    // Automatic verification is based on the current retrieved page only. A
    // stored excerpt may be old or provider-generated and cannot rescue a
    // changed page whose live content no longer supports the claim.
    const sourceText = available ? (fetched?.textContent ?? "") : "";
    const claimSupport = attachedClaims.map((claim) => lexicalSupport(claim, sourceText));
    const invented = evidence === null;
    const valid = Boolean(
      !invented &&
      available &&
      !movedToUnrelatedPage &&
      domainConsistent === true &&
      canonicalConsistent === true &&
      titleConsistent === true &&
      !stale,
    );
    if (invented) errors.push("Citation URL is not present in the evidence bundle.");
    if (!available) errors.push("Citation is unavailable.");
    if (movedToUnrelatedPage) errors.push("Citation moved to an unrelated page.");
    if (domainConsistent === false) errors.push("Citation destination domain does not match the evidence source.");
    if (canonicalConsistent === false) errors.push("Citation canonical destination does not match the evidence source.");
    if (titleConsistent === false) errors.push("Citation title no longer matches the evidence source.");
    if (domainConsistent === null) errors.push("Citation destination domain could not be verified.");
    if (canonicalConsistent === null) errors.push("Citation canonical destination could not be verified.");
    if (titleConsistent === null) errors.push("Citation title could not be verified.");
    if (stale) errors.push("Citation evidence is materially stale.");
    return {
      citationId: citation.citationId,
      url: citation.url,
      canonicalUrl: citation.canonicalUrl,
      evidenceId: evidence?.evidenceId ?? null,
      claimIds: attachedClaims.map((claim) => claim.claimId),
      invented,
      available,
      movedToUnrelatedPage,
      domainConsistent,
      canonicalConsistent,
      titleConsistent,
      stale,
      primarySource: evidence?.isPrimarySource ?? false,
      valid,
      fetched,
      claimSupport,
      errors: [...new Set(errors)],
    };
  }));

  const citationMap = new Map(verifiedCitations.map((citation) => [citation.citationId, citation]));
  const verifiedClaims: VerifiedClaim[] = input.claims.map((claim) => {
    const claimCitations = claim.citationIds.flatMap((id) => citationMap.get(id) ?? []);
    const claimEvidence = claimCitations.flatMap((citation) =>
      citation.evidenceId ? evidenceRecords.filter((record) => record.evidenceId === citation.evidenceId) : [],
    );
    const supports = claimCitations.flatMap((citation) =>
      citation.claimSupport.filter((support) => support.claimId === claim.claimId).map((support) => ({ citation, support })),
    );
    const successful = supports.filter(({ citation, support }) => citation.valid && support.supported);
    const strongest = supports.reduce((score, item) => Math.max(score, item.support.supportScore), 0);
    const quoteResults = supports.flatMap(({ support }) => support.quoteSupported === null ? [] : [support.quoteSupported]);
    const quoteVerified = quoteResults.length === 0 ? null : quoteResults.some(Boolean);
    // A cited source's declared conflict is meaningful even when the draft
    // omits the opposing source. Compare against the entire bounded packet so
    // selective citation cannot hide unresolved disagreement.
    const conflicting = claimEvidence.flatMap((record) => recordConflicts(record, evidenceRecords));
    // Phase 3 routes every declared material conflict to review. A nearby
    // transition word is not evidence that both positions were represented
    // and reconciled.
    const contradictionStatus = conflicting.length === 0 ? "none" : "unresolved";
    const staleEvidence = claimCitations.some((citation) => citation.stale);
    const primaryAvailable = relevantPrimarySources(claim, evidenceRecords).length > 0;
    const primaryUsed = successful.some(({ citation }) => citation.primarySource);
    const reasons: string[] = [];
    if (claim.material && claimCitations.length === 0) reasons.push("Material claim has no citation.");
    if (claim.material && successful.length === 0) reasons.push("No valid citation supports the material claim.");
    if (quoteVerified === false) reasons.push("Quoted text was not found in a cited source.");
    if (staleEvidence) reasons.push("Claim relies on stale evidence.");
    if (contradictionStatus === "unresolved") reasons.push("Conflicting evidence is not disclosed.");
    if ((input.requirePrimaryWhenAvailable ?? true) && primaryAvailable && !primaryUsed) {
      reasons.push("A relevant primary source is available but not cited.");
    }
    const supported = successful.length > 0 && quoteVerified !== false && !staleEvidence && contradictionStatus !== "unresolved";
    const verificationResult = supported
      ? "verified"
      : claimCitations.some((citation) => citation.available) ? "unsupported" : "unverifiable";
    return {
      claimId: claim.claimId,
      material: claim.material,
      citationIds: claim.citationIds,
      evidenceIds: [...new Set(claimEvidence.map((record) => record.evidenceId))],
      supported,
      supportStrength: strongest >= 75 ? "strong" : strongest >= 55 ? "weak" : "none",
      quoteVerified,
      contradictionStatus,
      staleEvidence,
      primarySourceAvailable: primaryAvailable,
      primarySourceUsed: primaryUsed,
      verificationResult,
      reasons,
    };
  });

  const preciseCitations = verifiedCitations.filter((citation) =>
    citation.valid && citation.claimSupport.length > 0 && citation.claimSupport.every((support) => support.supported),
  ).length;
  const materialClaims = verifiedClaims.filter((claim) => claim.material);
  const coveredClaims = materialClaims.filter((claim) => claim.supported).length;
  const primaryAvailableClaims = materialClaims.filter((claim) => claim.primarySourceAvailable);
  const primaryUsedClaims = primaryAvailableClaims.filter((claim) => claim.primarySourceUsed);
  const staleEvidenceIds = [...new Set(verifiedCitations.flatMap((citation) =>
    citation.stale && citation.evidenceId ? [citation.evidenceId] : [],
  ))];
  const conflictingEvidenceIds = [...new Set(verifiedClaims.flatMap((claim) =>
    claim.contradictionStatus === "unresolved" ? claim.evidenceIds : [],
  ))];
  const blockingReasons = [
    ...verifiedCitations.flatMap((citation) => citation.valid ? [] : citation.errors),
    ...verifiedClaims.flatMap((claim) => claim.material ? claim.reasons : []),
  ];
  const citationPrecision = roundedRatio(preciseCitations, verifiedCitations.length);
  const materialClaimCoverage = roundedRatio(coveredClaims, materialClaims.length);
  if (citationPrecision < 1) blockingReasons.push("Citation precision is below the automatic-publication threshold.");
  if (materialClaimCoverage < 1) blockingReasons.push("Material-claim coverage is below the automatic-publication threshold.");

  return {
    passed: blockingReasons.length === 0,
    evaluatorVersion: CITATION_VERIFIER_VERSION,
    citations: verifiedCitations,
    claims: verifiedClaims,
    citationPrecision,
    materialClaimCoverage,
    primarySourcePreference: {
      claimsWithPrimaryAvailable: primaryAvailableClaims.length,
      claimsUsingPrimary: primaryUsedClaims.length,
      rate: roundedRatio(primaryUsedClaims.length, primaryAvailableClaims.length),
    },
    inventedCitationCount: verifiedCitations.filter((citation) => citation.invented).length,
    unavailableCitationCount: verifiedCitations.filter((citation) => !citation.available).length,
    movedCitationCount: verifiedCitations.filter((citation) => citation.movedToUnrelatedPage).length,
    staleEvidenceIds,
    conflictingEvidenceIds,
    excludedInternalCitationIds,
    blockingReasons: [...new Set(blockingReasons)],
  };
}
