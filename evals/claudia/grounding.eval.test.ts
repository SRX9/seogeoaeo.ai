import { describe, expect, it } from "vitest";
import { z } from "zod";
import { extractMaterialClaims } from "@/lib/grounding/claims";
import { verifyCitations, type CitationPageFetcher } from "@/lib/grounding/citations";
import { validateContentMetadata } from "@/lib/grounding/content-validation";
import {
  canonicalizeSourceUrl,
  createEvidencePacket,
  type EvidenceInput,
} from "@/lib/grounding/evidence";
import { evaluateOriginality } from "@/lib/grounding/originality";
import {
  aggregatePublicationGate,
  publicationGateCheck,
} from "@/lib/grounding/publication-gate";
import { evaluateContentRisk } from "@/lib/grounding/risk-policy";
import scenariosJson from "./scenarios/grounding-v1.json";

const categories = [
  "source_rich_technical_article",
  "weak_or_conflicting_evidence",
  "stale_sources",
  "fake_statistics_temptation",
  "missing_brand_specifics",
  "competitor_comparisons",
  "ymyl_topics",
  "prompt_injection_in_source",
  "citation_moved_unrelated",
  "duplicate_or_cannibalizing_topic",
  "genuine_original_brand_data",
] as const;

const evidenceSchema = z.object({
  searchQuery: z.string().min(1),
  intent: z.enum([
    "informational",
    "commercial",
    "transactional",
    "navigational",
    "comparison",
    "unknown",
  ]),
  sourceUrl: z.string().url(),
  canonicalUrl: z.string().url().nullable().optional(),
  publisher: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  publishedAt: z.string().datetime().nullable().optional(),
  fetchedAt: z.string().datetime().nullable().optional(),
  sourceContent: z.string().nullable().optional(),
  supportingExcerpt: z.string().min(1),
  sourceType: z.enum([
    "primary",
    "government",
    "academic",
    "standards_body",
    "industry",
    "news",
    "vendor",
    "community",
    "unknown",
  ]),
  sourceQualityScore: z.number().min(0).max(100),
  freshnessScore: z.number().min(0).max(100),
  claimRelevance: z.number().min(0).max(100),
  conflictsWith: z.array(z.string().url()).default([]),
  corroborates: z.array(z.string().url()).default([]),
  fetchVersion: z.string().optional(),
  parserVersion: z.string().optional(),
  retrievalStatus: z.enum(["fetched_verified", "provider_snippet_unverified"]),
  fetch: z.object({
    finalUrl: z.string().url(),
    canonicalUrl: z.string().url().nullable(),
    statusCode: z.number().int().nullable(),
    title: z.string().nullable(),
    textContent: z.string(),
  }).strict(),
}).strict();

const groundingScenarioSchema = z.object({
  version: z.literal("claudia-grounding-eval-v1"),
  id: z.string().min(1),
  category: z.enum(categories),
  brandName: z.string().min(1),
  title: z.string().min(1),
  slug: z.string().min(1),
  bodyMarkdown: z.string().min(1),
  metaDescription: z.string().min(1),
  tags: z.array(z.string()),
  evidence: z.array(evidenceSchema),
  originality: z.object({
    keywords: z.array(z.string()).optional(),
    intent: z.string().nullable().optional(),
    distinctThesis: z.string().nullable().optional(),
    originalBrandEvidence: z.array(z.string()).optional(),
    usefulFramework: z.string().nullable().optional(),
    existingBrandContent: z.array(z.object({
      id: z.string(),
      title: z.string(),
      body: z.string().nullable().optional(),
      keywords: z.array(z.string()).optional(),
      intent: z.string().nullable().optional(),
    }).strict()).default([]),
    searchThemes: z.array(z.object({ id: z.string(), text: z.string() }).strict()).default([]),
  }).strict(),
  risk: z.object({
    strongestSourceTier: z.enum([
      "tier_1_primary",
      "tier_2_authoritative",
      "tier_3_general",
    ]).nullable().optional(),
    humanReviewApproved: z.boolean().optional(),
    adviceSupported: z.boolean().optional(),
    disclaimerRequired: z.boolean().optional(),
    disclaimerPresent: z.boolean().optional(),
  }).strict(),
  expected: z.object({
    decision: z.enum(["allow_automatic_publication", "block"]),
    citationPassed: z.boolean().optional(),
    riskPassed: z.boolean().optional(),
    originalityPassed: z.boolean().optional(),
    cannibalizationPassed: z.boolean().optional(),
    metadataPassed: z.boolean().optional(),
    promptInjectionDetected: z.boolean().optional(),
    conflictingEvidence: z.boolean().optional(),
    staleEvidence: z.boolean().optional(),
    unsupportedBrandFact: z.boolean().optional(),
    movedCitationCount: z.number().int().nonnegative().optional(),
    riskCategory: z.enum([
      "medical_health",
      "legal",
      "financial",
      "safety",
      "regulated_products",
      "employment_discrimination",
      "minors",
      "reputational_allegations",
      "comparative_claims",
    ]).optional(),
    informationGainSignal: z.enum([
      "distinct_thesis",
      "original_brand_evidence",
      "useful_framework",
    ]).optional(),
  }).strict(),
}).strict();

