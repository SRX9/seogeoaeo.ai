import { getAgentControlState } from "@/lib/agent/memory";
import { isArticleGenerationBlockedByOwnerConstraint } from "@/lib/agent/policy";
import { parseTags } from "@/lib/articles/format";
import {
  getTopic,
  listArticleGroundingCorpus,
} from "@/lib/articles/repository";
import { pickShape, type ArticleShape } from "@/lib/articles/shapes";
import { lintArticle } from "@/lib/articles/style-lint";
import {
  getBrand,
  getBrandProfile,
  type BrandScope,
} from "@/lib/brand/repository";
import { listIntegrations } from "@/lib/integrations/repository";
import { isIntegrationOperational } from "@/lib/integrations/providers";
import { listPublishedDestinationsForBrand } from "@/lib/publishing/repository";
import type { ScoredTopic } from "@/lib/research/types";
import {
  CITATION_VERIFIER_VERSION,
  verifyCitations,
  type CitationVerificationReport,
} from "./citations";
import {
  CLAIM_EXTRACTOR_VERSION,
  extractMaterialClaims,
  type ClaimLedgerEntry,
} from "./claims";
import {
  INTERNAL_LINK_EVALUATOR_VERSION,
  validateContentMetadata,
  validateInternalLinkTargets,
} from "./content-validation";
import {
  EVIDENCE_FETCH_VERSION,
  EVIDENCE_PACKET_VERSION,
  EVIDENCE_PARSER_VERSION,
  PROVIDER_SNIPPET_FETCH_VERSION,
  createEvidencePacket,
  detectLikelyPromptInjection,
  hashSourceContent,
  isPrimarySourceType,
  renderEvidencePacketForPrompt,
  sourceDomain,
  type EvidenceInput,
  type EvidenceIntent,
  type EvidencePacket,
  type EvidenceRecord,
  type EvidenceSourceType,
} from "./evidence";
import {
  ORIGINALITY_EVALUATOR_VERSION,
  evaluateOriginality,
} from "./originality";
import {
  PUBLICATION_GATE_EVALUATOR_VERSION,
  REQUIRED_PUBLICATION_GATES,
  aggregatePublicationGate,
  hashFinalPublicationContent,
  publicationGateCheck,
  type AggregatedPublicationGate,
  type FinalPublicationContent,
  type PublicationGateCheck,
  type RequiredPublicationGate,
} from "./publication-gate";
import {
  createEvidenceBundleVersion,
  getLatestEvidenceBundleForTopic,
  getLatestPublicationGateForContent,
  recordPublicationGateRun,
  replaceArticleClaimLedger,
  type ArticleClaimInput,
  type CitationCheckInput,
  type PublicationGateCheckInput,
} from "./repository";
import {
  evaluateContentRisk,
  type ContentSourceTier,
} from "./risk-policy";

const STYLE_STRUCTURE_EVALUATOR_VERSION = "style-structure.v1";
const GROUNDED_CLAIMS_EVALUATOR_VERSION = "grounded-claims.v1";
const BRAND_FACT_EVALUATOR_VERSION = "brand-fact-consistency.v1";
const LINK_VALIDITY_EVALUATOR_VERSION = "link-validity.v1";
const OWNER_POLICY_EVALUATOR_VERSION = "owner-policy.v1";
const DESTINATION_CAPABILITY_EVALUATOR_VERSION = "destination-capability.v1";
const ROLLBACK_APPROVAL_EVALUATOR_VERSION = "rollback-or-approval.v1";
const CLAIM_LEDGER_EVALUATOR_VERSION = "claim-ledger.v1";
const RESEARCH_RELATION_EVALUATOR_VERSION = "research-source-relations.v1";
const INITIAL_RECHECK_INTERVAL_MS = 15 * 60 * 1_000;

type ResearchTopicRow = { id: string; title: string };

export type GenerationGrounding = {
  bundleId: string | null;
  bundleVersion: number | null;
  packet: EvidencePacket;
  promptPacket: string | null;
  evidenceSourceIds: Readonly<Record<string, string>>;
  siteOrigin: string | null;
  internalTargets: string[];
};

export type GroundingGateResult = {
  gate: string;
  passed: boolean;
  detail: string;
};

export type PrepareArticleGroundingInput = {
  articleId?: string | null;
  topicId: string;
  title: string;
  slug: string;
  metaDescription: string | null;
  tags: readonly string[];
  bodyMarkdown: string;
  shape: ArticleShape;
  actor: "agent" | "owner";
  stylePassed?: boolean;
  origin?: string | null;
  humanReviewApproved?: boolean;
  grounding?: GenerationGrounding;
};

export type PreparedArticleGrounding = {
  topicId: string;
  finalContent: FinalPublicationContent;
  finalContentHash: string | null;
  aggregate: AggregatedPublicationGate;
  gateResults: GroundingGateResult[];
  grounding: GenerationGrounding;
  claims: ClaimLedgerEntry[];
  citationReport: CitationVerificationReport;
  persistenceClaims: ArticleClaimInput[];
  persistenceCitations: CitationCheckInput[];
  persistenceChecks: PublicationGateCheckInput[];
  evaluatorVersions: Record<string, string>;
  riskLevel: string;
  ownerPolicyVersion: string;
  destinationKey: string;
  blockingReasons: string[];
};

export type RecordedArticleGrounding = {
  persisted: boolean;
  passed: boolean;
  claimLedgerId: string | null;
  gateRunId: string | null;
  prepared: PreparedArticleGrounding;
};

function emptyEvidencePacket(): EvidencePacket {
  return {
    version: EVIDENCE_PACKET_VERSION,
    createdAt: new Date().toISOString(),
    records: [],
    omittedSourceCount: 0,
    excerptCharacters: 0,
    limits: { maxSources: 12, maxExcerptChars: 1_200, maxPacketChars: 9_000 },
  };
}

function evidenceIntent(value: string | null | undefined): EvidenceIntent {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "bofu") return "transactional";
  if (normalized === "mofu") return "commercial";
  if (normalized === "tofu") return "informational";
  if (
    normalized === "informational" ||
    normalized === "commercial" ||
    normalized === "transactional" ||
    normalized === "navigational" ||
    normalized === "comparison"
  ) {
    return normalized;
  }
  return "unknown";
}

