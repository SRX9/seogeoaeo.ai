import { and, asc, desc, eq, gt, inArray, isNull, lte, notExists } from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import { parseTags } from "@/lib/articles/format";
import { getDb } from "@/lib/db";
import { hashFinalPublicationContent } from "@/lib/grounding/publication-gate";
import {
  articleClaimLedgers,
  articleClaims,
  articles,
  citationChecks,
  evidenceBundles,
  evidenceClaimLinks,
  evidenceSources,
  publicationGateChecks,
  publicationGateRuns,
  researchRuns,
  topics,
} from "@/lib/db/schema";

export const MAX_EVIDENCE_EXCERPT_CHARACTERS = 2_000;
export const MAX_EVIDENCE_SOURCES_PER_BUNDLE = 50;
export const EVIDENCE_RETENTION_DAYS = 90;
export const GROUNDING_AUDIT_RETENTION_DAYS = 365;

export type EvidenceSourceStatus =
  | "candidate"
  | "pending"
  | "verified"
  | "unavailable"
  | "stale"
  | "rejected";
export type ClaimType =
  | "factual"
  | "opinion"
  | "brand_fact"
  | "calculation"
  | "example"
  | "prediction";
export type ClaimVerificationResult =
  | "pending"
  | "supported"
  | "unsupported"
  | "conflicted"
  | "not_applicable";
export type GateCheckStatus = "pending" | "passed" | "failed" | "error";

export class GroundingPersistenceError extends Error {
  constructor(
    message: string,
    readonly code:
      | "SCOPE_MISMATCH"
      | "INVALID_INPUT"
      | "CONTENT_VERSION_MISMATCH"
      | "EVIDENCE_MISMATCH",
  ) {
    super(message);
    this.name = "GroundingPersistenceError";
  }
}

function assertNonEmpty(value: string, field: string) {
  if (!value.trim()) {
    throw new GroundingPersistenceError(`${field} must not be empty.`, "INVALID_INPUT");
  }
}

function assertUnitScore(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new GroundingPersistenceError(`${field} must be between 0 and 1.`, "INVALID_INPUT");
  }
}

function assertPercentageScore(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new GroundingPersistenceError(`${field} must be between 0 and 100.`, "INVALID_INPUT");
  }
}

function assertUnique(values: readonly string[], field: string) {
  if (new Set(values).size !== values.length) {
    throw new GroundingPersistenceError(`${field} must be unique.`, "INVALID_INPUT");
  }
}

function canonicalAuditValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalAuditValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalAuditValue(entry)]),
    );
  }
  return value;
}

