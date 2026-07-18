import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { workspaces } from "./app";
import { brands } from "./brand";
import { articles, researchRuns, topics } from "./content";

/**
 * One immutable research snapshot for a topic. A new research pass creates a
 * new version instead of mutating evidence used by an older article draft.
 */
export const evidenceBundles = pgTable(
  "evidence_bundles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    researchRunId: uuid("research_run_id").references(() => researchRuns.id, {
      onDelete: "set null",
    }),
    version: integer("version").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    searchQuery: text("search_query").notNull(),
    searchIntent: text("search_intent").notNull(),
    status: text("status").notNull().default("pending"),
    contentHash: text("content_hash"),
    sourceCount: integer("source_count").notNull().default(0),
    fetchVersion: text("fetch_version").notNull(),
    parserVersion: text("parser_version").notNull(),
    supersedesId: uuid("supersedes_id").references(
      (): AnyPgColumn => evidenceBundles.id,
      { onDelete: "set null" },
    ),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    retentionUntil: timestamp("retention_until", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '90 days'`),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("evidence_bundles_topic_version_idx").on(
      table.workspaceId,
      table.brandId,
      table.topicId,
      table.version,
    ),
    uniqueIndex("evidence_bundles_brand_idempotency_idx").on(
      table.brandId,
      table.idempotencyKey,
    ),
    index("evidence_bundles_scope_topic_status_idx").on(
      table.workspaceId,
      table.brandId,
      table.topicId,
      table.status,
    ),
    index("evidence_bundles_retention_idx").on(table.status, table.retentionUntil),
    check("evidence_bundles_version_check", sql`${table.version} > 0`),
    check("evidence_bundles_source_count_check", sql`${table.sourceCount} >= 0`),
    check("evidence_bundles_source_count_limit_check", sql`${table.sourceCount} <= 50`),
    check(
      "evidence_bundles_status_check",
      sql`${table.status} in ('pending', 'ready', 'failed', 'expired', 'purged')`,
    ),
    check(
      "evidence_bundles_ready_state_check",
      sql`${table.status} <> 'ready' or (${table.sourceCount} > 0 and ${table.contentHash} is not null and length(${table.contentHash}) > 0 and ${table.completedAt} is not null)`,
    ),
  ],
);

/** Bounded source evidence; full third-party page bodies are never persisted. */
export const evidenceSources = pgTable(
  "evidence_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    bundleId: uuid("bundle_id")
      .notNull()
      .references(() => evidenceBundles.id, { onDelete: "cascade" }),
    sourceKey: text("source_key").notNull(),
    sourceUrl: text("source_url").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    publisher: text("publisher"),
    domain: text("domain").notNull(),
    title: text("title").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    supportingExcerpt: varchar("supporting_excerpt", { length: 2000 }).notNull(),
    contentHash: text("content_hash").notNull(),
    sourceType: text("source_type").notNull(),
    sourceQualityScore: real("source_quality_score").notNull(),
    freshnessScore: real("freshness_score").notNull(),
    claimRelevance: real("claim_relevance").notNull(),
    relationship: text("relationship").notNull().default("neutral"),
    relationshipNotes: text("relationship_notes"),
    status: text("status").notNull().default("candidate"),
    fetchVersion: text("fetch_version").notNull(),
    parserVersion: text("parser_version").notNull(),
    retentionUntil: timestamp("retention_until", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '90 days'`),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("evidence_sources_bundle_key_idx").on(table.bundleId, table.sourceKey),
    uniqueIndex("evidence_sources_bundle_canonical_hash_idx").on(
      table.bundleId,
      table.canonicalUrl,
      table.contentHash,
    ),
    index("evidence_sources_scope_bundle_status_idx").on(
      table.workspaceId,
      table.brandId,
      table.bundleId,
      table.status,
    ),
    index("evidence_sources_canonical_url_idx").on(table.canonicalUrl),
    index("evidence_sources_retention_idx").on(table.status, table.retentionUntil),
    check(
      "evidence_sources_status_check",
      sql`${table.status} in ('candidate', 'pending', 'verified', 'unavailable', 'stale', 'rejected', 'purged')`,
    ),
    check(
      "evidence_sources_relationship_check",
      sql`${table.relationship} in ('corroborates', 'conflicts', 'neutral')`,
    ),
    check(
      "evidence_sources_quality_score_check",
      sql`${table.sourceQualityScore} >= 0 and ${table.sourceQualityScore} <= 100`,
    ),
    check(
      "evidence_sources_freshness_score_check",
      sql`${table.freshnessScore} >= 0 and ${table.freshnessScore} <= 100`,
    ),
    check(
      "evidence_sources_claim_relevance_check",
      sql`${table.claimRelevance} >= 0 and ${table.claimRelevance} <= 100`,
    ),
  ],
);