function evidenceSourceType(source: {
  sourceType: string;
  isPrimary?: boolean;
}): EvidenceSourceType {
  if (source.isPrimary || source.sourceType === "brand_owned" || source.sourceType === "gsc_query") {
    return "primary";
  }
  if (source.sourceType === "rss") return "news";
  if (source.sourceType === "sitemap" || source.sourceType === "competitor_gap") return "vendor";
  return "unknown";
}

function isEvidenceSourceType(value: string): value is EvidenceSourceType {
  return [
    "primary",
    "government",
    "academic",
    "standards_body",
    "industry",
    "news",
    "vendor",
    "community",
    "unknown",
  ].includes(value);
}

function dateToIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function usableSiteOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function sourceRelationship(record: EvidenceRecord) {
  if (record.conflictsWith.length > 0) return "conflicts" as const;
  if (record.corroborates.length > 0) return "corroborates" as const;
  return "neutral" as const;
}

const RESEARCH_UP_PATTERN =
  /\b(?:gain(?:ed|s)?|grew|growth|higher|improv(?:e|ed|ement|es)|increas(?:e|ed|es)|rise|rises|rose)\b/i;
const RESEARCH_DOWN_PATTERN =
  /\b(?:declin(?:e|ed|es)|decreas(?:e|ed|es)|fell|lower|reduc(?:e|ed|es|tion))\b/i;
const RESEARCH_NEGATION_PATTERN = /\b(?:cannot|doesn't|isn't|never|no|not|without)\b/i;
const RESEARCH_AVAILABLE_PATTERN = /\b(?:available|included|offers?|supports?)\b/i;
const RESEARCH_UNAVAILABLE_PATTERN =
  /\b(?:excludes?|lacks?|unavailable|unsupported)\b|\b(?:does not|doesn't|is not|isn't|not)\s+(?:include|included|offer|offered|support|supported|available)\b/i;
const RESEARCH_RELATION_STOP_WORDS = new Set([
  "about", "after", "also", "and", "before", "does", "from", "have", "into", "more",
  "that", "the", "their", "this", "those", "through", "using", "were", "while", "with",
]);

function researchRelationTerms(value: string): Set<string> {
  return new Set(
    (value.toLowerCase().match(/[a-z0-9]+/g) ?? [])
      .filter((token) => token.length >= 3 && !/^\d+$/.test(token))
      .filter((token) => !RESEARCH_RELATION_STOP_WORDS.has(token))
      .filter((token) => !RESEARCH_UP_PATTERN.test(token) && !RESEARCH_DOWN_PATTERN.test(token)),
  );
}

function researchDirection(value: string): "up" | "down" | null {
  const up = RESEARCH_UP_PATTERN.test(value);
  const down = RESEARCH_DOWN_PATTERN.test(value);
  if (up === down) return null;
  return up ? "up" : "down";
}

function researchNumbers(value: string): string[] {
  return [...new Set(
    (value.match(/\d[\d,.]*(?:\s?%|\s?[xX])?/g) ?? [])
      .map((number) => number.replace(/[\s,]/g, "").toLowerCase()),
  )].sort();
}

function detectedResearchConflict(left: EvidenceInput, right: EvidenceInput): boolean {
  const leftTerms = researchRelationTerms(left.supportingExcerpt);
  const rightTerms = researchRelationTerms(right.supportingExcerpt);
  const denominator = Math.min(leftTerms.size, rightTerms.size);
  if (denominator === 0) return false;
  const overlap = [...leftTerms].filter((term) => rightTerms.has(term)).length / denominator;
  if (overlap < 0.6) return false;
  const leftDirection = researchDirection(left.supportingExcerpt);
  const rightDirection = researchDirection(right.supportingExcerpt);
  if (leftDirection && rightDirection && leftDirection !== rightDirection) return true;
  const leftAvailable = RESEARCH_AVAILABLE_PATTERN.test(left.supportingExcerpt) &&
    !RESEARCH_UNAVAILABLE_PATTERN.test(left.supportingExcerpt);
  const rightAvailable = RESEARCH_AVAILABLE_PATTERN.test(right.supportingExcerpt) &&
    !RESEARCH_UNAVAILABLE_PATTERN.test(right.supportingExcerpt);
  const leftUnavailable = RESEARCH_UNAVAILABLE_PATTERN.test(left.supportingExcerpt);
  const rightUnavailable = RESEARCH_UNAVAILABLE_PATTERN.test(right.supportingExcerpt);
  if ((leftAvailable && rightUnavailable) || (rightAvailable && leftUnavailable)) return true;
  const leftNumbers = researchNumbers(left.supportingExcerpt);
  const rightNumbers = researchNumbers(right.supportingExcerpt);
  if (
    leftNumbers.length > 0 &&
    rightNumbers.length > 0 &&
    leftNumbers.join("|") !== rightNumbers.join("|")
  ) return true;
  if (
    RESEARCH_NEGATION_PATTERN.test(left.supportingExcerpt) !==
    RESEARCH_NEGATION_PATTERN.test(right.supportingExcerpt)
  ) return true;

  // Closely matching subjects with a different remaining predicate are
  // potential semantic oppositions (for example, encrypts vs plaintext).
  // Research intake cannot prove equivalence, so route these pairs to review.
  const divergentTerms = new Set([
    ...[...leftTerms].filter((term) => !rightTerms.has(term)),
    ...[...rightTerms].filter((term) => !leftTerms.has(term)),
  ]);
  return overlap >= 0.75 && divergentTerms.size > 0;
}

function detectResearchSourceRelationships(sources: readonly EvidenceInput[]): EvidenceInput[] {
  return sources.map((source, index) => ({
    ...source,
    conflictsWith: sources.flatMap((candidate, candidateIndex) =>
      candidateIndex !== index && detectedResearchConflict(source, candidate)
        ? [candidate.sourceUrl]
        : [],
    ),
    // Agreement needs stronger provenance than lexical similarity.
    corroborates: [],
  }));
}