async function auditInputHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalAuditValue(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function withoutCheckedAt<T extends { checkedAt?: unknown }>(value: T) {
  const stableValue = { ...value };
  delete stableValue.checkedAt;
  return stableValue;
}

function boundedRetention(input: Date | undefined, maximumDays: number) {
  const now = Date.now();
  const maximum = now + maximumDays * 24 * 60 * 60 * 1_000;
  const value = input?.getTime() ?? maximum;
  if (!Number.isFinite(value) || value <= now || value > maximum + 60_000) {
    throw new GroundingPersistenceError(
      `retentionUntil must be in the future and no more than ${maximumDays} days away.`,
      "INVALID_INPUT",
    );
  }
  return new Date(value);
}

export type EvidenceSourceInput = {
  sourceKey: string;
  sourceUrl: string;
  canonicalUrl: string;
  publisher?: string | null;
  domain: string;
  title: string;
  publishedAt?: Date | null;
  fetchedAt: Date;
  supportingExcerpt: string;
  contentHash: string;
  sourceType: string;
  sourceQualityScore: number;
  freshnessScore: number;
  claimRelevance: number;
  relationship?: "corroborates" | "conflicts" | "neutral";
  relationshipNotes?: string | null;
  status?: EvidenceSourceStatus;
  fetchVersion?: string;
  parserVersion?: string;
};

export type CreateEvidenceBundleVersionInput = {
  topicId: string;
  researchRunId?: string | null;
  version: number;
  idempotencyKey: string;
  searchQuery: string;
  searchIntent: string;
  contentHash: string;
  fetchVersion: string;
  parserVersion: string;
  supersedesId?: string | null;
  sources: readonly EvidenceSourceInput[];
  /** Omit to derive `ready` only when every source is a bounded candidate or verified. */
  status?: "ready" | "failed";
  failureCode?: string | null;
  failureMessage?: string | null;
  retentionUntil?: Date;
};

/** Create one complete bundle version and all of its bounded sources atomically. */
export async function createEvidenceBundleVersion(
  scope: BrandScope,
  input: CreateEvidenceBundleVersionInput,
) {
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new GroundingPersistenceError("Evidence bundle version must be positive.", "INVALID_INPUT");
  }
  for (const [field, value] of [
    ["idempotencyKey", input.idempotencyKey],
    ["searchQuery", input.searchQuery],
    ["searchIntent", input.searchIntent],
    ["contentHash", input.contentHash],
    ["fetchVersion", input.fetchVersion],
    ["parserVersion", input.parserVersion],
  ] as const) {
    assertNonEmpty(value, field);
  }
  assertUnique(
    input.sources.map((source) => source.sourceKey),
    "Evidence source keys",
  );
  if (input.sources.length > MAX_EVIDENCE_SOURCES_PER_BUNDLE) {
    throw new GroundingPersistenceError(
      `An evidence bundle can contain at most ${MAX_EVIDENCE_SOURCES_PER_BUNDLE} sources.`,
      "INVALID_INPUT",
    );
  }
  assertUnique(
    input.sources.map((source) => `${source.canonicalUrl}\u0000${source.contentHash}`),
    "Evidence source canonical URL/content hashes",
  );

  for (const source of input.sources) {
    for (const [field, value] of [
      ["sourceKey", source.sourceKey],
      ["sourceUrl", source.sourceUrl],
      ["canonicalUrl", source.canonicalUrl],
      ["domain", source.domain],
      ["title", source.title],
      ["contentHash", source.contentHash],
      ["sourceType", source.sourceType],
    ] as const) {
      assertNonEmpty(value, field);
    }
    if (
      !source.supportingExcerpt.trim() ||
      source.supportingExcerpt.length > MAX_EVIDENCE_EXCERPT_CHARACTERS
    ) {
      throw new GroundingPersistenceError(
        `supportingExcerpt must contain 1-${MAX_EVIDENCE_EXCERPT_CHARACTERS} characters.`,
        "INVALID_INPUT",
      );
    }
    assertPercentageScore(source.sourceQualityScore, "sourceQualityScore");
    assertPercentageScore(source.freshnessScore, "freshnessScore");
    assertPercentageScore(source.claimRelevance, "claimRelevance");
  }

  const retentionUntil = boundedRetention(input.retentionUntil, EVIDENCE_RETENTION_DAYS);
  const requestedStatus =
    input.status ??
    (input.sources.length > 0 &&
    input.sources.every((source) => ["candidate", "verified"].includes(source.status ?? "candidate"))
      ? "ready"
      : "failed");
  if (
    requestedStatus === "ready" &&
    (input.sources.length === 0 ||
      input.sources.some(
        (source) => !["candidate", "verified"].includes(source.status ?? "candidate"),
      ))
  ) {
    throw new GroundingPersistenceError(
      "A ready evidence bundle requires at least one usable candidate or verified source.",
      "INVALID_INPUT",
    );
  }
  const requestHash = await auditInputHash({
    topicId: input.topicId,
    researchRunId: input.researchRunId ?? null,
    version: input.version,
    idempotencyKey: input.idempotencyKey,
    searchQuery: input.searchQuery,
    searchIntent: input.searchIntent,
    contentHash: input.contentHash,
    fetchVersion: input.fetchVersion,
    parserVersion: input.parserVersion,
    supersedesId: input.supersedesId ?? null,
    status: requestedStatus,
    failureCode: input.failureCode ?? null,
    failureMessage: input.failureMessage ?? null,
    sources: input.sources,
  });

  return getDb().transaction(async (tx) => {
    const [topic] = await tx
      .select({ id: topics.id })
      .from(topics)
      .where(
        and(
          eq(topics.id, input.topicId),
          eq(topics.workspaceId, scope.workspaceId),
          eq(topics.brandId, scope.brandId),
        ),
      )
      .limit(1);
    if (!topic) {
      throw new GroundingPersistenceError("Topic is outside the requested scope.", "SCOPE_MISMATCH");
    }

    if (input.researchRunId) {
      const [run] = await tx
        .select({ id: researchRuns.id })
        .from(researchRuns)
        .where(
          and(
            eq(researchRuns.id, input.researchRunId),
            eq(researchRuns.workspaceId, scope.workspaceId),
            eq(researchRuns.brandId, scope.brandId),
          ),
        )
        .limit(1);
      if (!run) {
        throw new GroundingPersistenceError(
          "Research run is outside the requested scope.",
          "SCOPE_MISMATCH",
        );
      }
    }

    if (input.supersedesId) {
      const [prior] = await tx
        .select({ id: evidenceBundles.id, version: evidenceBundles.version })
        .from(evidenceBundles)
        .where(
          and(
            eq(evidenceBundles.id, input.supersedesId),
            eq(evidenceBundles.workspaceId, scope.workspaceId),
            eq(evidenceBundles.brandId, scope.brandId),
            eq(evidenceBundles.topicId, input.topicId),
          ),
        )
        .limit(1);
      if (!prior || prior.version >= input.version) {
        throw new GroundingPersistenceError(
          "Superseded bundle must be an older version in the requested topic scope.",
          "SCOPE_MISMATCH",
        );
      }
    }

    const [bundle] = await tx
      .insert(evidenceBundles)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        topicId: input.topicId,
        researchRunId: input.researchRunId ?? null,
        version: input.version,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        searchQuery: input.searchQuery,
        searchIntent: input.searchIntent,
        status: requestedStatus,
        contentHash: input.contentHash,
        sourceCount: input.sources.length,
        fetchVersion: input.fetchVersion,
        parserVersion: input.parserVersion,
        supersedesId: input.supersedesId ?? null,
        failureCode: requestedStatus === "failed" ? (input.failureCode ?? "NO_VERIFIED_EVIDENCE") : null,
        failureMessage: requestedStatus === "failed" ? (input.failureMessage ?? null) : null,
        completedAt: new Date(),
        retentionUntil,
      })
      .onConflictDoNothing()
      .returning();

    if (!bundle) {
      const [existing] = await tx
        .select()
        .from(evidenceBundles)
        .where(
          and(
            eq(evidenceBundles.workspaceId, scope.workspaceId),
            eq(evidenceBundles.brandId, scope.brandId),
            eq(evidenceBundles.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (
        !existing ||
        existing.topicId !== input.topicId ||
        existing.version !== input.version ||
        existing.requestHash !== requestHash
      ) {
        const [versionWinner] = await tx
          .select({ id: evidenceBundles.id, idempotencyKey: evidenceBundles.idempotencyKey })
          .from(evidenceBundles)
          .where(
            and(
              eq(evidenceBundles.workspaceId, scope.workspaceId),
              eq(evidenceBundles.brandId, scope.brandId),
              eq(evidenceBundles.topicId, input.topicId),
              eq(evidenceBundles.version, input.version),
            ),
          )
          .limit(1);
        throw new GroundingPersistenceError(
          versionWinner
            ? "Evidence bundle version belongs to a different idempotent request."
            : "Evidence idempotency key belongs to different work.",
          "EVIDENCE_MISMATCH",
        );
      }
      const sources = await tx
        .select()
        .from(evidenceSources)
        .where(
          and(
            eq(evidenceSources.workspaceId, scope.workspaceId),
            eq(evidenceSources.brandId, scope.brandId),
            eq(evidenceSources.bundleId, existing.id),
          ),
        )
        .orderBy(asc(evidenceSources.createdAt));
      return { bundle: existing, sources };
    }

    const sources =
      input.sources.length === 0
        ? []
        : await tx
            .insert(evidenceSources)
            .values(
              input.sources.map((source) => ({
                workspaceId: scope.workspaceId,
                brandId: scope.brandId,
                bundleId: bundle.id,
                sourceKey: source.sourceKey,
                sourceUrl: source.sourceUrl,
                canonicalUrl: source.canonicalUrl,
                publisher: source.publisher ?? null,
                domain: source.domain,
                title: source.title,
                publishedAt: source.publishedAt ?? null,
                fetchedAt: source.fetchedAt,
                supportingExcerpt: source.supportingExcerpt,
                contentHash: source.contentHash,
                sourceType: source.sourceType,
                sourceQualityScore: source.sourceQualityScore,
                freshnessScore: source.freshnessScore,
                claimRelevance: source.claimRelevance,
                relationship: source.relationship ?? "neutral",
                relationshipNotes: source.relationshipNotes ?? null,
                status: source.status ?? "candidate",
                fetchVersion: source.fetchVersion ?? input.fetchVersion,
                parserVersion: source.parserVersion ?? input.parserVersion,
                retentionUntil,
              })),
            )
            .returning();

    return { bundle, sources };
  });
}

/** Latest usable evidence only: pending, failed, expired, and purged bundles are excluded. */
export async function getLatestEvidenceBundleForTopic(scope: BrandScope, topicId: string) {
  const now = new Date();
  const [bundle] = await getDb()
    .select()
    .from(evidenceBundles)
    .where(
      and(
        eq(evidenceBundles.workspaceId, scope.workspaceId),
        eq(evidenceBundles.brandId, scope.brandId),
        eq(evidenceBundles.topicId, topicId),
        eq(evidenceBundles.status, "ready"),
        gt(evidenceBundles.retentionUntil, now),
        isNull(evidenceBundles.purgedAt),
      ),
    )
    .orderBy(desc(evidenceBundles.version), desc(evidenceBundles.createdAt))
    .limit(1);
  if (!bundle) return null;

  const sources = await getDb()
    .select()
    .from(evidenceSources)
    .where(
      and(
        eq(evidenceSources.workspaceId, scope.workspaceId),
        eq(evidenceSources.brandId, scope.brandId),
        eq(evidenceSources.bundleId, bundle.id),
        inArray(evidenceSources.status, ["candidate", "verified"]),
        gt(evidenceSources.retentionUntil, now),
        isNull(evidenceSources.purgedAt),
      ),
    )
    .orderBy(desc(evidenceSources.claimRelevance), asc(evidenceSources.createdAt));
  return { bundle, sources };
}

export type ClaimEvidenceLinkInput = {
  evidenceSourceId: string;
  relationship?: "supports" | "contradicts" | "context";
  supportStrength: number;
  verificationStatus: "pending" | "verified" | "rejected" | "stale";
  evaluatorVersion?: string;
};

export type ArticleClaimInput = {
  claimKey: string;
  ordinal: number;
  claimText: string;
  claimHash: string;
  claimType: ClaimType;
  material: boolean;
  supportStrength: number;
  contradictionStatus: "pending" | "none" | "disclosed" | "unresolved";
  verificationResult: ClaimVerificationResult;
  evaluatorVersion?: string;
  evidenceLinks: readonly ClaimEvidenceLinkInput[];
};

export type CitationCheckInput = {
  citationKey: string;
  claimKey?: string | null;
  evidenceSourceId?: string | null;
  /** Stable non-content evidence ID retained after excerpt/source purge. */
  evidenceSourceRef?: string | null;
  citedUrl: string;
  resolvedUrl?: string | null;
  canonicalUrl?: string | null;
  expectedTitle?: string | null;
  expectedDomain?: string | null;
  status: "pending" | "passed" | "failed" | "stale" | "unavailable";
  linkAvailable?: boolean | null;
  canonicalMatches?: boolean | null;
  titleMatches?: boolean | null;
  domainMatches?: boolean | null;
  supportsClaim?: boolean | null;
  sourceFresh?: boolean | null;
  invented?: boolean | null;
  evaluatorVersion?: string;
  fetchVersion: string;
  /** SHA-256 of the bounded current page text used for this check. */
  retrievedContentHash?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  checkedAt?: Date | null;
};

export type ReplaceArticleClaimLedgerInput = {
  articleId: string;
  evidenceBundleId: string;
  articleVersion: number;
  finalContentHash: string;
  /** Retry-stable identity for one immutable claim/citation observation. */
  evaluationKey: string;
  evaluatorVersion: string;
  claims: readonly ArticleClaimInput[];
  citationChecks: readonly CitationCheckInput[];
  retentionUntil?: Date;
};

function claimCanPass(
  claim: ArticleClaimInput,
  citations: readonly CitationCheckInput[],
) {
  if (!claim.material) return true;
  if (claim.verificationResult === "not_applicable") {
    return claim.claimType === "opinion" || claim.claimType === "example" || claim.claimType === "prediction";
  }
  if (claim.verificationResult !== "supported") return false;
  return claim.evidenceLinks.some((link) => {
    if (
      (link.relationship ?? "supports") !== "supports" ||
      link.verificationStatus !== "verified"
    ) {
      return false;
    }
    return citations.some(
      (citation) =>
        citation.status === "passed" &&
        citation.claimKey === claim.claimKey &&
        citation.evidenceSourceId === link.evidenceSourceId &&
        Boolean(citation.retrievedContentHash?.trim()),
    );
  });
}

/** Replace a complete claim/citation evaluation for exact final article bytes atomically. */
export async function replaceArticleClaimLedger(
  scope: BrandScope,
  input: ReplaceArticleClaimLedgerInput,
) {
  if (!Number.isInteger(input.articleVersion) || input.articleVersion < 1) {
    throw new GroundingPersistenceError("Article version must be positive.", "INVALID_INPUT");
  }
  assertNonEmpty(input.finalContentHash, "finalContentHash");
  assertNonEmpty(input.evaluationKey, "evaluationKey");
  assertNonEmpty(input.evaluatorVersion, "evaluatorVersion");
  assertUnique(
    input.claims.map((claim) => claim.claimKey),
    "Claim keys",
  );
  assertUnique(
    input.claims.map((claim) => String(claim.ordinal)),
    "Claim ordinals",
  );
  assertUnique(
    input.citationChecks.map((citation) => citation.citationKey),
    "Citation keys",
  );

  const claimKeys = new Set(input.claims.map((claim) => claim.claimKey));
  const evidenceIds = new Set<string>();
  for (const claim of input.claims) {
    assertNonEmpty(claim.claimKey, "claimKey");
    assertNonEmpty(claim.claimText, "claimText");
    assertNonEmpty(claim.claimHash, "claimHash");
    if (!Number.isInteger(claim.ordinal) || claim.ordinal < 0) {
      throw new GroundingPersistenceError("Claim ordinal must be non-negative.", "INVALID_INPUT");
    }
    assertUnitScore(claim.supportStrength, "claim supportStrength");
    assertUnique(
      claim.evidenceLinks.map((link) => link.evidenceSourceId),
      `Evidence links for ${claim.claimKey}`,
    );
    for (const link of claim.evidenceLinks) {
      assertUnitScore(link.supportStrength, "evidence link supportStrength");
      evidenceIds.add(link.evidenceSourceId);
    }
  }
  for (const citation of input.citationChecks) {
    assertNonEmpty(citation.citationKey, "citationKey");
    assertNonEmpty(citation.citedUrl, "citedUrl");
    assertNonEmpty(citation.fetchVersion, "citation fetchVersion");
    if (citation.claimKey && !claimKeys.has(citation.claimKey)) {
      throw new GroundingPersistenceError(
        `Citation ${citation.citationKey} references an unknown claim key.`,
        "INVALID_INPUT",
      );
    }
    if (
      citation.status === "passed" &&
      (!citation.claimKey ||
        !citation.evidenceSourceId ||
        !citation.retrievedContentHash?.trim() ||
        citation.linkAvailable !== true ||
        citation.canonicalMatches !== true ||
        citation.titleMatches !== true ||
        citation.domainMatches !== true ||
        citation.supportsClaim !== true ||
        citation.sourceFresh !== true ||
        citation.invented !== false)
    ) {
      throw new GroundingPersistenceError(
        `Citation ${citation.citationKey} cannot pass until every retrieval and support check passes.`,
        "INVALID_INPUT",
      );
    }
    if (citation.status !== "pending" && !citation.checkedAt) {
      throw new GroundingPersistenceError(
        `Citation ${citation.citationKey} requires checkedAt for a completed result.`,
        "INVALID_INPUT",
      );
    }
    if (citation.evidenceSourceId) evidenceIds.add(citation.evidenceSourceId);
  }

  const retentionUntil = boundedRetention(input.retentionUntil, GROUNDING_AUDIT_RETENTION_DAYS);
  const materialClaims = input.claims.filter((claim) => claim.material);
  const unsupportedMaterialClaimCount = materialClaims.filter(
    (claim) => !claimCanPass(claim, input.citationChecks),
  ).length;
  const contradictionCount = input.claims.filter(
    (claim) => claim.contradictionStatus === "unresolved" || claim.verificationResult === "conflicted",
  ).length;
  const citationPassedCount = input.citationChecks.filter((citation) => citation.status === "passed").length;
  const citedMaterialClaims = new Set(
    input.citationChecks
      .filter((citation) => citation.status === "passed" && citation.claimKey)
      .map((citation) => citation.claimKey as string)
      .filter((claimKey) => input.claims.some((claim) => claim.claimKey === claimKey && claim.material)),
  );
  const citationPrecision =
    input.citationChecks.length === 0
      ? materialClaims.length === 0
        ? 1
        : 0
      : citationPassedCount / input.citationChecks.length;
  const citationCoverage =
    materialClaims.length === 0 ? 1 : citedMaterialClaims.size / materialClaims.length;
  const hasPending =
    input.claims.some(
      (claim) =>
        claim.verificationResult === "pending" ||
        claim.contradictionStatus === "pending" ||
        claim.evidenceLinks.some((link) => link.verificationStatus === "pending"),
    ) || input.citationChecks.some((citation) => citation.status === "pending");
  const allCitationsPass = input.citationChecks.every((citation) => citation.status === "passed");
  const status = hasPending
    ? "pending"
    : unsupportedMaterialClaimCount === 0 &&
        contradictionCount === 0 &&
        allCitationsPass &&
        citationPrecision === 1 &&
        citationCoverage === 1
      ? "verified"
      : "failed";
  const inputHash = await auditInputHash({
    articleId: input.articleId,
    evidenceBundleId: input.evidenceBundleId,
    articleVersion: input.articleVersion,
    finalContentHash: input.finalContentHash,
    evaluationKey: input.evaluationKey,
    evaluatorVersion: input.evaluatorVersion,
    claims: input.claims,
    citationChecks: input.citationChecks.map(withoutCheckedAt),
  });

  return getDb().transaction(async (tx) => {
    const now = new Date();
    const [article] = await tx
      .select({ id: articles.id, version: articles.version, topicId: articles.topicId })
      .from(articles)
      .where(
        and(
          eq(articles.id, input.articleId),
          eq(articles.workspaceId, scope.workspaceId),
          eq(articles.brandId, scope.brandId),
        ),
      )
      .limit(1);
    if (!article) {
      throw new GroundingPersistenceError("Article is outside the requested scope.", "SCOPE_MISMATCH");
    }
    if (article.version !== input.articleVersion) {
      throw new GroundingPersistenceError(
        "Article changed before its claim ledger could be recorded.",
        "CONTENT_VERSION_MISMATCH",
      );
    }

    const [bundle] = await tx
      .select({ id: evidenceBundles.id, topicId: evidenceBundles.topicId })
      .from(evidenceBundles)
      .where(
        and(
          eq(evidenceBundles.id, input.evidenceBundleId),
          eq(evidenceBundles.workspaceId, scope.workspaceId),
          eq(evidenceBundles.brandId, scope.brandId),
          eq(evidenceBundles.status, "ready"),
          gt(evidenceBundles.retentionUntil, now),
          isNull(evidenceBundles.purgedAt),
        ),
      )
      .limit(1);
    if (!bundle || bundle.topicId !== article.topicId) {
      throw new GroundingPersistenceError(
        "Evidence bundle does not belong to this article topic and scope.",
        "EVIDENCE_MISMATCH",
      );
    }

    const scopedSourceRefs = new Map<string, string>();
    if (evidenceIds.size > 0) {
      const scopedSources = await tx
        .select({ id: evidenceSources.id, sourceKey: evidenceSources.sourceKey })
        .from(evidenceSources)
        .where(
          and(
            inArray(evidenceSources.id, [...evidenceIds]),
            eq(evidenceSources.workspaceId, scope.workspaceId),
            eq(evidenceSources.brandId, scope.brandId),
            eq(evidenceSources.bundleId, input.evidenceBundleId),
            inArray(evidenceSources.status, ["candidate", "verified"]),
            gt(evidenceSources.retentionUntil, now),
            isNull(evidenceSources.purgedAt),
          ),
        );
      if (scopedSources.length !== evidenceIds.size) {
        throw new GroundingPersistenceError(
          "A claim references evidence outside its bundle or tenant scope.",
          "EVIDENCE_MISMATCH",
        );
      }
      for (const source of scopedSources) scopedSourceRefs.set(source.id, source.sourceKey);
      for (const claim of input.claims) {
        for (const link of claim.evidenceLinks) {
          const sourceRef = scopedSourceRefs.get(link.evidenceSourceId);
          if (!sourceRef) {
            throw new GroundingPersistenceError(
              "A claim evidence source could not be resolved.",
              "EVIDENCE_MISMATCH",
            );
          }
        }
      }
      for (const citation of input.citationChecks) {
        if (!citation.evidenceSourceId) continue;
        const sourceRef = scopedSourceRefs.get(citation.evidenceSourceId);
        if (!sourceRef || (citation.evidenceSourceRef && citation.evidenceSourceRef !== sourceRef)) {
          throw new GroundingPersistenceError(
            "A citation evidence reference does not match its scoped source.",
            "EVIDENCE_MISMATCH",
          );
        }
      }
    }

    const [createdLedger] = await tx
      .insert(articleClaimLedgers)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        articleId: input.articleId,
        evidenceBundleId: input.evidenceBundleId,
        articleVersion: input.articleVersion,
        finalContentHash: input.finalContentHash,
        evaluationKey: input.evaluationKey,
        inputHash,
        evaluatorVersion: input.evaluatorVersion,
        status: "pending",
        retentionUntil,
      })
      .onConflictDoNothing({
        target: [articleClaimLedgers.brandId, articleClaimLedgers.evaluationKey],
      })
      .returning({ id: articleClaimLedgers.id });
    if (!createdLedger) {
      const [existingLedger] = await tx
        .select()
        .from(articleClaimLedgers)
        .where(
          and(
            eq(articleClaimLedgers.workspaceId, scope.workspaceId),
            eq(articleClaimLedgers.brandId, scope.brandId),
            eq(articleClaimLedgers.evaluationKey, input.evaluationKey),
          ),
        )
        .limit(1);
      if (
        !existingLedger ||
        existingLedger.articleId !== input.articleId ||
        existingLedger.evidenceBundleId !== input.evidenceBundleId ||
        existingLedger.articleVersion !== input.articleVersion ||
        existingLedger.finalContentHash !== input.finalContentHash ||
        existingLedger.evaluatorVersion !== input.evaluatorVersion ||
        existingLedger.inputHash !== inputHash
      ) {
        throw new GroundingPersistenceError(
          "Claim-ledger evaluation key belongs to different input or content.",
          "CONTENT_VERSION_MISMATCH",
        );
      }
      const existingClaims = await tx
        .select()
        .from(articleClaims)
        .where(
          and(
            eq(articleClaims.workspaceId, scope.workspaceId),
            eq(articleClaims.brandId, scope.brandId),
            eq(articleClaims.ledgerId, existingLedger.id),
          ),
        )
        .orderBy(asc(articleClaims.ordinal));
      const existingClaimIds = existingClaims.map((claim) => claim.id);
      const existingLinks =
        existingClaimIds.length === 0
          ? []
          : await tx
              .select()
              .from(evidenceClaimLinks)
              .where(
                and(
                  eq(evidenceClaimLinks.workspaceId, scope.workspaceId),
                  eq(evidenceClaimLinks.brandId, scope.brandId),
                  inArray(evidenceClaimLinks.claimId, existingClaimIds),
                ),
              );
      const existingCitations = await tx
        .select()
        .from(citationChecks)
        .where(
          and(
            eq(citationChecks.workspaceId, scope.workspaceId),
            eq(citationChecks.brandId, scope.brandId),
            eq(citationChecks.ledgerId, existingLedger.id),
          ),
        )
        .orderBy(asc(citationChecks.createdAt));
      return {
        ledger: existingLedger,
        claims: existingClaims,
        evidenceLinks: existingLinks,
        citationChecks: existingCitations,
      };
    }
    const ledgerId = createdLedger.id;

    const claimRows =
      input.claims.length === 0
        ? []
        : await tx
            .insert(articleClaims)
            .values(
              input.claims.map((claim) => ({
                workspaceId: scope.workspaceId,
                brandId: scope.brandId,
                ledgerId,
                claimKey: claim.claimKey,
                ordinal: claim.ordinal,
                claimText: claim.claimText,
                claimHash: claim.claimHash,
                claimType: claim.claimType,
                material: claim.material,
                supportStrength: claim.supportStrength,
                contradictionStatus: claim.contradictionStatus,
                verificationResult: claim.verificationResult,
                evaluatorVersion: claim.evaluatorVersion ?? input.evaluatorVersion,
              })),
            )
            .returning();
    const claimIds = new Map(claimRows.map((claim) => [claim.claimKey, claim.id]));

    const linkedEvidenceIds = [...new Set(input.claims.flatMap((claim) => claim.evidenceLinks.map((link) => link.evidenceSourceId)))];
    const linkedSources =
      linkedEvidenceIds.length === 0
        ? []
        : await tx
            .select({ id: evidenceSources.id, sourceKey: evidenceSources.sourceKey })
            .from(evidenceSources)
            .where(
              and(
                inArray(evidenceSources.id, linkedEvidenceIds),
                eq(evidenceSources.workspaceId, scope.workspaceId),
                eq(evidenceSources.brandId, scope.brandId),
                eq(evidenceSources.bundleId, input.evidenceBundleId),
              ),
            );
    const evidenceSourceRefs = new Map(linkedSources.map((source) => [source.id, source.sourceKey]));
    const linkValues = input.claims.flatMap((claim) =>
      claim.evidenceLinks.map((link) => ({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        claimId: claimIds.get(claim.claimKey) as string,
        evidenceSourceId: link.evidenceSourceId,
        evidenceSourceRef: evidenceSourceRefs.get(link.evidenceSourceId) as string,
        relationship: link.relationship ?? "supports",
        supportStrength: link.supportStrength,
        verificationStatus: link.verificationStatus,
        evaluatorVersion: link.evaluatorVersion ?? input.evaluatorVersion,
        verifiedAt: link.verificationStatus === "verified" ? new Date() : null,
      })),
    );
    const links =
      linkValues.length === 0
        ? []
        : await tx.insert(evidenceClaimLinks).values(linkValues).returning();

    const citationRows =
      input.citationChecks.length === 0
        ? []
        : await tx
            .insert(citationChecks)
            .values(
              input.citationChecks.map((citation) => ({
                workspaceId: scope.workspaceId,
                brandId: scope.brandId,
                ledgerId,
                claimId: citation.claimKey ? claimIds.get(citation.claimKey) : null,
                evidenceSourceId: citation.evidenceSourceId ?? null,
                evidenceSourceRef: citation.evidenceSourceId
                  ? scopedSourceRefs.get(citation.evidenceSourceId) ?? null
                  : null,
                citationKey: citation.citationKey,
                citedUrl: citation.citedUrl,
                resolvedUrl: citation.resolvedUrl ?? null,
                canonicalUrl: citation.canonicalUrl ?? null,
                expectedTitle: citation.expectedTitle ?? null,
                expectedDomain: citation.expectedDomain ?? null,
                status: citation.status,
                linkAvailable: citation.linkAvailable ?? null,
                canonicalMatches: citation.canonicalMatches ?? null,
                titleMatches: citation.titleMatches ?? null,
                domainMatches: citation.domainMatches ?? null,
                supportsClaim: citation.supportsClaim ?? null,
                sourceFresh: citation.sourceFresh ?? null,
                invented: citation.invented ?? null,
                evaluatorVersion: citation.evaluatorVersion ?? input.evaluatorVersion,
                fetchVersion: citation.fetchVersion,
                retrievedContentHash: citation.retrievedContentHash ?? null,
                failureCode: citation.failureCode ?? null,
                failureMessage: citation.failureMessage ?? null,
                checkedAt: citation.checkedAt ?? null,
                retentionUntil,
              })),
            )
            .returning();

    const [ledger] = await tx
      .update(articleClaimLedgers)
      .set({
        status,
        materialClaimCount: materialClaims.length,
        unsupportedMaterialClaimCount,
        contradictionCount,
        citationPrecision,
        citationCoverage,
        completedAt: status === "pending" ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(articleClaimLedgers.id, ledgerId),
          eq(articleClaimLedgers.workspaceId, scope.workspaceId),
          eq(articleClaimLedgers.brandId, scope.brandId),
        ),
      )
      .returning();
    if (!ledger) throw new Error("Claim ledger could not be finalized.");
    return { ledger, claims: claimRows, evidenceLinks: links, citationChecks: citationRows };
  });
}