/** Evaluation root for the final bytes of one article version. */
export const articleClaimLedgers = pgTable(
  "article_claim_ledgers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    evidenceBundleId: uuid("evidence_bundle_id").references(() => evidenceBundles.id, {
      onDelete: "set null",
    }),
    articleVersion: integer("article_version").notNull(),
    finalContentHash: text("final_content_hash").notNull(),
    evaluationKey: text("evaluation_key").notNull(),
    inputHash: text("input_hash").notNull(),
    evaluatorVersion: text("evaluator_version").notNull(),
    status: text("status").notNull().default("pending"),
    materialClaimCount: integer("material_claim_count").notNull().default(0),
    unsupportedMaterialClaimCount: integer("unsupported_material_claim_count")
      .notNull()
      .default(0),
    contradictionCount: integer("contradiction_count").notNull().default(0),
    citationPrecision: real("citation_precision"),
    citationCoverage: real("citation_coverage"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    retentionUntil: timestamp("retention_until", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '365 days'`),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("article_claim_ledgers_brand_evaluation_key_idx").on(
      table.brandId,
      table.evaluationKey,
    ),
    index("article_claim_ledgers_content_evaluator_idx").on(
      table.workspaceId,
      table.brandId,
      table.articleId,
      table.articleVersion,
      table.finalContentHash,
      table.evaluatorVersion,
    ),
    index("article_claim_ledgers_scope_article_created_idx").on(
      table.workspaceId,
      table.brandId,
      table.articleId,
      table.createdAt,
    ),
    index("article_claim_ledgers_retention_idx").on(table.status, table.retentionUntil),
    check("article_claim_ledgers_version_check", sql`${table.articleVersion} > 0`),
    check(
      "article_claim_ledgers_status_check",
      sql`${table.status} in ('pending', 'verified', 'failed', 'stale', 'purged')`,
    ),
    check(
      "article_claim_ledgers_counts_check",
      sql`${table.materialClaimCount} >= 0 and ${table.unsupportedMaterialClaimCount} >= 0 and ${table.contradictionCount} >= 0`,
    ),
    check(
      "article_claim_ledgers_precision_check",
      sql`${table.citationPrecision} is null or (${table.citationPrecision} >= 0 and ${table.citationPrecision} <= 1)`,
    ),
    check(
      "article_claim_ledgers_coverage_check",
      sql`${table.citationCoverage} is null or (${table.citationCoverage} >= 0 and ${table.citationCoverage} <= 1)`,
    ),
    check(
      "article_claim_ledgers_verified_state_check",
      sql`${table.status} <> 'verified' or (${table.unsupportedMaterialClaimCount} = 0 and ${table.contradictionCount} = 0 and ${table.citationPrecision} = 1 and ${table.citationCoverage} = 1 and ${table.completedAt} is not null)`,
    ),
  ],
);

/** One extracted final-draft claim. Pending is deliberately non-passing. */
export const articleClaims = pgTable(
  "article_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => articleClaimLedgers.id, { onDelete: "cascade" }),
    claimKey: text("claim_key").notNull(),
    ordinal: integer("ordinal").notNull(),
    claimText: text("claim_text").notNull(),
    claimHash: text("claim_hash").notNull(),
    claimType: text("claim_type").notNull(),
    material: boolean("material").notNull().default(true),
    supportStrength: real("support_strength").notNull().default(0),
    contradictionStatus: text("contradiction_status").notNull().default("pending"),
    verificationResult: text("verification_result").notNull().default("pending"),
    evaluatorVersion: text("evaluator_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("article_claims_ledger_key_idx").on(table.ledgerId, table.claimKey),
    uniqueIndex("article_claims_ledger_ordinal_idx").on(table.ledgerId, table.ordinal),
    index("article_claims_scope_ledger_result_idx").on(
      table.workspaceId,
      table.brandId,
      table.ledgerId,
      table.verificationResult,
    ),
    check("article_claims_ordinal_check", sql`${table.ordinal} >= 0`),
    check(
      "article_claims_type_check",
      sql`${table.claimType} in ('factual', 'opinion', 'brand_fact', 'calculation', 'example', 'prediction')`,
    ),
    check(
      "article_claims_strength_check",
      sql`${table.supportStrength} >= 0 and ${table.supportStrength} <= 1`,
    ),
    check(
      "article_claims_contradiction_check",
      sql`${table.contradictionStatus} in ('pending', 'none', 'disclosed', 'unresolved')`,
    ),
    check(
      "article_claims_verification_check",
      sql`${table.verificationResult} in ('pending', 'supported', 'unsupported', 'conflicted', 'not_applicable')`,
    ),
  ],
);

/** Many-to-many support/contradiction relation between claims and evidence. */
export const evidenceClaimLinks = pgTable(
  "evidence_claim_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => articleClaims.id, { onDelete: "cascade" }),
    evidenceSourceId: uuid("evidence_source_id").references(() => evidenceSources.id, {
      onDelete: "set null",
    }),
    /** Non-content reference retained after the copyrighted excerpt is purged. */
    evidenceSourceRef: text("evidence_source_ref").notNull(),
    relationship: text("relationship").notNull().default("supports"),
    supportStrength: real("support_strength").notNull().default(0),
    verificationStatus: text("verification_status").notNull().default("pending"),
    evaluatorVersion: text("evaluator_version").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("evidence_claim_links_claim_source_idx").on(
      table.claimId,
      table.evidenceSourceId,
    ),
    index("evidence_claim_links_scope_claim_idx").on(
      table.workspaceId,
      table.brandId,
      table.claimId,
    ),
    index("evidence_claim_links_source_idx").on(table.evidenceSourceId),
    check(
      "evidence_claim_links_relationship_check",
      sql`${table.relationship} in ('supports', 'contradicts', 'context')`,
    ),
    check(
      "evidence_claim_links_strength_check",
      sql`${table.supportStrength} >= 0 and ${table.supportStrength} <= 1`,
    ),
    check(
      "evidence_claim_links_verification_check",
      sql`${table.verificationStatus} in ('pending', 'verified', 'rejected', 'stale')`,
    ),
  ],
);

/** Retrieval and semantic-support result for every citation in the final text. */
export const citationChecks = pgTable(
  "citation_checks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => articleClaimLedgers.id, { onDelete: "cascade" }),
    claimId: uuid("claim_id").references(() => articleClaims.id, { onDelete: "cascade" }),
    evidenceSourceId: uuid("evidence_source_id").references(() => evidenceSources.id, {
      onDelete: "set null",
    }),
    /** Non-content reference retained after the copyrighted excerpt is purged. */
    evidenceSourceRef: text("evidence_source_ref"),
    citationKey: text("citation_key").notNull(),
    citedUrl: text("cited_url").notNull(),
    resolvedUrl: text("resolved_url"),
    canonicalUrl: text("canonical_url"),
    expectedTitle: text("expected_title"),
    expectedDomain: text("expected_domain"),
    status: text("status").notNull().default("pending"),
    linkAvailable: boolean("link_available"),
    canonicalMatches: boolean("canonical_matches"),
    titleMatches: boolean("title_matches"),
    domainMatches: boolean("domain_matches"),
    supportsClaim: boolean("supports_claim"),
    sourceFresh: boolean("source_fresh"),
    invented: boolean("invented"),
    evaluatorVersion: text("evaluator_version").notNull(),
    fetchVersion: text("fetch_version").notNull(),
    retrievedContentHash: text("retrieved_content_hash"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    retentionUntil: timestamp("retention_until", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '365 days'`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("citation_checks_ledger_key_idx").on(table.ledgerId, table.citationKey),
    index("citation_checks_scope_ledger_status_idx").on(
      table.workspaceId,
      table.brandId,
      table.ledgerId,
      table.status,
    ),
    index("citation_checks_source_idx").on(table.evidenceSourceId),
    index("citation_checks_retention_idx").on(table.status, table.retentionUntil),
    check(
      "citation_checks_status_check",
      sql`${table.status} in ('pending', 'passed', 'failed', 'stale', 'unavailable')`,
    ),
    check(
      "citation_checks_pass_requirements_check",
      sql`${table.status} <> 'passed' or (${table.claimId} is not null and ${table.evidenceSourceRef} is not null and length(${table.evidenceSourceRef}) > 0 and ${table.checkedAt} is not null and ${table.retrievedContentHash} is not null and length(${table.retrievedContentHash}) > 0 and ${table.linkAvailable} is true and ${table.canonicalMatches} is true and ${table.titleMatches} is true and ${table.domainMatches} is true and ${table.supportsClaim} is true and ${table.sourceFresh} is true and ${table.invented} is false)`,
    ),
    check(
      "citation_checks_completed_at_check",
      sql`${table.status} = 'pending' or ${table.checkedAt} is not null`,
    ),
  ],
);