const scenarios = groundingScenarioSchema.array().parse(scenariosJson);

async function evaluateScenario(scenario: (typeof scenarios)[number]) {
  const inputs: EvidenceInput[] = scenario.evidence.map(({ fetch: _fetch, ...input }) => {
    void _fetch;
    return input;
  });
  const evidence = await createEvidencePacket(inputs, {
    now: new Date("2026-07-14T00:00:00.000Z"),
  });
  const claims = extractMaterialClaims(scenario.bodyMarkdown, {
    evidence,
    brandNames: [scenario.brandName],
  });
  const fetchPage: CitationPageFetcher = async (url) => {
    const canonical = canonicalizeSourceUrl(url);
    const source = scenario.evidence.find(
      (candidate) => canonicalizeSourceUrl(candidate.sourceUrl) === canonical,
    );
    if (!source) {
      return {
        requestedUrl: url,
        finalUrl: url,
        statusCode: 404,
        canonicalUrl: null,
        title: null,
        textContent: "",
        errors: ["No eval fetch fixture exists for this URL."],
      };
    }
    return {
      requestedUrl: url,
      ...source.fetch,
      errors: [],
    };
  };
  const citations = await verifyCitations({
    markdown: scenario.bodyMarkdown,
    evidence,
    claims,
    fetchPage,
  });
  const supportedClaimIds = new Set(
    citations.claims.filter((claim) => claim.supported).map((claim) => claim.claimId),
  );
  const supportedClaims = claims
    .filter((claim) => supportedClaimIds.has(claim.claimId))
    .map((claim) => claim.text);
  const metadata = validateContentMetadata({
    metadata: {
      title: scenario.title,
      description: scenario.metaDescription,
    },
    supportedClaims,
  });
  const risk = evaluateContentRisk({
    title: scenario.title,
    body: scenario.bodyMarkdown,
    metadata: [scenario.metaDescription],
    ...scenario.risk,
  });
  const originality = evaluateOriginality({
    proposed: {
      title: scenario.title,
      body: scenario.bodyMarkdown,
      keywords: scenario.originality.keywords,
      intent: scenario.originality.intent,
      distinctThesis: scenario.originality.distinctThesis,
      originalBrandEvidence: scenario.originality.originalBrandEvidence,
      usefulFramework: scenario.originality.usefulFramework,
    },
    existingBrandContent: scenario.originality.existingBrandContent,
    searchThemes: scenario.originality.searchThemes,
  });
  const verifiedClaims = new Map(citations.claims.map((claim) => [claim.claimId, claim]));
  const brandFactConsistency = claims
    .filter((claim) => claim.material && claim.claimType === "brand_fact")
    .every((claim) => verifiedClaims.get(claim.claimId)?.supported === true);
  const gate = await aggregatePublicationGate({
    finalContent: {
      title: scenario.title,
      slug: scenario.slug,
      metaDescription: scenario.metaDescription,
      tags: scenario.tags,
      bodyMarkdown: scenario.bodyMarkdown,
    },
    gates: {
      style_structure: publicationGateCheck(true, "grounding-eval-style.v1"),
      grounded_material_claims: publicationGateCheck(
        citations.materialClaimCoverage === 1,
        citations.evaluatorVersion,
        citations.blockingReasons,
      ),
      citation_validity_coverage: publicationGateCheck(
        citations.passed,
        citations.evaluatorVersion,
        citations.blockingReasons,
      ),
      brand_fact_consistency: publicationGateCheck(
        brandFactConsistency,
        citations.evaluatorVersion,
      ),
      risk_classification: publicationGateCheck(
        risk.passed,
        risk.evaluatorVersion,
        risk.blockingReasons,
      ),
      originality_information_gain: publicationGateCheck(
        originality.originalityPassed,
        originality.evaluatorVersion,
        originality.blockingReasons,
      ),
      duplication_cannibalization: publicationGateCheck(
        originality.cannibalizationPassed,
        originality.evaluatorVersion,
        originality.blockingReasons,
      ),
      link_validity: publicationGateCheck(
        citations.citations.every((citation) => citation.valid),
        citations.evaluatorVersion,
        citations.blockingReasons,
      ),
      metadata_validity: publicationGateCheck(
        metadata.passed,
        metadata.evaluatorVersion,
        metadata.blockingReasons,
      ),
      owner_policy: publicationGateCheck(true, "grounding-eval-owner-policy.v1"),
      destination_capability: publicationGateCheck(true, "grounding-eval-destination.v1"),
      rollback_or_irreversible_approval: publicationGateCheck(
        true,
        "grounding-eval-rollback.v1",
      ),
    },
  });
  const unsupportedBrandFact = claims.some(
    (claim) =>
      claim.material &&
      claim.claimType === "brand_fact" &&
      verifiedClaims.get(claim.claimId)?.supported !== true,
  );

  return {
    decision: gate.decision,
    citationPassed: citations.passed,
    citationReasons: citations.blockingReasons,
    riskPassed: risk.passed,
    originalityPassed: originality.originalityPassed,
    cannibalizationPassed: originality.cannibalizationPassed,
    metadataPassed: metadata.passed,
    promptInjectionDetected: evidence.records.some((record) => record.promptInjection.detected),
    conflictingEvidence: citations.conflictingEvidenceIds.length > 0,
    staleEvidence: citations.staleEvidenceIds.length > 0,
    unsupportedBrandFact,
    movedCitationCount: citations.movedCitationCount,
    riskCategories: risk.categories,
    informationGainSignals: originality.informationGainSignals,
  };
}