/**
 * Permanently remove expired third-party excerpts in a small, retry-safe batch.
 * Claim and citation audit rows survive through SET NULL references.
 */
export async function purgeExpiredEvidence(now = new Date(), limit = 50) {
  if (!Number.isFinite(now.getTime())) {
    throw new GroundingPersistenceError("Purge time is invalid.", "INVALID_INPUT");
  }
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);

  return getDb().transaction(async (tx) => {
    const expiredSources = await tx
      .select({ id: evidenceSources.id })
      .from(evidenceSources)
      .where(and(lte(evidenceSources.retentionUntil, now), isNull(evidenceSources.purgedAt)))
      .orderBy(asc(evidenceSources.retentionUntil))
      .limit(boundedLimit);
    const deletedSources =
      expiredSources.length === 0
        ? []
        : await tx
            .delete(evidenceSources)
            .where(
              and(
                inArray(
                  evidenceSources.id,
                  expiredSources.map((source) => source.id),
                ),
                lte(evidenceSources.retentionUntil, now),
              ),
            )
            .returning({ id: evidenceSources.id });

    const expiredBundles = await tx
      .select({ id: evidenceBundles.id })
      .from(evidenceBundles)
      .where(and(lte(evidenceBundles.retentionUntil, now), isNull(evidenceBundles.purgedAt)))
      .orderBy(asc(evidenceBundles.retentionUntil))
      .limit(boundedLimit);
    const deletedBundles =
      expiredBundles.length === 0
        ? []
        : await tx
            .delete(evidenceBundles)
            .where(
              and(
                inArray(
                  evidenceBundles.id,
                  expiredBundles.map((bundle) => bundle.id),
                ),
                lte(evidenceBundles.retentionUntil, now),
              ),
            )
            .returning({ id: evidenceBundles.id });

    return {
      deletedBundles: deletedBundles.length,
      deletedSources: deletedSources.length,
      limit: boundedLimit,
    };
  });
}