/**
 * Persist one bounded evidence bundle per research topic. Provider snippets are
 * candidates for generation, never verified proof for automatic publication.
 */
export async function persistResearchEvidenceBundles(
  scope: BrandScope,
  researchRunId: string,
  createdTopics: readonly ResearchTopicRow[],
  scoredTopics: readonly ScoredTopic[],
) {
  const candidatesByTitle = new Map<string, ScoredTopic[]>();
  for (const scored of scoredTopics) {
    const key = normalizeTitle(scored.title);
    candidatesByTitle.set(key, [...(candidatesByTitle.get(key) ?? []), scored]);
  }

  return Promise.all(
    createdTopics.map(async (topic) => {
      const candidates = candidatesByTitle.get(normalizeTitle(topic.title)) ?? [];
      const scored = candidates.shift();
      const query = scored?.query?.trim() || scored?.title?.trim() || topic.title;
      const intent = evidenceIntent(scored?.intentTier);
      const sourceCandidates: EvidenceInput[] = (scored?.evidenceSources ?? []).flatMap((source) => {
        const excerpt = source.excerpt?.trim();
        if (!excerpt) return [];
        return [
          {
            searchQuery: source.query?.trim() || query,
            intent,
            sourceUrl: source.url,
            publisher: source.publisher ?? source.sourceLabel,
            title: source.title ?? source.sourceLabel,
            publishedAt: source.publishedAt ?? null,
            fetchedAt: source.fetchedAt ?? null,
            supportingExcerpt: excerpt,
            sourceType: evidenceSourceType(source),
            conflictsWith: [],
            // Co-occurrence in one provider response is not corroboration.
            // Relationships remain neutral until research supplies an explicit
            // agreement/conflict signal.
            corroborates: [],
            retrievalStatus: "provider_snippet_unverified",
            fetchVersion: PROVIDER_SNIPPET_FETCH_VERSION,
            parserVersion: EVIDENCE_PARSER_VERSION,
          },
        ];
      });
      const rawSources = detectResearchSourceRelationships(sourceCandidates);
      const packet = await createEvidencePacket(rawSources);
      const contentHash = await hashSourceContent(
        JSON.stringify({
          query,
          intent,
          records: packet.records.map((record) => [
            record.evidenceId,
            record.canonicalUrl,
            record.contentHash,
          ]),
        }),
      );
      return createEvidenceBundleVersion(scope, {
        topicId: topic.id,
        researchRunId,
        version: 1,
        idempotencyKey: `research:${researchRunId}:topic:${topic.id}:evidence:v1`,
        searchQuery: query,
        searchIntent: intent,
        contentHash,
        fetchVersion: PROVIDER_SNIPPET_FETCH_VERSION,
        parserVersion: EVIDENCE_PARSER_VERSION,
        status: packet.records.length > 0 ? "ready" : "failed",
        failureCode: packet.records.length > 0 ? null : "NO_BOUNDED_SOURCE_EXCERPT",
        failureMessage:
          packet.records.length > 0
            ? null
            : "Research produced no source excerpt suitable for grounded generation.",
        sources: packet.records.map((record) => ({
          sourceKey: record.evidenceId,
          sourceUrl: record.sourceUrl,
          canonicalUrl: record.canonicalUrl,
          publisher: record.publisher,
          domain: record.domain,
          title: record.title ?? record.domain,
          publishedAt: record.publishedAt ? new Date(record.publishedAt) : null,
          fetchedAt: new Date(record.fetchedAt),
          supportingExcerpt: record.supportingExcerpt,
          contentHash: record.contentHash,
          sourceType: record.sourceType,
          sourceQualityScore: record.sourceQualityScore,
          freshnessScore: record.freshnessScore,
          claimRelevance: record.claimRelevance,
          relationship: sourceRelationship(record),
          relationshipNotes:
            record.conflictsWith.length > 0
              ? `Conflicts with: ${record.conflictsWith.join(", ")}\nEvaluator: ${RESEARCH_RELATION_EVALUATOR_VERSION}`
              : record.corroborates.length > 0
                ? `Corroborates: ${record.corroborates.join(", ")}`
                : null,
          status: "candidate",
          fetchVersion: record.fetchVersion,
          parserVersion: record.parserVersion,
        })),
      });
    }),
  );
}

function packetFromStoredBundle(
  stored: NonNullable<Awaited<ReturnType<typeof getLatestEvidenceBundleForTopic>>>,
): { packet: EvidencePacket; sourceIds: Record<string, string> } {
  const records: EvidenceRecord[] = stored.sources.map((source) => {
    const sourceType = isEvidenceSourceType(source.sourceType) ? source.sourceType : "unknown";
    const fetchedAt = dateToIso(source.fetchedAt) ?? new Date().toISOString();
    const verified = source.status === "verified";
    const relationshipUrls = (prefix: string) =>
      source.relationshipNotes?.startsWith(prefix)
        ? source.relationshipNotes
            .slice(prefix.length)
            .split(/\r?\n/, 1)[0]
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : [];
    return {
      evidenceId: source.sourceKey,
      searchQuery: stored.bundle.searchQuery,
      intent: evidenceIntent(stored.bundle.searchIntent),
      sourceUrl: source.sourceUrl,
      canonicalUrl: source.canonicalUrl,
      publisher: source.publisher ?? source.domain,
      domain: source.domain,
      title: source.title,
      publishedAt: dateToIso(source.publishedAt),
      fetchedAt,
      supportingExcerpt: source.supportingExcerpt,
      contentHash: source.contentHash,
      sourceType,
      isPrimarySource: isPrimarySourceType(sourceType),
      sourceQualityScore: source.sourceQualityScore,
      freshnessScore: source.freshnessScore,
      claimRelevance: source.claimRelevance,
      conflictsWith:
        source.relationship === "conflicts" ? relationshipUrls("Conflicts with:") : [],
      corroborates:
        source.relationship === "corroborates" ? relationshipUrls("Corroborates:") : [],
      fetchVersion: source.fetchVersion,
      parserVersion: source.parserVersion,
      retrievalStatus: verified ? "fetched_verified" : "provider_snippet_unverified",
      verifiedAt: verified ? fetchedAt : null,
      promptInjection: detectLikelyPromptInjection(source.supportingExcerpt),
      trustBoundary: "untrusted_quoted_evidence",
    };
  });
  return {
    packet: {
      version: EVIDENCE_PACKET_VERSION,
      createdAt: dateToIso(stored.bundle.createdAt) ?? new Date().toISOString(),
      records,
      omittedSourceCount: 0,
      excerptCharacters: records.reduce((sum, record) => sum + record.supportingExcerpt.length, 0),
      limits: { maxSources: 12, maxExcerptChars: 1_200, maxPacketChars: 9_000 },
    },
    sourceIds: Object.fromEntries(stored.sources.map((source) => [source.sourceKey, source.id])),
  };
}