/** Aggregate publication decision for exact final article bytes and evaluator set. */
export const publicationGateRuns = pgTable(
  "publication_gate_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    claimLedgerId: uuid("claim_ledger_id")
      .notNull()
      .references(() => articleClaimLedgers.id, { onDelete: "cascade" }),
    articleVersion: integer("article_version").notNull(),
    finalContentHash: text("final_content_hash").notNull(),
    evaluationKey: text("evaluation_key").notNull(),
    inputHash: text("input_hash").notNull(),
    evaluatorSetVersion: text("evaluator_set_version").notNull(),
    evaluatorVersions: jsonb("evaluator_versions")
      .$type<Record<string, string>>()
      .notNull(),
    requiredGateKeys: jsonb("required_gate_keys").$type<string[]>().notNull(),
    status: text("status").notNull().default("pending"),
    decision: text("decision").notNull().default("blocked"),
    automaticPublicationAllowed: boolean("automatic_publication_allowed")
      .notNull()
      .default(false),
    riskLevel: text("risk_level"),
    ownerPolicyVersion: text("owner_policy_version"),
    destination: text("destination"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    recheckAfter: timestamp("recheck_after", { withTimezone: true }),
    retentionUntil: timestamp("retention_until", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '365 days'`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("publication_gate_runs_brand_evaluation_key_idx").on(
      table.brandId,
      table.evaluationKey,
    ),
    index("publication_gate_runs_scope_content_created_idx").on(
      table.workspaceId,
      table.brandId,
      table.articleId,
      table.articleVersion,
      table.finalContentHash,
      table.createdAt,
    ),
    index("publication_gate_runs_retention_idx").on(table.status, table.retentionUntil),
    check("publication_gate_runs_version_check", sql`${table.articleVersion} > 0`),
    check(
      "publication_gate_runs_status_check",
      sql`${table.status} in ('pending', 'passed', 'failed', 'error', 'stale')`,
    ),
    check(
      "publication_gate_runs_decision_check",
      sql`${table.decision} in ('blocked', 'allow')`,
    ),
    check(
      "publication_gate_runs_fail_closed_check",
      sql`not ${table.automaticPublicationAllowed} or (${table.status} = 'passed' and ${table.decision} = 'allow')`,
    ),
    check(
      "publication_gate_runs_required_keys_check",
      sql`jsonb_typeof(${table.requiredGateKeys}) = 'array' and jsonb_array_length(${table.requiredGateKeys}) > 0`,
    ),
    check(
      "publication_gate_runs_allowed_freshness_check",
      sql`not ${table.automaticPublicationAllowed} or (${table.completedAt} is not null and ${table.recheckAfter} is not null and ${table.recheckAfter} > ${table.completedAt} and ${table.retentionUntil} > ${table.recheckAfter})`,
    ),
  ],
);

/** One persisted evaluator result within a publication gate run. */
export const publicationGateChecks = pgTable(
  "publication_gate_checks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    gateRunId: uuid("gate_run_id")
      .notNull()
      .references(() => publicationGateRuns.id, { onDelete: "cascade" }),
    gateKey: text("gate_key").notNull(),
    required: boolean("required").notNull().default(true),
    status: text("status").notNull().default("pending"),
    passed: boolean("passed").notNull().default(false),
    evaluatorVersion: text("evaluator_version").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    failureCode: text("failure_code"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("publication_gate_checks_run_key_idx").on(table.gateRunId, table.gateKey),
    index("publication_gate_checks_scope_run_status_idx").on(
      table.workspaceId,
      table.brandId,
      table.gateRunId,
      table.status,
    ),
    check(
      "publication_gate_checks_status_check",
      sql`${table.status} in ('pending', 'passed', 'failed', 'error')`,
    ),
    check(
      "publication_gate_checks_pass_consistency_check",
      sql`not ${table.passed} or ${table.status} = 'passed'`,
    ),
  ],
);