/**
 * Remove expired grounding audit records in dependency order. Gate checks and
 * claim children cascade from their parents; a ledger is deleted only after
 * every gate that references it has been removed.
 */
export async function purgeExpiredGroundingAudit(now = new Date(), limit = 50) {
  if (!Number.isFinite(now.getTime())) {
    throw new GroundingPersistenceError("Purge time is invalid.", "INVALID_INPUT");
  }
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);

  return getDb().transaction(async (tx) => {
    const expiredGateRuns = await tx
      .select({ id: publicationGateRuns.id })
      .from(publicationGateRuns)
      .where(lte(publicationGateRuns.retentionUntil, now))
      .orderBy(
        asc(publicationGateRuns.retentionUntil),
        asc(publicationGateRuns.createdAt),
        asc(publicationGateRuns.id),
      )
      .limit(boundedLimit);
    const deletedGateRuns =
      expiredGateRuns.length === 0
        ? []
        : await tx
            .delete(publicationGateRuns)
            .where(
              and(
                inArray(
                  publicationGateRuns.id,
                  expiredGateRuns.map((run) => run.id),
                ),
                lte(publicationGateRuns.retentionUntil, now),
              ),
            )
            .returning({ id: publicationGateRuns.id });

    const hasNoGateReference = notExists(
      tx
        .select({ id: publicationGateRuns.id })
        .from(publicationGateRuns)
        .where(eq(publicationGateRuns.claimLedgerId, articleClaimLedgers.id)),
    );
    const expiredClaimLedgers = await tx
      .select({ id: articleClaimLedgers.id })
      .from(articleClaimLedgers)
      .where(
        and(
          lte(articleClaimLedgers.retentionUntil, now),
          hasNoGateReference,
        ),
      )
      .orderBy(
        asc(articleClaimLedgers.retentionUntil),
        asc(articleClaimLedgers.createdAt),
        asc(articleClaimLedgers.id),
      )
      .limit(boundedLimit);
    const deletedClaimLedgers =
      expiredClaimLedgers.length === 0
        ? []
        : await tx
            .delete(articleClaimLedgers)
            .where(
              and(
                inArray(
                  articleClaimLedgers.id,
                  expiredClaimLedgers.map((ledger) => ledger.id),
                ),
                lte(articleClaimLedgers.retentionUntil, now),
                notExists(
                  tx
                    .select({ id: publicationGateRuns.id })
                    .from(publicationGateRuns)
                    .where(eq(publicationGateRuns.claimLedgerId, articleClaimLedgers.id)),
                ),
              ),
            )
            .returning({ id: articleClaimLedgers.id });

    return {
      deletedGateRuns: deletedGateRuns.length,
      deletedClaimLedgers: deletedClaimLedgers.length,
      limit: boundedLimit,
    };
  });
}