/** Load the sole bounded source packet generation prompts are allowed to see. */
export async function loadGenerationGrounding(
  scope: BrandScope,
  topicId: string,
): Promise<GenerationGrounding> {
  const [stored, profile, publishedTargets] = await Promise.all([
    getLatestEvidenceBundleForTopic(scope, topicId),
    getBrandProfile(scope.brandId),
    listPublishedDestinationsForBrand(scope.brandId),
  ]);
  const siteOrigin = usableSiteOrigin(profile?.website);
  const internalTargets = publishedTargets.flatMap((target) => {
    if (!target.externalUrl || !siteOrigin) return [];
    try {
      const url = new URL(target.externalUrl);
      return url.origin === siteOrigin ? [url.toString()] : [];
    } catch {
      return [];
    }
  });
  if (!stored) {
    return {
      bundleId: null,
      bundleVersion: null,
      packet: emptyEvidencePacket(),
      promptPacket: null,
      evidenceSourceIds: {},
      siteOrigin,
      internalTargets,
    };
  }
  const reconstructed = packetFromStoredBundle(stored);
  return {
    bundleId: stored.bundle.id,
    bundleVersion: stored.bundle.version,
    packet: reconstructed.packet,
    promptPacket: renderEvidencePacketForPrompt(reconstructed.packet),
    evidenceSourceIds: reconstructed.sourceIds,
    siteOrigin,
    internalTargets,
  };
}

function internalLinkRecommendations(markdown: string, siteOrigin: string | null) {
  const recommendations: Array<{ target: string; anchorText?: string }> = [];
  for (const match of markdown.matchAll(/(?<!!)\[([^\]\n]+)\]\(\s*<?([^\s)>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g)) {
    const target = match[2];
    if (!target || target.startsWith("#") || /^(?:mailto|tel|data):/i.test(target)) continue;
    if (/^https?:\/\//i.test(target)) {
      if (!siteOrigin) continue;
      try {
        if (new URL(target).origin !== siteOrigin) continue;
      } catch {
        continue;
      }
    }
    recommendations.push({ target, anchorText: match[1] });
  }
  return recommendations;
}

function usefulFramework(body: string): string | null {
  const lines = body.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const signal =
    /\b(?:framework|checklist|matrix|template|playbook|scorecard|decision tree|worksheet|calculator|interactive tool|worked example|example calculation|our data|we measured|we observed|we analyzed)\b/i;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!signal.test(line)) continue;
    const sample = lines.slice(index, index + 4).join(" ").replace(/^#+\s*/, "");
    const structured =
      lines.slice(index, index + 4).filter((item) => /^[-*+]\s|^\d+[.)]\s/.test(item)).length >= 2 ||
      /\b(?:first|second|third|step \d+|if .+ then|score|calculate|input|output)\b/i.test(sample);
    if (sample.length >= 90 && structured) return sample;
  }
  return null;
}

function strongestSourceTier(records: readonly EvidenceRecord[]): ContentSourceTier | null {
  if (records.some((record) => record.isPrimarySource)) return "tier_1_primary";
  if (records.some((record) => record.sourceQualityScore >= 68)) {
    return "tier_2_authoritative";
  }
  return records.length > 0 ? "tier_3_general" : null;
}

const SOURCE_TIER_RANK: Record<ContentSourceTier, number> = {
  tier_1_primary: 1,
  tier_2_authoritative: 2,
  tier_3_general: 3,
};

/**
 * Bind risk authority to successful citations, claim by claim. The effective
 * tier is the weakest best source among material claims, so an unrelated
 * primary source cannot elevate a comparative or high-risk assertion.
 */
function sourceTierForVerifiedMaterialClaims(
  claims: readonly ClaimLedgerEntry[],
  report: CitationVerificationReport,
  records: readonly EvidenceRecord[],
): ContentSourceTier | null {
  const citationById = new Map(report.citations.map((citation) => [citation.citationId, citation]));
  const evidenceById = new Map(records.map((record) => [record.evidenceId, record]));
  const tiers = claims.filter((claim) => claim.material).map((claim) => {
    const supportingRecords = claim.citationIds.flatMap((citationId) => {
      const citation = citationById.get(citationId);
      if (
        !citation?.valid ||
        !citation.evidenceId ||
        !citation.claimSupport.some((support) => support.claimId === claim.claimId && support.supported)
      ) {
        return [];
      }
      const record = evidenceById.get(citation.evidenceId);
      return record ? [record] : [];
    });
    return strongestSourceTier(supportingRecords);
  });
  if (tiers.length === 0 || tiers.some((tier) => tier === null)) return null;
  return tiers.reduce<ContentSourceTier>((weakest, tier) =>
    SOURCE_TIER_RANK[tier as ContentSourceTier] > SOURCE_TIER_RANK[weakest]
      ? (tier as ContentSourceTier)
      : weakest,
  tiers[0] as ContentSourceTier);
}