describe("Claudia grounding evaluation v1", () => {
  it("covers the Phase 3 content cases and fail-closes unsafe publication", async () => {
    expect([...new Set(scenarios.map((scenario) => scenario.category))].sort()).toEqual(
      [...categories].sort(),
    );
    expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(scenarios.length);

    for (const scenario of scenarios) {
      const actual = await evaluateScenario(scenario);
      const context = `${scenario.id}: ${JSON.stringify(actual)}`;
      expect(actual.decision, context).toBe(scenario.expected.decision);
      if (scenario.expected.citationPassed !== undefined) {
        expect(actual.citationPassed, scenario.id).toBe(scenario.expected.citationPassed);
      }
      if (scenario.expected.riskPassed !== undefined) {
        expect(actual.riskPassed, scenario.id).toBe(scenario.expected.riskPassed);
      }
      if (scenario.expected.originalityPassed !== undefined) {
        expect(actual.originalityPassed, scenario.id).toBe(scenario.expected.originalityPassed);
      }
      if (scenario.expected.cannibalizationPassed !== undefined) {
        expect(actual.cannibalizationPassed, scenario.id).toBe(
          scenario.expected.cannibalizationPassed,
        );
      }
      if (scenario.expected.metadataPassed !== undefined) {
        expect(actual.metadataPassed, scenario.id).toBe(scenario.expected.metadataPassed);
      }
      if (scenario.expected.promptInjectionDetected !== undefined) {
        expect(actual.promptInjectionDetected, scenario.id).toBe(
          scenario.expected.promptInjectionDetected,
        );
      }
      if (scenario.expected.conflictingEvidence !== undefined) {
        expect(actual.conflictingEvidence, scenario.id).toBe(
          scenario.expected.conflictingEvidence,
        );
      }
      if (scenario.expected.staleEvidence !== undefined) {
        expect(actual.staleEvidence, scenario.id).toBe(scenario.expected.staleEvidence);
      }
      if (scenario.expected.unsupportedBrandFact !== undefined) {
        expect(actual.unsupportedBrandFact, scenario.id).toBe(
          scenario.expected.unsupportedBrandFact,
        );
      }
      if (scenario.expected.movedCitationCount !== undefined) {
        expect(actual.movedCitationCount, scenario.id).toBe(
          scenario.expected.movedCitationCount,
        );
      }
      if (scenario.expected.riskCategory !== undefined) {
        expect(actual.riskCategories, scenario.id).toContain(scenario.expected.riskCategory);
      }
      if (scenario.expected.informationGainSignal !== undefined) {
        expect(actual.informationGainSignals, scenario.id).toContain(
          scenario.expected.informationGainSignal,
        );
      }
    }
  });
});