export type PublicationGateCheckInput = {
  gateKey: string;
  required?: boolean;
  status: GateCheckStatus;
  evaluatorVersion: string;
  details?: Record<string, unknown> | null;
  failureCode?: string | null;
  checkedAt?: Date | null;
};

export type RecordPublicationGateRunInput = {
  articleId: string;
  claimLedgerId: string;
  articleVersion: number;
  finalContentHash: string;
  /** Stable for retries of one evaluation; use a new key for every delayed recheck. */
  evaluationKey: string;
  evaluatorSetVersion: string;
  evaluatorVersions: Record<string, string>;
  requiredGateKeys: readonly string[];
  checks: readonly PublicationGateCheckInput[];
  riskLevel?: string | null;
  ownerPolicyVersion?: string | null;
  destination?: string | null;
  recheckAfter?: Date | null;
  retentionUntil?: Date;
};

/** Persist an exact-content gate run; missing required checks become pending blockers. */
export async function recordPublicationGateRun(
  scope: BrandScope,
  input: RecordPublicationGateRunInput,
) {
  if (!Number.isInteger(input.articleVersion) || input.articleVersion < 1) {
    throw new GroundingPersistenceError("Article version must be positive.", "INVALID_INPUT");
  }
  assertNonEmpty(input.finalContentHash, "finalContentHash");
  assertNonEmpty(input.evaluationKey, "evaluationKey");
  assertNonEmpty(input.evaluatorSetVersion, "evaluatorSetVersion");
  if (input.requiredGateKeys.length === 0) {
    throw new GroundingPersistenceError("At least one required gate must be declared.", "INVALID_INPUT");
  }
  assertUnique(input.requiredGateKeys, "Required gate keys");
  assertUnique(
    input.checks.map((check) => check.gateKey),
    "Publication gate check keys",
  );
  for (const key of input.requiredGateKeys) {
    assertNonEmpty(key, "requiredGateKey");
    if (!input.evaluatorVersions[key]?.trim()) {
      throw new GroundingPersistenceError(
        `Required gate ${key} has no evaluator version.`,
        "INVALID_INPUT",
      );
    }
  }
  for (const check of input.checks) {
    assertNonEmpty(check.gateKey, "gateKey");
    assertNonEmpty(check.evaluatorVersion, "gate evaluatorVersion");
    if (check.required === true && !input.requiredGateKeys.includes(check.gateKey)) {
      throw new GroundingPersistenceError(
        `Gate ${check.gateKey} is marked required but is absent from requiredGateKeys.`,
        "INVALID_INPUT",
      );
    }
    if (
      input.requiredGateKeys.includes(check.gateKey) &&
      input.evaluatorVersions[check.gateKey] !== check.evaluatorVersion
    ) {
      throw new GroundingPersistenceError(
        `Gate ${check.gateKey} evaluator version does not match the advertised evaluator set.`,
        "INVALID_INPUT",
      );
    }
  }

  const retentionUntil = boundedRetention(input.retentionUntil, GROUNDING_AUDIT_RETENTION_DAYS);
  const suppliedChecks = new Map(input.checks.map((check) => [check.gateKey, check]));
  const normalizedChecks: PublicationGateCheckInput[] = [
    ...input.checks,
    ...input.requiredGateKeys
      .filter((key) => !suppliedChecks.has(key))
      .map((key) => ({
        gateKey: key,
        required: true,
        status: "pending" as const,
        evaluatorVersion: input.evaluatorVersions[key] as string,
        failureCode: "MISSING_GATE_RESULT",
      })),
  ];
  const checkByKey = new Map(normalizedChecks.map((check) => [check.gateKey, check]));
  const requiredChecks = input.requiredGateKeys.map((key) => checkByKey.get(key) as PublicationGateCheckInput);
  const inputHash = await auditInputHash({
    articleId: input.articleId,
    claimLedgerId: input.claimLedgerId,
    articleVersion: input.articleVersion,
    finalContentHash: input.finalContentHash,
    evaluationKey: input.evaluationKey,
    evaluatorSetVersion: input.evaluatorSetVersion,
    evaluatorVersions: input.evaluatorVersions,
    requiredGateKeys: input.requiredGateKeys,
    checks: normalizedChecks.map(withoutCheckedAt),
    riskLevel: input.riskLevel ?? null,
    ownerPolicyVersion: input.ownerPolicyVersion ?? null,
    destination: input.destination ?? null,
  });

  return getDb().transaction(async (tx) => {
    const [article] = await tx
      .select({ id: articles.id, version: articles.version })
      .from(articles)
      .where(
        and(
          eq(articles.id, input.articleId),
          eq(articles.workspaceId, scope.workspaceId),
          eq(articles.brandId, scope.brandId),
        ),
      )
      .limit(1);
    if (!article) {
      throw new GroundingPersistenceError("Article is outside the requested scope.", "SCOPE_MISMATCH");
    }
    if (article.version !== input.articleVersion) {
      throw new GroundingPersistenceError(
        "Article changed before its publication gate could be recorded.",
        "CONTENT_VERSION_MISMATCH",
      );
    }

    const [ledger] = await tx
      .select()
      .from(articleClaimLedgers)
      .where(
        and(
          eq(articleClaimLedgers.id, input.claimLedgerId),
          eq(articleClaimLedgers.workspaceId, scope.workspaceId),
          eq(articleClaimLedgers.brandId, scope.brandId),
          eq(articleClaimLedgers.articleId, input.articleId),
          eq(articleClaimLedgers.articleVersion, input.articleVersion),
          eq(articleClaimLedgers.finalContentHash, input.finalContentHash),
        ),
      )
      .limit(1);
    const ledgerUsable =
      ledger &&
      ledger.purgedAt === null &&
      ledger.retentionUntil.getTime() > Date.now() &&
      (ledger.status === "pending" || ledger.completedAt !== null);
    if (!ledgerUsable) {
      throw new GroundingPersistenceError(
        "Claim ledger is not a retained evaluation for the gated content and tenant scope.",
        "EVIDENCE_MISMATCH",
      );
    }

    const anyPending = requiredChecks.some((check) => check.status === "pending");
    const anyError = requiredChecks.some((check) => check.status === "error");
    const allPassed = requiredChecks.every((check) => check.status === "passed");
    const status =
      anyPending || ledger.status === "pending"
        ? "pending"
        : anyError
          ? "error"
          : allPassed && ledger.status === "verified"
            ? "passed"
            : "failed";
    const automaticPublicationAllowed = status === "passed";
    const now = new Date();
    if (
      automaticPublicationAllowed &&
      (!input.recheckAfter ||
        input.recheckAfter.getTime() <= now.getTime() ||
        input.recheckAfter.getTime() >= retentionUntil.getTime())
    ) {
      throw new GroundingPersistenceError(
        "A passing publication gate requires a future recheck before retention expiry.",
        "INVALID_INPUT",
      );
    }

    const [createdRun] = await tx
      .insert(publicationGateRuns)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        articleId: input.articleId,
        claimLedgerId: input.claimLedgerId,
        articleVersion: input.articleVersion,
        finalContentHash: input.finalContentHash,
        evaluationKey: input.evaluationKey,
        inputHash,
        evaluatorSetVersion: input.evaluatorSetVersion,
        evaluatorVersions: input.evaluatorVersions,
        requiredGateKeys: [...input.requiredGateKeys],
        status: "pending",
        decision: "blocked",
        automaticPublicationAllowed: false,
        riskLevel: input.riskLevel ?? null,
        ownerPolicyVersion: input.ownerPolicyVersion ?? null,
        destination: input.destination ?? null,
        recheckAfter: input.recheckAfter ?? null,
        retentionUntil,
      })
      .onConflictDoNothing({
        target: [publicationGateRuns.brandId, publicationGateRuns.evaluationKey],
      })
      .returning({ id: publicationGateRuns.id });
    if (!createdRun) {
      const [existingRun] = await tx
        .select()
        .from(publicationGateRuns)
        .where(
          and(
            eq(publicationGateRuns.workspaceId, scope.workspaceId),
            eq(publicationGateRuns.brandId, scope.brandId),
            eq(publicationGateRuns.evaluationKey, input.evaluationKey),
          ),
        )
        .limit(1);
      if (
        !existingRun ||
        existingRun.articleId !== input.articleId ||
        existingRun.claimLedgerId !== input.claimLedgerId ||
        existingRun.articleVersion !== input.articleVersion ||
        existingRun.finalContentHash !== input.finalContentHash ||
        existingRun.evaluatorSetVersion !== input.evaluatorSetVersion ||
        existingRun.inputHash !== inputHash
      ) {
        throw new GroundingPersistenceError(
          "Publication-gate evaluation key belongs to different input, content, or evaluator work.",
          "CONTENT_VERSION_MISMATCH",
        );
      }
      const existingChecks = await tx
        .select()
        .from(publicationGateChecks)
        .where(
          and(
            eq(publicationGateChecks.workspaceId, scope.workspaceId),
            eq(publicationGateChecks.brandId, scope.brandId),
            eq(publicationGateChecks.gateRunId, existingRun.id),
          ),
        )
        .orderBy(asc(publicationGateChecks.gateKey));
      return { run: existingRun, checks: existingChecks };
    }
    const runId = createdRun.id;

    const checks = await tx
      .insert(publicationGateChecks)
      .values(
        normalizedChecks.map((check) => ({
          workspaceId: scope.workspaceId,
          brandId: scope.brandId,
          gateRunId: runId,
          gateKey: check.gateKey,
          required: input.requiredGateKeys.includes(check.gateKey) || check.required === true,
          status: check.status,
          passed: check.status === "passed",
          evaluatorVersion: check.evaluatorVersion,
          details: check.details ?? null,
          failureCode: check.failureCode ?? null,
          checkedAt: check.checkedAt ?? (check.status === "pending" ? null : now),
        })),
      )
      .returning();

    const failedKeys = requiredChecks
      .filter((check) => check.status !== "passed")
      .map((check) => check.gateKey);
    const [run] = await tx
      .update(publicationGateRuns)
      .set({
        status,
        decision: automaticPublicationAllowed ? "allow" : "blocked",
        automaticPublicationAllowed,
        failureCode:
          status === "passed" ? null : status === "pending" ? "GATES_PENDING" : "GATES_BLOCKED",
        failureMessage: failedKeys.length > 0 ? `Blocking gates: ${failedKeys.join(", ")}` : null,
        completedAt: status === "pending" ? null : now,
        updatedAt: now,
      })
      .where(
        and(
          eq(publicationGateRuns.id, runId),
          eq(publicationGateRuns.workspaceId, scope.workspaceId),
          eq(publicationGateRuns.brandId, scope.brandId),
        ),
      )
      .returning();
    if (!run) throw new Error("Publication gate run could not be finalized.");
    return { run, checks };
  });
}