function hasAuthoritativeBrandSupport(
  claim: ClaimLedgerEntry,
  report: CitationVerificationReport,
  records: readonly EvidenceRecord[],
  brandDomain: string | null,
): boolean {
  const citationById = new Map(report.citations.map((citation) => [citation.citationId, citation]));
  const evidenceById = new Map(records.map((record) => [record.evidenceId, record]));
  return claim.citationIds.some((citationId) => {
    const citation = citationById.get(citationId);
    const record = citation?.evidenceId ? evidenceById.get(citation.evidenceId) : null;
    const supportsClaim = citation?.claimSupport.some(
      (support) => support.claimId === claim.claimId && support.supported,
    );
    return Boolean(
      citation?.valid &&
      supportsClaim &&
      record &&
      (record.isPrimarySource || (brandDomain !== null && record.domain === brandDomain)),
    );
  });
}

function resultReasons(passed: boolean, reasons: readonly string[], success: string) {
  return passed ? [success] : reasons.length > 0 ? [...reasons] : ["Evaluator did not pass."];
}

function check(
  passed: boolean,
  evaluatorVersion: string,
  reasons: readonly string[],
): PublicationGateCheck {
  return publicationGateCheck(passed, evaluatorVersion, passed ? [] : reasons);
}

function gateUiResults(
  aggregate: AggregatedPublicationGate,
  citationReport: CitationVerificationReport,
): GroundingGateResult[] {
  return [
    {
      gate: "style-lint",
      passed: aggregate.gates.style_structure.status === "passed",
      detail: aggregate.gates.style_structure.reasons.join("; ") || "Style and structure passed.",
    },
    {
      gate: "eeat-source",
      passed: citationReport.passed,
      detail: citationReport.passed
        ? "Every material claim has a currently verified source."
        : citationReport.blockingReasons.join("; "),
    },
    ...REQUIRED_PUBLICATION_GATES.map((gate) => ({
      gate,
      passed: aggregate.gates[gate].status === "passed",
      detail:
        aggregate.gates[gate].reasons.join("; ") ||
        (aggregate.gates[gate].status === "passed" ? "Passed." : "Blocked."),
    })),
  ];
}

function articleTags(value: string | readonly string[] | null | undefined): string[] {
  if (value == null) return [];
  return typeof value === "string" ? parseTags(value) : [...value];
}

function operationalDestinations(
  integrations: Awaited<ReturnType<typeof listIntegrations>>,
) {
  return integrations
    .filter(isIntegrationOperational)
    .filter((integration) => integration.capabilities.includes("article.create"))
    .sort((left, right) => left.provider.localeCompare(right.provider));
}

function statusForCitation(
  citation: CitationVerificationReport["citations"][number],
  claimId: string | null,
) {
  if (!citation.available) return "unavailable" as const;
  if (citation.stale) return "stale" as const;
  const support = claimId
    ? citation.claimSupport.find((item) => item.claimId === claimId)
    : null;
  return citation.valid &&
    citation.domainConsistent === true &&
    citation.canonicalConsistent === true &&
    citation.titleConsistent === true &&
    support?.supported === true
    ? ("passed" as const)
    : ("failed" as const);
}

function verificationStrength(value: "none" | "weak" | "strong") {
  return value === "strong" ? 1 : value === "weak" ? 0.6 : 0;
}

/** Evaluate exact final bytes before insertion; persistence happens after article id allocation. */
export async function prepareArticleGroundingEvaluation(
  scope: BrandScope,
  input: PrepareArticleGroundingInput,
): Promise<PreparedArticleGrounding> {
  const groundingPromise = input.grounding
    ? Promise.resolve(input.grounding)
    : loadGenerationGrounding(scope, input.topicId);
  const [grounding, topic, corpus, integrations, brand, profile, controls] = await Promise.all([
    groundingPromise,
    getTopic(scope.brandId, input.topicId),
    listArticleGroundingCorpus(scope.brandId, {
      query: [input.title, ...input.tags, input.bodyMarkdown].join(" "),
      limit: 200,
    }),
    listIntegrations(scope.brandId),
    getBrand(scope.workspaceId, scope.brandId),
    getBrandProfile(scope.brandId),
    getAgentControlState(scope.brandId),
  ]);

  const finalContent: FinalPublicationContent = {
    title: input.title,
    slug: input.slug,
    metaDescription: input.metaDescription,
    tags: [...input.tags],
    bodyMarkdown: input.bodyMarkdown,
  };
  const claims = extractMaterialClaims(input.bodyMarkdown, {
    evidence: grounding.packet,
    brandNames: brand?.name ? [brand.name] : [],
  });
  const siteOrigin = grounding.siteOrigin ?? usableSiteOrigin(profile?.website ?? input.origin);
  const citationReport = await verifyCitations({
    markdown: input.bodyMarkdown,
    evidence: grounding.packet,
    claims,
    siteOrigin: siteOrigin ?? undefined,
    knownInternalTargets: grounding.internalTargets,
  });
  const verifiedClaimById = new Map(citationReport.claims.map((claim) => [claim.claimId, claim]));
  const supportedClaims = claims.flatMap((claim) =>
    verifiedClaimById.get(claim.claimId)?.supported ? [claim.text] : [],
  );
  const adviceSupported =
    citationReport.claims.some((claim) => claim.material) &&
    citationReport.claims.filter((claim) => claim.material).every((claim) => claim.supported);
  const verifiedMaterialSourceTier = sourceTierForVerifiedMaterialClaims(
    claims,
    citationReport,
    grounding.packet.records,
  );
  const riskPreview = evaluateContentRisk({
    title: input.title,
    body: input.bodyMarkdown,
    metadata: [input.metaDescription ?? ""],
    strongestSourceTier: verifiedMaterialSourceTier,
    humanReviewApproved: input.humanReviewApproved === true,
    adviceSupported,
  });
  const disclaimerRequired = riskPreview.categories.some((category) =>
    ["medical_health", "legal", "financial"].includes(category),
  );
  const disclaimerPresent =
    /\b(?:not (?:medical|legal|financial) advice|consult (?:a|an|your) (?:doctor|physician|lawyer|attorney|financial adviser|qualified professional))\b/i.test(
      input.bodyMarkdown,
    );
  const risk = evaluateContentRisk({
    title: input.title,
    body: input.bodyMarkdown,
    metadata: [input.metaDescription ?? ""],
    strongestSourceTier: verifiedMaterialSourceTier,
    humanReviewApproved: input.humanReviewApproved === true,
    adviceSupported,
    disclaimerRequired,
    disclaimerPresent,
  });
  const supportedBrandEvidence = claims.flatMap((claim) =>
    claim.claimType === "brand_fact" && verifiedClaimById.get(claim.claimId)?.supported
      ? [claim.text]
      : [],
  );
  const originality = evaluateOriginality({
    proposed: {
      title: input.title,
      body: input.bodyMarkdown,
      keywords: topic?.keywords ? topic.keywords.split(",").map((value) => value.trim()).filter(Boolean) : [],
      intent: topic?.intentTier ?? null,
      distinctThesis: topic?.thesis ?? topic?.angle ?? null,
      originalBrandEvidence: supportedBrandEvidence,
      usefulFramework: usefulFramework(input.bodyMarkdown),
    },
    existingBrandContent: corpus
      .filter((article) => article.id !== input.articleId)
      .map((article) => ({
        id: article.id,
        title: article.title,
        body: article.bodyMarkdown,
        keywords: articleTags(article.tags),
      })),
    searchThemes: grounding.packet.records.map((record) => ({
      id: record.evidenceId,
      text: `${record.title ?? ""} ${record.supportingExcerpt.slice(0, 400)}`,
    })),
  });
  const recommendations = internalLinkRecommendations(input.bodyMarkdown, siteOrigin);
  const internalLinks =
    recommendations.length === 0
      ? {
          passed: true,
          evaluatorVersion: INTERNAL_LINK_EVALUATOR_VERSION,
          validTargets: [] as string[],
          invalidTargets: [],
          blockingReasons: [] as string[],
        }
      : siteOrigin
        ? validateInternalLinkTargets({
            siteOrigin,
            recommendations,
            knownTargets: grounding.internalTargets.map((target) => ({ target, available: true })),
          })
        : {
            passed: false,
            evaluatorVersion: INTERNAL_LINK_EVALUATOR_VERSION,
            validTargets: [] as string[],
            invalidTargets: recommendations.map(({ target }) => ({
              target,
              reason: "unknown" as const,
            })),
            blockingReasons: ["Internal links cannot be verified without a brand site origin."],
          };
  const metadata = validateContentMetadata({
    metadata: {
      title: input.title,
      description: input.metaDescription ?? "",
    },
    supportedClaims,
  });
  const materialClaims = citationReport.claims.filter((claim) => claim.material);
  const groundedClaimsPassed =
    grounding.bundleId !== null &&
    grounding.packet.records.length > 0 &&
    materialClaims.every((claim) => claim.supported);
  const brandClaimIds = new Set(
    claims.filter((claim) => claim.claimType === "brand_fact" && claim.material).map((claim) => claim.claimId),
  );
  const brandDomain = siteOrigin ? sourceDomain(siteOrigin) : null;
  const brandFactsPassed = claims
    .filter((claim) => brandClaimIds.has(claim.claimId))
    .every((claim) =>
      hasAuthoritativeBrandSupport(
        claim,
        citationReport,
        grounding.packet.records,
        brandDomain,
      ),
    );
  const destinations = operationalDestinations(integrations);
  const destinationKey = destinations.map((destination) => destination.provider).join(",");
  const blockedByOwnerConstraint = controls.ownerConstraints.some((constraint) =>
    isArticleGenerationBlockedByOwnerConstraint(constraint, input.title),
  );
  const ownerPolicyPassed =
    input.actor === "owner" ||
    Boolean(
      brand &&
        !controls.paused &&
        !controls.publishingPaused &&
        !blockedByOwnerConstraint &&
        (brand.autonomyMode === "FULL_AUTO" || controls.grantedCapabilities.includes("article.create")),
    );
  const destinationCapabilityPassed = destinations.length > 0;
  const rollbackPassed =
    destinations.length > 0 &&
    destinations.every((destination) => destination.capabilities.includes("rollback.supported"));
  const stylePassed = input.stylePassed ?? lintArticle(input.bodyMarkdown, input.shape).passed;

  const gates: Record<RequiredPublicationGate, PublicationGateCheck> = {
    style_structure: check(
      stylePassed,
      STYLE_STRUCTURE_EVALUATOR_VERSION,
      ["The final article failed the deterministic style/structure check."],
    ),
    grounded_material_claims: check(
      groundedClaimsPassed,
      GROUNDED_CLAIMS_EVALUATOR_VERSION,
      resultReasons(
        groundedClaimsPassed,
        [
          ...(grounding.bundleId ? [] : ["No usable evidence bundle is attached to the topic."]),
          ...(grounding.packet.records.length > 0 ? [] : ["The evidence bundle has no usable sources."]),
          ...citationReport.claims.flatMap((claim) =>
            claim.material && !claim.supported ? claim.reasons : [],
          ),
        ],
        "All material claims are grounded.",
      ),
    ),
    citation_validity_coverage: check(
      citationReport.passed,
      CITATION_VERIFIER_VERSION,
      citationReport.blockingReasons,
    ),
    brand_fact_consistency: check(
      brandFactsPassed,
      BRAND_FACT_EVALUATOR_VERSION,
      ["A material brand fact is not supported by verified evidence."],
    ),
    risk_classification: check(risk.passed, risk.evaluatorVersion, risk.blockingReasons),
    originality_information_gain: check(
      originality.originalityPassed,
      ORIGINALITY_EVALUATOR_VERSION,
      originality.blockingReasons,
    ),
    duplication_cannibalization: check(
      originality.cannibalizationPassed,
      ORIGINALITY_EVALUATOR_VERSION,
      originality.blockingReasons,
    ),
    link_validity: check(
      citationReport.passed && internalLinks.passed,
      LINK_VALIDITY_EVALUATOR_VERSION,
      [...citationReport.blockingReasons, ...internalLinks.blockingReasons],
    ),
    metadata_validity: check(metadata.passed, metadata.evaluatorVersion, metadata.blockingReasons),
    owner_policy: check(
      ownerPolicyPassed,
      OWNER_POLICY_EVALUATOR_VERSION,
      ["Owner policy does not permit automatic publication for this content."],
    ),
    destination_capability: check(
      destinationCapabilityPassed,
      DESTINATION_CAPABILITY_EVALUATOR_VERSION,
      ["No operational destination exposes article.create."],
    ),
    rollback_or_irreversible_approval: check(
      rollbackPassed,
      ROLLBACK_APPROVAL_EVALUATOR_VERSION,
      ["Every automatic destination needs rollback support or recorded irreversible approval."],
    ),
  };
  const aggregate = await aggregatePublicationGate({ finalContent, gates });
  const evidenceById = new Map(grounding.packet.records.map((record) => [record.evidenceId, record]));
  const citationById = new Map(citationReport.citations.map((citation) => [citation.citationId, citation]));
  const persistenceClaims: ArticleClaimInput[] = claims.map((claim, ordinal) => {
    const verified = verifiedClaimById.get(claim.claimId);
    const links = (verified?.citationIds ?? []).flatMap((citationId) => {
      const citation = citationById.get(citationId);
      const evidenceSourceId = citation?.evidenceId
        ? grounding.evidenceSourceIds[citation.evidenceId]
        : null;
      if (!citation || !evidenceSourceId) return [];
      const support = citation.claimSupport.find((item) => item.claimId === claim.claimId);
      return [
        {
          evidenceSourceId,
          relationship: "supports" as const,
          supportStrength: Math.max(0, Math.min(1, (support?.supportScore ?? 0) / 100)),
          verificationStatus:
            citation.valid && support?.supported ? ("verified" as const) : ("rejected" as const),
          evaluatorVersion: CITATION_VERIFIER_VERSION,
        },
      ];
    });
    const notApplicable = !claim.material && ["opinion", "example", "prediction"].includes(claim.claimType);
    return {
      claimKey: claim.claimId,
      ordinal,
      claimText: claim.text,
      claimHash: "pending",
      claimType: claim.claimType,
      material: claim.material,
      supportStrength: verificationStrength(verified?.supportStrength ?? "none"),
      contradictionStatus: verified?.contradictionStatus ?? "pending",
      verificationResult: notApplicable
        ? "not_applicable"
        : verified?.contradictionStatus === "unresolved"
          ? "conflicted"
          : verified?.supported
            ? "supported"
            : "unsupported",
      evaluatorVersion: CLAIM_EXTRACTOR_VERSION,
      evidenceLinks: links,
    };
  });
  await Promise.all(
    persistenceClaims.map(async (claim) => {
      claim.claimHash = await hashSourceContent(claim.claimText);
    }),
  );
  const persistenceCitations: CitationCheckInput[] = (await Promise.all(citationReport.citations.map(async (citation) => {
    const record = citation.evidenceId ? evidenceById.get(citation.evidenceId) : null;
    const retrievedContentHash = citation.fetched?.textContent
      ? await hashSourceContent(citation.fetched.textContent)
      : null;
    const claimKeys = citation.claimIds.length > 0 ? citation.claimIds : [null];
    return claimKeys.map((claimKey) => {
      const support = claimKey
        ? citation.claimSupport.find((item) => item.claimId === claimKey)
        : null;
      const status = statusForCitation(citation, claimKey);
      return {
        citationKey: claimKey ? `${citation.citationId}:${claimKey}` : citation.citationId,
        claimKey,
        evidenceSourceId: citation.evidenceId
          ? grounding.evidenceSourceIds[citation.evidenceId] ?? null
          : null,
        evidenceSourceRef: citation.evidenceId,
        citedUrl: citation.url,
        resolvedUrl: citation.fetched?.finalUrl ?? null,
        canonicalUrl: citation.fetched?.canonicalUrl ?? citation.canonicalUrl,
        expectedTitle: record?.title ?? null,
        expectedDomain: record?.domain ?? null,
        status,
        linkAvailable: citation.available,
        canonicalMatches: citation.canonicalConsistent,
        titleMatches: citation.titleConsistent,
        domainMatches: citation.domainConsistent,
        supportsClaim: support?.supported ?? false,
        sourceFresh: !citation.stale,
        invented: citation.invented,
        evaluatorVersion: CITATION_VERIFIER_VERSION,
        fetchVersion: EVIDENCE_FETCH_VERSION,
        retrievedContentHash,
        failureCode: status === "passed" ? null : citation.errors[0] ?? "CITATION_VERIFICATION_FAILED",
        failureMessage: status === "passed" ? null : citation.errors.join("; "),
        checkedAt: new Date(),
      } satisfies CitationCheckInput;
    });
  }))).flat();
  const evaluatorVersions = Object.fromEntries(
    REQUIRED_PUBLICATION_GATES.map((gate) => [gate, aggregate.evaluatorVersions[gate] as string]),
  );
  const persistenceChecks: PublicationGateCheckInput[] = REQUIRED_PUBLICATION_GATES.map((gate) => {
    const value = aggregate.gates[gate];
    return {
      gateKey: gate,
      required: true,
      status:
        value.status === "passed" || value.status === "failed" || value.status === "error"
          ? value.status
          : "error",
      evaluatorVersion: value.evaluatorVersion ?? "missing-evaluator.v1",
      details: {
        reasons: value.reasons,
        destinationKey,
        actor: input.actor,
      },
      failureCode: value.status === "passed" ? null : `GATE_${gate.toUpperCase()}_BLOCKED`,
      checkedAt: new Date(),
    };
  });

  return {
    topicId: input.topicId,
    finalContent,
    finalContentHash: aggregate.finalContentHash,
    aggregate,
    gateResults: gateUiResults(aggregate, citationReport),
    grounding,
    claims,
    citationReport,
    persistenceClaims,
    persistenceCitations,
    persistenceChecks,
    evaluatorVersions,
    riskLevel: risk.riskLevel,
    ownerPolicyVersion: input.actor === "agent" ? "agent-owner-policy.v1" : "owner-direct.v1",
    destinationKey,
    blockingReasons: aggregate.blockingReasons,
  };
}