export async function getLatestPublicationGateForContent(
  scope: BrandScope,
  articleId: string,
  articleVersion: number,
  finalContentHash: string,
) {
  const [run] = await getDb()
    .select()
    .from(publicationGateRuns)
    .where(
      and(
        eq(publicationGateRuns.workspaceId, scope.workspaceId),
        eq(publicationGateRuns.brandId, scope.brandId),
        eq(publicationGateRuns.articleId, articleId),
        eq(publicationGateRuns.articleVersion, articleVersion),
        eq(publicationGateRuns.finalContentHash, finalContentHash),
      ),
    )
    .orderBy(desc(publicationGateRuns.createdAt), desc(publicationGateRuns.id))
    .limit(1);
  if (!run) return null;
  const checks = await getDb()
    .select()
    .from(publicationGateChecks)
    .where(
      and(
        eq(publicationGateChecks.workspaceId, scope.workspaceId),
        eq(publicationGateChecks.brandId, scope.brandId),
        eq(publicationGateChecks.gateRunId, run.id),
      ),
    )
    .orderBy(asc(publicationGateChecks.gateKey));
  return { run, checks };
}

/** Complete reviewer/operator view for the latest or requested article content identity. */
export async function getArticleGroundingDetail(
  scope: BrandScope,
  articleId: string,
  identity?: { articleVersion: number; finalContentHash: string },
) {
  const [articleRow] = await getDb()
    .select({
      id: articles.id,
      topicId: articles.topicId,
      title: articles.title,
      slug: articles.slug,
      metaDescription: articles.metaDescription,
      tags: articles.tags,
      bodyMarkdown: articles.bodyMarkdown,
      version: articles.version,
      status: articles.status,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .where(
      and(
        eq(articles.id, articleId),
        eq(articles.workspaceId, scope.workspaceId),
        eq(articles.brandId, scope.brandId),
      ),
    )
    .limit(1);
  if (!articleRow) return null;
  const article = {
    id: articleRow.id,
    topicId: articleRow.topicId,
    title: articleRow.title,
    version: articleRow.version,
    status: articleRow.status,
    updatedAt: articleRow.updatedAt,
  };
  const contentIdentity =
    identity ??
    {
      articleVersion: articleRow.version,
      finalContentHash: await hashFinalPublicationContent({
        title: articleRow.title,
        slug: articleRow.slug,
        metaDescription: articleRow.metaDescription,
        tags: parseTags(articleRow.tags),
        bodyMarkdown: articleRow.bodyMarkdown,
      }),
    };

  const publicationGate = await getLatestPublicationGateForContent(
    scope,
    articleId,
    contentIdentity.articleVersion,
    contentIdentity.finalContentHash,
  );

  const ledgerPredicates = [
    eq(articleClaimLedgers.workspaceId, scope.workspaceId),
    eq(articleClaimLedgers.brandId, scope.brandId),
    eq(articleClaimLedgers.articleId, articleId),
  ];
  ledgerPredicates.push(eq(articleClaimLedgers.articleVersion, contentIdentity.articleVersion));
  ledgerPredicates.push(eq(articleClaimLedgers.finalContentHash, contentIdentity.finalContentHash));
  if (publicationGate) {
    ledgerPredicates.push(eq(articleClaimLedgers.id, publicationGate.run.claimLedgerId));
  }
  const [ledger] = await getDb()
    .select()
    .from(articleClaimLedgers)
    .where(and(...ledgerPredicates))
    .orderBy(desc(articleClaimLedgers.createdAt), desc(articleClaimLedgers.id))
    .limit(1);
  if (!ledger) {
    return { article, ledger: null, evidenceBundle: null, claims: [], citationChecks: [], publicationGate: null };
  }

  const claims = await getDb()
    .select()
    .from(articleClaims)
    .where(
      and(
        eq(articleClaims.workspaceId, scope.workspaceId),
        eq(articleClaims.brandId, scope.brandId),
        eq(articleClaims.ledgerId, ledger.id),
      ),
    )
    .orderBy(asc(articleClaims.ordinal));
  const claimIds = claims.map((claim) => claim.id);
  const links =
    claimIds.length === 0
      ? []
      : await getDb()
          .select()
          .from(evidenceClaimLinks)
          .where(
            and(
              eq(evidenceClaimLinks.workspaceId, scope.workspaceId),
              eq(evidenceClaimLinks.brandId, scope.brandId),
              inArray(evidenceClaimLinks.claimId, claimIds),
            ),
          );
  const citationRows = await getDb()
    .select()
    .from(citationChecks)
    .where(
      and(
        eq(citationChecks.workspaceId, scope.workspaceId),
        eq(citationChecks.brandId, scope.brandId),
        eq(citationChecks.ledgerId, ledger.id),
      ),
    )
    .orderBy(asc(citationChecks.createdAt));

  let evidenceBundle: Awaited<ReturnType<typeof getLatestEvidenceBundleForTopic>> = null;
  if (ledger.evidenceBundleId) {
    const [bundle] = await getDb()
      .select()
      .from(evidenceBundles)
      .where(
        and(
          eq(evidenceBundles.id, ledger.evidenceBundleId),
          eq(evidenceBundles.workspaceId, scope.workspaceId),
          eq(evidenceBundles.brandId, scope.brandId),
        ),
      )
      .limit(1);
    if (bundle) {
      const sources = await getDb()
        .select()
        .from(evidenceSources)
        .where(
          and(
            eq(evidenceSources.workspaceId, scope.workspaceId),
            eq(evidenceSources.brandId, scope.brandId),
            eq(evidenceSources.bundleId, bundle.id),
          ),
        )
        .orderBy(desc(evidenceSources.claimRelevance), asc(evidenceSources.createdAt));
      evidenceBundle = { bundle, sources };
    }
  }

  const linksByClaim = new Map<string, typeof links>();
  for (const link of links) {
    const current = linksByClaim.get(link.claimId) ?? [];
    current.push(link);
    linksByClaim.set(link.claimId, current);
  }

  return {
    article,
    ledger,
    evidenceBundle,
    claims: claims.map((claim) => ({ ...claim, evidenceLinks: linksByClaim.get(claim.id) ?? [] })),
    citationChecks: citationRows,
    publicationGate,
  };
}