/** Store the claim ledger and all 12 gate checks for the exact article version/hash. */
export async function recordArticleGroundingEvaluation(
  scope: BrandScope,
  article: { id: string; version: number },
  prepared: PreparedArticleGrounding,
  options: { evaluationKey?: string; delayedRecheck?: boolean } = {},
): Promise<RecordedArticleGrounding> {
  if (!prepared.grounding.bundleId || !prepared.finalContentHash) {
    return {
      persisted: false,
      passed: false,
      claimLedgerId: null,
      gateRunId: null,
      prepared,
    };
  }
  const evaluationKey =
    options.evaluationKey ??
    `grounding:${article.id}:v${article.version}:${prepared.finalContentHash}:${PUBLICATION_GATE_EVALUATOR_VERSION}`;
  const ledger = await replaceArticleClaimLedger(scope, {
    articleId: article.id,
    evidenceBundleId: prepared.grounding.bundleId,
    articleVersion: article.version,
    finalContentHash: prepared.finalContentHash,
    evaluationKey,
    evaluatorVersion: CLAIM_LEDGER_EVALUATOR_VERSION,
    claims: prepared.persistenceClaims,
    citationChecks: prepared.persistenceCitations,
  });
  const gate = await recordPublicationGateRun(scope, {
    articleId: article.id,
    claimLedgerId: ledger.ledger.id,
    articleVersion: article.version,
    finalContentHash: prepared.finalContentHash,
    evaluationKey,
    evaluatorSetVersion: PUBLICATION_GATE_EVALUATOR_VERSION,
    evaluatorVersions: prepared.evaluatorVersions,
    requiredGateKeys: REQUIRED_PUBLICATION_GATES,
    checks: prepared.persistenceChecks,
    riskLevel: prepared.riskLevel,
    ownerPolicyVersion: prepared.ownerPolicyVersion,
    destination: prepared.destinationKey,
    recheckAfter: new Date(Date.now() + INITIAL_RECHECK_INTERVAL_MS),
  });
  return {
    persisted: true,
    passed: gate.run.status === "passed" && gate.run.automaticPublicationAllowed === true,
    claimLedgerId: ledger.ledger.id,
    gateRunId: gate.run.id,
    prepared,
  };
}

function gateIsFreshForAgent(
  gate: NonNullable<Awaited<ReturnType<typeof getLatestPublicationGateForContent>>>,
  destinationKey: string,
) {
  const requiredKeys = gate.run.requiredGateKeys;
  const evaluatorVersions = gate.run.evaluatorVersions;
  const exactRequiredSet =
    requiredKeys.length === REQUIRED_PUBLICATION_GATES.length &&
    REQUIRED_PUBLICATION_GATES.every((key) => requiredKeys.includes(key));
  const exactChecks =
    gate.checks.length === REQUIRED_PUBLICATION_GATES.length &&
    REQUIRED_PUBLICATION_GATES.every((key) => {
      const matches = gate.checks.filter((entry) => entry.gateKey === key);
      return matches.length === 1 &&
        matches[0]?.status === "passed" &&
        matches[0]?.passed === true &&
        matches[0]?.evaluatorVersion === evaluatorVersions[key];
    });
  return (
    gate.run.status === "passed" &&
    gate.run.automaticPublicationAllowed === true &&
    gate.run.ownerPolicyVersion === "agent-owner-policy.v1" &&
    gate.run.destination === destinationKey &&
    gate.run.recheckAfter instanceof Date &&
    gate.run.recheckAfter.getTime() > Date.now() &&
    exactRequiredSet &&
    exactChecks
  );
}

/**
 * Last executor-boundary check for actor=agent. Stale or mismatched decisions
 * are re-evaluated with fresh citation fetches before any remote adapter runs.
 */
export async function assertFreshAutomaticPublicationGate(
  scope: BrandScope,
  article: {
    id: string;
    topicId: string | null;
    version: number;
    title: string;
    slug: string;
    metaDescription: string | null;
    tags: string | null;
    bodyMarkdown: string;
    shape: string | null;
  },
  options: { origin?: string | null } = {},
) {
  const finalContent: FinalPublicationContent = {
    title: article.title,
    slug: article.slug,
    metaDescription: article.metaDescription,
    tags: articleTags(article.tags),
    bodyMarkdown: article.bodyMarkdown,
  };
  const [hash, integrations] = await Promise.all([
    hashFinalPublicationContent(finalContent),
    listIntegrations(scope.brandId),
  ]);
  const destinationKey = operationalDestinations(integrations)
    .map((destination) => destination.provider)
    .join(",");
  const stored = await getLatestPublicationGateForContent(scope, article.id, article.version, hash);
  if (stored && gateIsFreshForAgent(stored, destinationKey)) return stored;
  if (!article.topicId) {
    throw new Error("Automatic publication blocked: article has no evidence-bearing topic.");
  }
  const shape = (article.shape ?? pickShape({ title: article.title })) as ArticleShape;
  const prepared = await prepareArticleGroundingEvaluation(scope, {
    articleId: article.id,
    topicId: article.topicId,
    title: article.title,
    slug: article.slug,
    metaDescription: article.metaDescription,
    tags: articleTags(article.tags),
    bodyMarkdown: article.bodyMarkdown,
    shape,
    actor: "agent",
    stylePassed: lintArticle(article.bodyMarkdown, shape).passed,
    origin: options.origin,
  });
  const recorded = await recordArticleGroundingEvaluation(scope, article, prepared, {
    delayedRecheck: true,
    evaluationKey: `grounding-recheck:${article.id}:v${article.version}:${hash}:window:${Math.floor(Date.now() / INITIAL_RECHECK_INTERVAL_MS)}`,
  });
  if (!recorded.passed) {
    throw new Error(
      `Automatic publication blocked by grounded-content gates: ${prepared.blockingReasons.join("; ") || "gate persistence failed"}`,
    );
  }
  const refreshed = await getLatestPublicationGateForContent(scope, article.id, article.version, hash);
  if (!refreshed || !gateIsFreshForAgent(refreshed, destinationKey)) {
    throw new Error("Automatic publication blocked: no fresh exact-content gate decision exists.");
  }
  return refreshed;
}
