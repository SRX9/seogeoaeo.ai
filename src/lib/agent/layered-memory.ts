import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import {
  agentMemoryDependencies,
  agentMemoryRecords,
  agentOwnerPolicies,
} from "@/lib/db/schema";

export const STORED_MEMORY_CLASSES = [
  "authoritative_fact",
  "preference",
  "correction",
  "episodic_observation",
  "semantic_summary",
  "procedural_learning",
] as const;
export const MEMORY_CLASSES = [...STORED_MEMORY_CLASSES, "owner_policy"] as const;
export const MEMORY_SOURCE_TYPES = [
  "owner_input",
  "first_party",
  "verified_tool",
  "model_inference",
  "system",
  "task_output",
  "external_content",
] as const;
export const MEMORY_CREATORS = [
  "owner",
  "verified_tool",
  "model_inference",
  "system",
] as const;
export const MEMORY_IMPACT_LEVELS = ["low", "medium", "high"] as const;
export const MEMORY_VERIFICATION_STATES = [
  "unverified",
  "verified",
  "owner_approved",
  "rejected",
] as const;
export const MEMORY_SENSITIVITIES = [
  "public",
  "internal",
  "confidential",
  "restricted",
] as const;
export const MEMORY_TRUST_LEVELS = ["trusted", "untrusted"] as const;
export const MEMORY_STATUSES = ["active", "superseded", "invalidated", "rejected"] as const;
export const MEMORY_CONSUMERS = [
  "planner",
  "research",
  "draft",
  "audit",
  "ask",
  "reflection",
  "learning",
] as const;
export const MEMORY_DEPENDENCY_RELATIONS = [
  "supports",
  "derived_from",
  "corrects",
  "contradicts",
  "outcome_of",
] as const;
export const MUTUALLY_EXCLUSIVE_MEMORY_CLASSES = [
  "authoritative_fact",
  "preference",
  "correction",
] as const;

export type StoredMemoryClass = (typeof STORED_MEMORY_CLASSES)[number];
export type MemoryClass = (typeof MEMORY_CLASSES)[number];
export type MemorySourceType = (typeof MEMORY_SOURCE_TYPES)[number];
export type MemoryCreator = (typeof MEMORY_CREATORS)[number];
export type MemoryImpactLevel = (typeof MEMORY_IMPACT_LEVELS)[number];
export type MemoryVerificationState = (typeof MEMORY_VERIFICATION_STATES)[number];
export type MemorySensitivity = (typeof MEMORY_SENSITIVITIES)[number];
export type MemoryTrustLevel = (typeof MEMORY_TRUST_LEVELS)[number];
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];
export type MemoryConsumer = (typeof MEMORY_CONSUMERS)[number];
export type MemoryDependencyRelation = (typeof MEMORY_DEPENDENCY_RELATIONS)[number];

const DEFAULT_ALLOWED_CONSUMERS: readonly MemoryConsumer[] = MEMORY_CONSUMERS;
const MAX_MEMORY_CANDIDATES = 200;
const MAX_TRUSTED_MEMORY_CANDIDATES = 64;
const MAX_MEMORY_RESULTS = 50;
const MAX_MEMORY_CONTEXT_CHARS = 20_000;
export const MAX_ACTIVE_CONTRADICTION_RECORDS = 100;
const MEMORY_QUERY_STOP_WORDS = new Set([
  "and",
  "are",
  "for",
  "from",
  "how",
  "the",
  "this",
  "that",
  "what",
  "when",
  "where",
  "which",
  "with",
]);

const CONSUMER_SENSITIVITY_CEILING: Record<MemoryConsumer, MemorySensitivity> = {
  planner: "confidential",
  research: "internal",
  draft: "internal",
  audit: "confidential",
  ask: "internal",
  reflection: "confidential",
  learning: "confidential",
};

export type MemoryDependencyInput = {
  recordId: string;
  relation: MemoryDependencyRelation;
};

export type AppendLayeredMemoryInput = {
  memoryClass: StoredMemoryClass;
  subjectKey: string;
  statement: string;
  content: Record<string, unknown>;
  impactLevel?: MemoryImpactLevel;
  sourceType: MemorySourceType;
  sourceRef: string;
  creator: MemoryCreator;
  observedAt?: Date;
  validFrom?: Date;
  expiresAt?: Date | null;
  confidence?: number;
  verificationState?: MemoryVerificationState;
  sensitivity?: MemorySensitivity;
  allowedConsumers?: readonly MemoryConsumer[];
  trustLevel?: MemoryTrustLevel;
  supersedesId?: string | null;
  expectedSupersedesVersion?: number;
  contradictionGroup?: string | null;
  extractionVersion: string;
  modelVersion?: string | null;
  dependencies?: readonly MemoryDependencyInput[];
};

export type NormalizedLayeredMemoryInput = Omit<
  Required<
    Pick<
      AppendLayeredMemoryInput,
      | "memoryClass"
      | "subjectKey"
      | "statement"
      | "content"
      | "impactLevel"
      | "sourceType"
      | "sourceRef"
      | "creator"
      | "observedAt"
      | "validFrom"
      | "confidence"
      | "verificationState"
      | "sensitivity"
      | "allowedConsumers"
      | "trustLevel"
      | "extractionVersion"
      | "dependencies"
    >
  >,
  "allowedConsumers" | "dependencies"
> & {
  allowedConsumers: MemoryConsumer[];
  dependencies: MemoryDependencyInput[];
  expiresAt: Date | null;
  supersedesId: string | null;
  expectedSupersedesVersion?: number;
  contradictionGroup: string | null;
  modelVersion: string | null;
};

export type MemoryProvenance = {
  sourceType: MemorySourceType;
  sourceRef: string;
  creator: MemoryCreator;
  observedAt: Date;
  extractionVersion: string;
  modelVersion: string | null;
  verificationState: MemoryVerificationState;
  trustLevel: MemoryTrustLevel;
};

export type LayeredMemoryCandidate = {
  id: string;
  workspaceId: string;
  brandId: string;
  memoryClass: MemoryClass;
  subjectKey: string;
  statement: string;
  content: Record<string, unknown>;
  impactLevel: MemoryImpactLevel;
  sourceType: MemorySourceType;
  sourceRef: string;
  creator: MemoryCreator;
  observedAt: Date;
  validFrom: Date;
  expiresAt: Date | null;
  confidence: number;
  verificationState: MemoryVerificationState;
  sensitivity: MemorySensitivity;
  allowedConsumers: MemoryConsumer[];
  trustLevel: MemoryTrustLevel;
  status: MemoryStatus;
  supersedesId: string | null;
  supersededById: string | null;
  contradictionGroup: string | null;
  extractionVersion: string;
  modelVersion: string | null;
  lifecycleVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

export type RetrievedMemory = LayeredMemoryCandidate & {
  score: number;
  authorityTier: number;
  relevanceScore: number;
  untrustedData: boolean;
  instructionNotAuthority: boolean;
  provenance: MemoryProvenance;
};

export type SafeMemoryQuery = BrandScope & {
  consumer: MemoryConsumer;
  query?: string;
  classes?: readonly MemoryClass[];
  sensitivityCeiling?: MemorySensitivity;
  limit?: number;
  maxChars?: number;
  now?: Date;
};

export type SafeMemoryContext = {
  items: RetrievedMemory[];
  totalChars: number;
  truncated: boolean;
  blockedHighImpact: boolean;
  blockedContradictionGroups: string[];
};

export type MemoryEvidenceValidationResult =
  | { valid: true; records: LayeredMemoryCandidate[] }
  | {
      valid: false;
      code:
        | "malformed_ref"
        | "missing_or_wrong_tenant"
        | "inactive"
        | "superseded"
        | "not_yet_valid"
        | "expired"
        | "consumer_disallowed"
        | "sensitivity_disallowed"
        | "untrusted"
        | "unverified";
      ref: string;
      reason: string;
    };

export class MemoryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryValidationError";
  }
}

export class MemoryAuthorityError extends MemoryValidationError {
  constructor(message: string) {
    super(message);
    this.name = "MemoryAuthorityError";
  }
}

function isMutuallyExclusiveMemoryClass(
  memoryClass: MemoryClass,
): memoryClass is (typeof MUTUALLY_EXCLUSIVE_MEMORY_CLASSES)[number] {
  return (MUTUALLY_EXCLUSIVE_MEMORY_CLASSES as readonly MemoryClass[]).includes(memoryClass);
}

export function normalizeMemorySubjectKey(subjectKey: string): string {
  return subjectKey.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Derive a stable group for single-current-value memories while preserving explicit groups. */
export function deriveMemoryContradictionGroup(
  memoryClass: MemoryClass,
  subjectKey: string,
  explicitGroup?: string | null,
): string | null {
  const explicit = explicitGroup?.trim();
  if (explicit) return explicit;
  if (!isMutuallyExclusiveMemoryClass(memoryClass)) return null;
  return `subject:${normalizeMemorySubjectKey(subjectKey)}`;
}

/** Includes pre-Phase5 rows whose stored contradiction_group is null. */
export function effectiveMemoryContradictionGroup(
  memory: Pick<LayeredMemoryCandidate, "memoryClass" | "subjectKey" | "contradictionGroup">,
): string | null {
  return deriveMemoryContradictionGroup(
    memory.memoryClass,
    memory.subjectKey,
    memory.contradictionGroup,
  );
}

function stableJson(value: unknown, seen = new Set<object>()): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") {
    return JSON.stringify(value.normalize("NFKC").trim().replace(/\s+/g, " "));
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new MemoryValidationError("Memory values must be finite");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new MemoryValidationError("Memory values cannot be cyclic");
    seen.add(value);
    const serialized = `[${value.map((item) => stableJson(item, seen)).join(",")}]`;
    seen.delete(value);
    return serialized;
  }
  if (typeof value === "object") {
    if (seen.has(value)) throw new MemoryValidationError("Memory values cannot be cyclic");
    seen.add(value);
    const object = value as Record<string, unknown>;
    const serialized = `{${Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key], seen)}`)
      .join(",")}}`;
    seen.delete(value);
    return serialized;
  }
  throw new MemoryValidationError("Memory values must be JSON-compatible");
}

function semanticMemoryValue(
  memory: Pick<LayeredMemoryCandidate, "memoryClass" | "statement" | "content">,
): unknown {
  for (const key of ["semanticValue", "canonicalValue", "correctedValue", "value"] as const) {
    if (Object.prototype.hasOwnProperty.call(memory.content, key)) return memory.content[key];
  }
  if (memory.memoryClass === "correction" || Object.keys(memory.content).length === 0) {
    return normalizeMemoryStatement(memory.statement);
  }
  return memory.content;
}

/** Collision-free canonical semantic value used by append and contradiction scans. */
export function stableMemoryValueFingerprint(
  memory: Pick<LayeredMemoryCandidate, "memoryClass" | "statement" | "content">,
): string {
  return `memory-value-v1:${stableJson(semanticMemoryValue(memory))}`;
}

export function memoryValuesConflict(
  left: Pick<LayeredMemoryCandidate, "memoryClass" | "statement" | "content">,
  right: Pick<LayeredMemoryCandidate, "memoryClass" | "statement" | "content">,
): boolean {
  return stableMemoryValueFingerprint(left) !== stableMemoryValueFingerprint(right);
}

export type MemoryReferenceSnapshot = {
  id: string;
  status: string;
  lifecycleVersion: number;
};

export type MemorySupersessionSnapshot = MemoryReferenceSnapshot & {
  memoryClass: StoredMemoryClass;
  subjectKey: string;
  sourceType: MemorySourceType;
  creator: MemoryCreator;
  verificationState: MemoryVerificationState;
  trustLevel: MemoryTrustLevel;
};

/** Validate the tenant-filtered, locked reference snapshot before adding lineage. */
export function validateActiveMemoryReferences<T extends MemoryReferenceSnapshot>(
  referenced: readonly T[],
  expectedIds: readonly string[],
  supersedesId: string | null,
  expectedSupersedesVersion?: number,
): T | undefined {
  if (referenced.length !== expectedIds.length) {
    throw new MemoryValidationError("A memory dependency is outside the active tenant scope");
  }
  if (referenced.some((record) => record.status !== "active")) {
    throw new MemoryValidationError("A memory dependency is no longer active");
  }
  const superseded = supersedesId
    ? referenced.find((record) => record.id === supersedesId)
    : undefined;
  if (
    supersedesId &&
    (!superseded ||
      (expectedSupersedesVersion !== undefined &&
        superseded.lifecycleVersion !== expectedSupersedesVersion))
  ) {
    throw new MemoryValidationError("The superseded memory record is stale");
  }
  return superseded;
}

const VERIFICATION_AUTHORITY: Record<MemoryVerificationState, number> = {
  rejected: 0,
  unverified: 1,
  verified: 2,
  owner_approved: 3,
};

/** Derived versions cannot use supersession to weaken or cross authority domains. */
export function validateDerivedMemorySupersession(
  next: Pick<
    NormalizedLayeredMemoryInput,
    | "memoryClass"
    | "subjectKey"
    | "sourceType"
    | "creator"
    | "verificationState"
    | "trustLevel"
  >,
  target: MemorySupersessionSnapshot,
): void {
  if (
    target.memoryClass !== "semantic_summary" &&
    target.memoryClass !== "procedural_learning"
  ) {
    throw new MemoryAuthorityError(
      "Facts, preferences, corrections, and observations require the correction service",
    );
  }
  if (next.memoryClass !== target.memoryClass) {
    throw new MemoryAuthorityError("A derived memory version must keep the same memory class");
  }
  if (normalizeMemorySubjectKey(next.subjectKey) !== normalizeMemorySubjectKey(target.subjectKey)) {
    throw new MemoryAuthorityError("A derived memory version must keep the same subject");
  }
  const nextTrust = effectiveMemoryTrust(next) === "trusted" ? 1 : 0;
  const targetTrust = effectiveMemoryTrust(target) === "trusted" ? 1 : 0;
  if (
    nextTrust < targetTrust ||
    VERIFICATION_AUTHORITY[next.verificationState] <
      VERIFICATION_AUTHORITY[target.verificationState] ||
    memoryAuthorityScore(next) < memoryAuthorityScore(target)
  ) {
    throw new MemoryAuthorityError(
      "A derived memory version cannot lower trust, verification, or authority",
    );
  }
}

function includesValue<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

function requiredText(value: string, field: string, maxLength = 4_000): string {
  const normalized = value.trim();
  if (!normalized) throw new MemoryValidationError(`${field} is required`);
  if (normalized.length > maxLength) {
    throw new MemoryValidationError(`${field} exceeds ${maxLength} characters`);
  }
  return normalized;
}

function uniqueConsumers(values: readonly MemoryConsumer[]): MemoryConsumer[] {
  if (values.length === 0) throw new MemoryValidationError("allowedConsumers cannot be empty");
  const consumers = [...new Set(values)];
  if (consumers.some((value) => !includesValue(MEMORY_CONSUMERS, value))) {
    throw new MemoryValidationError("allowedConsumers contains an unsupported consumer");
  }
  return consumers;
}

function normalizedTrust(input: AppendLayeredMemoryInput): MemoryTrustLevel {
  if (input.sourceType === "external_content" || input.creator === "model_inference") {
    return "untrusted";
  }
  if (input.trustLevel) return input.trustLevel;
  return input.sourceType === "owner_input" ||
    input.sourceType === "first_party" ||
    input.sourceType === "verified_tool" ||
    input.sourceType === "system"
    ? "trusted"
    : "untrusted";
}

/** Validate and normalize without granting inferred or external content authority. */
export function normalizeLayeredMemoryInput(
  input: AppendLayeredMemoryInput,
  now = new Date(),
): NormalizedLayeredMemoryInput {
  if (!includesValue(STORED_MEMORY_CLASSES, input.memoryClass)) {
    throw new MemoryAuthorityError("Owner policy is canonical and cannot be stored as memory");
  }
  if (!includesValue(MEMORY_SOURCE_TYPES, input.sourceType)) {
    throw new MemoryValidationError("Unsupported memory source type");
  }
  if (!includesValue(MEMORY_CREATORS, input.creator)) {
    throw new MemoryValidationError("Unsupported memory creator");
  }
  if (input.impactLevel && !includesValue(MEMORY_IMPACT_LEVELS, input.impactLevel)) {
    throw new MemoryValidationError("Unsupported memory impact level");
  }
  if (
    input.verificationState &&
    !includesValue(MEMORY_VERIFICATION_STATES, input.verificationState)
  ) {
    throw new MemoryValidationError("Unsupported memory verification state");
  }
  if (input.sensitivity && !includesValue(MEMORY_SENSITIVITIES, input.sensitivity)) {
    throw new MemoryValidationError("Unsupported memory sensitivity");
  }
  if (input.trustLevel && !includesValue(MEMORY_TRUST_LEVELS, input.trustLevel)) {
    throw new MemoryValidationError("Unsupported memory trust level");
  }

  const verificationState = input.verificationState ?? "unverified";
  const trustLevel = normalizedTrust(input);
  const validFrom = input.validFrom ?? now;
  const observedAt = input.observedAt ?? now;
  const expiresAt = input.expiresAt ?? null;
  const confidence = input.confidence ?? 50;

  if (
    !Number.isFinite(validFrom.getTime()) ||
    !Number.isFinite(observedAt.getTime()) ||
    (expiresAt && !Number.isFinite(expiresAt.getTime()))
  ) {
    throw new MemoryValidationError("Memory lifecycle dates must be valid");
  }
  if (!Number.isInteger(confidence) || confidence < 0 || confidence > 100) {
    throw new MemoryValidationError("confidence must be an integer from 0 to 100");
  }
  if (expiresAt && expiresAt <= validFrom) {
    throw new MemoryValidationError("expiresAt must be later than validFrom");
  }
  if (input.sourceType === "owner_input" && input.creator !== "owner") {
    throw new MemoryAuthorityError("Owner input must be created by the owner");
  }
  if (input.sourceType === "model_inference" && input.creator !== "model_inference") {
    throw new MemoryAuthorityError("Model inference provenance cannot claim another creator");
  }
  if (input.sourceType === "external_content" && input.creator === "owner") {
    throw new MemoryAuthorityError("External content cannot claim owner provenance");
  }
  if (input.memoryClass === "authoritative_fact") {
    if (input.creator === "model_inference" || input.sourceType === "external_content") {
      throw new MemoryAuthorityError("Untrusted content cannot create an authoritative fact");
    }
    if (trustLevel !== "trusted" || !["verified", "owner_approved"].includes(verificationState)) {
      throw new MemoryAuthorityError("Authoritative facts require trusted, verified provenance");
    }
  }
  if (input.memoryClass === "correction") {
    if (
      input.creator !== "owner" ||
      input.sourceType !== "owner_input" ||
      verificationState !== "owner_approved" ||
      trustLevel !== "trusted" ||
      !input.supersedesId
    ) {
      throw new MemoryAuthorityError(
        "Corrections require owner-approved provenance and a superseded record",
      );
    }
  }

  const dependencies = (input.dependencies ?? []).map((dependency) => {
    if (!dependency.recordId) throw new MemoryValidationError("Dependency recordId is required");
    if (!includesValue(MEMORY_DEPENDENCY_RELATIONS, dependency.relation)) {
      throw new MemoryValidationError("Unsupported memory dependency relation");
    }
    return { ...dependency };
  });
  if (!input.content || typeof input.content !== "object" || Array.isArray(input.content)) {
    throw new MemoryValidationError("Memory content must be a JSON object");
  }
  const subjectKey = requiredText(input.subjectKey, "subjectKey", 500);
  const statement = requiredText(input.statement, "statement");
  const contradictionGroup = deriveMemoryContradictionGroup(
    input.memoryClass,
    subjectKey,
    input.contradictionGroup,
  );
  // Validate JSON compatibility before opening a transaction.
  stableMemoryValueFingerprint({
    memoryClass: input.memoryClass,
    statement,
    content: input.content,
  });

  return {
    memoryClass: input.memoryClass,
    subjectKey,
    statement,
    content: input.content,
    impactLevel: input.impactLevel ?? "low",
    sourceType: input.sourceType,
    sourceRef: requiredText(input.sourceRef, "sourceRef", 1_000),
    creator: input.creator,
    observedAt,
    validFrom,
    expiresAt,
    confidence,
    verificationState,
    sensitivity: input.sensitivity ?? "internal",
    allowedConsumers: uniqueConsumers(input.allowedConsumers ?? DEFAULT_ALLOWED_CONSUMERS),
    trustLevel,
    supersedesId: input.supersedesId ?? null,
    expectedSupersedesVersion: input.expectedSupersedesVersion,
    contradictionGroup,
    extractionVersion: requiredText(input.extractionVersion, "extractionVersion", 200),
    modelVersion: input.modelVersion?.trim() || null,
    dependencies,
  };
}

/**
 * Append a non-correction record. Corrections intentionally require the
 * dedicated resolution transaction so supersession, invalidation, and its
 * durable propagation marker cannot be bypassed.
 */
export async function appendLayeredMemory(
  scope: BrandScope,
  input: AppendLayeredMemoryInput,
) {
  const normalized = normalizeLayeredMemoryInput(input);
  if (normalized.memoryClass === "correction") {
    throw new MemoryAuthorityError("Use the correction resolution service for correction records");
  }
  if (
    normalized.supersedesId &&
    normalized.memoryClass !== "semantic_summary" &&
    normalized.memoryClass !== "procedural_learning"
  ) {
    throw new MemoryAuthorityError(
      "Facts, preferences, and observations require the correction resolution service to supersede history",
    );
  }

  const newValueFingerprint = stableMemoryValueFingerprint(normalized);
  return getDb().transaction(async (tx) => {
    let contradictingRecordIds: string[] = [];
    if (normalized.contradictionGroup) {
      const contradictionLock = `claudia-memory-contradiction:${scope.workspaceId}:${scope.brandId}:${normalized.contradictionGroup}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${contradictionLock}))`);
      const automaticGroup = deriveMemoryContradictionGroup(
        normalized.memoryClass,
        normalized.subjectKey,
      );
      const includesLegacyNullRows = automaticGroup === normalized.contradictionGroup;
      const groupRows = await tx
        .select()
        .from(agentMemoryRecords)
        .where(
          and(
            eq(agentMemoryRecords.workspaceId, scope.workspaceId),
            eq(agentMemoryRecords.brandId, scope.brandId),
            eq(agentMemoryRecords.status, "active"),
            or(isNull(agentMemoryRecords.expiresAt), gt(agentMemoryRecords.expiresAt, new Date())),
            or(
              eq(agentMemoryRecords.contradictionGroup, normalized.contradictionGroup),
              includesLegacyNullRows
                ? and(
                    isNull(agentMemoryRecords.contradictionGroup),
                    inArray(
                      agentMemoryRecords.memoryClass,
                      MUTUALLY_EXCLUSIVE_MEMORY_CLASSES,
                    ),
                    sql`lower(regexp_replace(btrim(${agentMemoryRecords.subjectKey}), '[[:space:]]+', ' ', 'g')) = ${normalizeMemorySubjectKey(normalized.subjectKey)}`,
                  )
                : undefined,
            ),
          ),
        )
        .orderBy(asc(agentMemoryRecords.id))
        .for("update");
      const sourceReplay = groupRows.find(
        (row) => row.sourceRef === normalized.sourceRef,
      );
      if (sourceReplay) {
        const sameConsumers =
          JSON.stringify([...sourceReplay.allowedConsumers].sort()) ===
          JSON.stringify([...normalized.allowedConsumers].sort());
        const sameReplay =
          normalized.dependencies.length === 0 &&
          normalized.supersedesId === null &&
          sourceReplay.supersedesId === null &&
          sourceReplay.memoryClass === normalized.memoryClass &&
          normalizeMemorySubjectKey(sourceReplay.subjectKey) ===
            normalizeMemorySubjectKey(normalized.subjectKey) &&
          normalizeMemoryStatement(sourceReplay.statement) ===
            normalizeMemoryStatement(normalized.statement) &&
          stableMemoryValueFingerprint({
            memoryClass: sourceReplay.memoryClass as StoredMemoryClass,
            statement: sourceReplay.statement,
            content: sourceReplay.content,
          }) === newValueFingerprint &&
          stableJson(sourceReplay.content) === stableJson(normalized.content) &&
          sourceReplay.impactLevel === normalized.impactLevel &&
          sourceReplay.sourceType === normalized.sourceType &&
          sourceReplay.creator === normalized.creator &&
          sourceReplay.confidence === normalized.confidence &&
          sourceReplay.verificationState === normalized.verificationState &&
          sourceReplay.sensitivity === normalized.sensitivity &&
          sameConsumers &&
          sourceReplay.trustLevel === normalized.trustLevel &&
          (sourceReplay.expiresAt?.getTime() ?? null) ===
            (normalized.expiresAt?.getTime() ?? null) &&
          sourceReplay.contradictionGroup === normalized.contradictionGroup &&
          sourceReplay.extractionVersion === normalized.extractionVersion &&
          sourceReplay.modelVersion === normalized.modelVersion;
        if (sameReplay) return sourceReplay;
        throw new MemoryValidationError(
          "Memory source reference was reused with different lineage",
        );
      }
      if (groupRows.length >= MAX_ACTIVE_CONTRADICTION_RECORDS) {
        throw new MemoryValidationError("The contradiction group is too large for safe resolution");
      }
      contradictingRecordIds = groupRows.flatMap((row) =>
        row.id !== normalized.supersedesId &&
        stableMemoryValueFingerprint({
          memoryClass: row.memoryClass as StoredMemoryClass,
          statement: row.statement,
          content: row.content,
        }) !== newValueFingerprint
          ? [row.id]
          : [],
      );
    }

    const referencedIds = [
      ...normalized.dependencies.map((dependency) => dependency.recordId),
      ...(normalized.supersedesId ? [normalized.supersedesId] : []),
    ];
    const uniqueReferencedIds = [...new Set(referencedIds)];
    const referenced =
      uniqueReferencedIds.length === 0
        ? []
        : await tx
            .select({
              id: agentMemoryRecords.id,
              status: agentMemoryRecords.status,
              lifecycleVersion: agentMemoryRecords.lifecycleVersion,
              memoryClass: agentMemoryRecords.memoryClass,
              subjectKey: agentMemoryRecords.subjectKey,
              sourceType: agentMemoryRecords.sourceType,
              creator: agentMemoryRecords.creator,
              verificationState: agentMemoryRecords.verificationState,
              trustLevel: agentMemoryRecords.trustLevel,
            })
            .from(agentMemoryRecords)
            .where(
              and(
                eq(agentMemoryRecords.workspaceId, scope.workspaceId),
                eq(agentMemoryRecords.brandId, scope.brandId),
                inArray(agentMemoryRecords.id, uniqueReferencedIds),
              ),
            )
            .orderBy(asc(agentMemoryRecords.id))
            .for("update");
    const superseded = validateActiveMemoryReferences(
      referenced,
      uniqueReferencedIds,
      normalized.supersedesId,
      normalized.expectedSupersedesVersion,
    );
    if (superseded) {
      validateDerivedMemorySupersession(normalized, {
        ...superseded,
        memoryClass: superseded.memoryClass as StoredMemoryClass,
        sourceType: superseded.sourceType as MemorySourceType,
        creator: superseded.creator as MemoryCreator,
        verificationState: superseded.verificationState as MemoryVerificationState,
        trustLevel: superseded.trustLevel as MemoryTrustLevel,
      });
    }

    const [record] = await tx
      .insert(agentMemoryRecords)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        memoryClass: normalized.memoryClass,
        subjectKey: normalized.subjectKey,
        statement: normalized.statement,
        content: normalized.content,
        impactLevel: normalized.impactLevel,
        sourceType: normalized.sourceType,
        sourceRef: normalized.sourceRef,
        creator: normalized.creator,
        observedAt: normalized.observedAt,
        validFrom: normalized.validFrom,
        expiresAt: normalized.expiresAt,
        confidence: normalized.confidence,
        verificationState: normalized.verificationState,
        sensitivity: normalized.sensitivity,
        allowedConsumers: normalized.allowedConsumers,
        trustLevel: normalized.trustLevel,
        supersedesId: normalized.supersedesId,
        contradictionGroup: normalized.contradictionGroup,
        extractionVersion: normalized.extractionVersion,
        modelVersion: normalized.modelVersion,
      })
      .returning();
    if (!record) throw new Error("Layered memory could not be saved");

    if (superseded) {
      const version = normalized.expectedSupersedesVersion ?? superseded.lifecycleVersion;
      const [settled] = await tx
        .update(agentMemoryRecords)
        .set({
          status: "superseded",
          supersededById: record.id,
          lifecycleVersion: sql`${agentMemoryRecords.lifecycleVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(agentMemoryRecords.id, superseded.id),
            eq(agentMemoryRecords.workspaceId, scope.workspaceId),
            eq(agentMemoryRecords.brandId, scope.brandId),
            eq(agentMemoryRecords.status, "active"),
            eq(agentMemoryRecords.lifecycleVersion, version),
          ),
        )
        .returning({ id: agentMemoryRecords.id });
      if (!settled) throw new MemoryValidationError("The superseded memory record is stale");
    }

    const edges = normalized.dependencies.map((dependency) => ({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      recordId: record.id,
      dependsOnRecordId: dependency.recordId,
      relation: dependency.relation,
    }));
    for (const contradictingRecordId of contradictingRecordIds) {
      if (
        !edges.some(
          (edge) =>
            edge.dependsOnRecordId === contradictingRecordId && edge.relation === "contradicts",
        )
      ) {
        edges.push({
          workspaceId: scope.workspaceId,
          brandId: scope.brandId,
          recordId: record.id,
          dependsOnRecordId: contradictingRecordId,
          relation: "contradicts",
        });
      }
    }
    if (superseded && !edges.some((edge) => edge.dependsOnRecordId === superseded.id)) {
      edges.push({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        recordId: record.id,
        dependsOnRecordId: superseded.id,
        relation: "derived_from",
      });
    }
    if (edges.length > 0) {
      await tx.insert(agentMemoryDependencies).values(edges).onConflictDoNothing();
    }
    return record;
  });
}

function allowedSensitivities(query: SafeMemoryQuery): MemorySensitivity[] {
  const consumerCeiling = MEMORY_SENSITIVITIES.indexOf(
    CONSUMER_SENSITIVITY_CEILING[query.consumer],
  );
  const requestedCeiling = query.sensitivityCeiling
    ? MEMORY_SENSITIVITIES.indexOf(query.sensitivityCeiling)
    : consumerCeiling;
  return MEMORY_SENSITIVITIES.slice(0, Math.min(consumerCeiling, requestedCeiling) + 1);
}

function tokens(query: string | undefined): string[] {
  return [
    ...new Set(
      (query?.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_-]+/gu) ?? []).filter(
        (token) => token.length > 1 && !MEMORY_QUERY_STOP_WORDS.has(token),
      ),
    ),
  ].slice(0, 20);
}

function escapedLikeToken(token: string): string {
  return token.replace(/[\\%_]/g, "\\$&");
}

function relevanceScore(candidate: LayeredMemoryCandidate, queryTokens: readonly string[]): number {
  if (queryTokens.length === 0) return 0;
  const subject = candidate.subjectKey.toLowerCase();
  const statement = candidate.statement.toLowerCase();
  let matches = 0;
  for (const token of queryTokens) {
    if (subject.includes(token)) matches += 2;
    if (statement.includes(token)) matches += 1;
  }
  return Math.min(60, (matches / (queryTokens.length * 3)) * 60);
}

const CLASS_AUTHORITY: Record<MemoryClass, number> = {
  owner_policy: 150,
  correction: 140,
  authoritative_fact: 125,
  preference: 80,
  procedural_learning: 65,
  episodic_observation: 50,
  semantic_summary: 40,
};

type MemoryAuthorityIdentity = Pick<
  LayeredMemoryCandidate,
  "memoryClass" | "sourceType" | "creator" | "verificationState" | "trustLevel"
>;

function effectiveMemoryTrust(candidate: MemoryAuthorityIdentity): MemoryTrustLevel {
  return candidate.sourceType === "external_content" ||
    candidate.sourceType === "model_inference" ||
    candidate.creator === "model_inference"
    ? "untrusted"
    : candidate.trustLevel;
}

export function normalizeMemoryStatement(statement: string): string {
  return statement.trim().replace(/\s+/g, " ").toLowerCase();
}

export function memoryAuthorityScore(candidate: MemoryAuthorityIdentity): number {
  const creator =
    candidate.creator === "owner"
      ? 25
      : candidate.creator === "verified_tool"
        ? 15
        : candidate.creator === "system"
          ? 5
          : -20;
  const verification =
    candidate.verificationState === "owner_approved"
      ? 25
      : candidate.verificationState === "verified"
        ? 18
        : candidate.verificationState === "rejected"
          ? -200
          : 0;
  const trust = effectiveMemoryTrust(candidate) === "trusted" ? 10 : -35;
  return CLASS_AUTHORITY[candidate.memoryClass] + creator + verification + trust;
}

export function memoryAuthorityTier(candidate: MemoryAuthorityIdentity): number {
  const trusted =
    effectiveMemoryTrust(candidate) === "trusted" &&
    candidate.verificationState !== "rejected";
  if (!trusted) return 0;
  if (candidate.memoryClass === "owner_policy") return 70;
  if (
    candidate.memoryClass === "correction" &&
    candidate.creator === "owner" &&
    candidate.verificationState === "owner_approved"
  ) {
    return 65;
  }
  if (candidate.memoryClass === "authoritative_fact") {
    return candidate.creator === "owner" && candidate.verificationState === "owner_approved"
      ? 60
      : 55;
  }
  if (
    candidate.memoryClass === "preference" &&
    candidate.creator === "owner" &&
    candidate.verificationState === "owner_approved"
  ) {
    return 50;
  }
  if (candidate.creator === "owner" && candidate.verificationState === "owner_approved") {
    return 45;
  }
  if (candidate.verificationState === "verified") return 35;
  return 20;
}

/** Shared authority-aware contradiction decision for retrieval, UI, and execution gates. */
export function resolveActiveMemoryContradictions(
  candidates: readonly LayeredMemoryCandidate[],
): { suppressedIds: string[]; blockedGroups: string[] } {
  const groups = new Map<string, LayeredMemoryCandidate[]>();
  for (const candidate of candidates) {
    const contradictionGroup = effectiveMemoryContradictionGroup(candidate);
    if (candidate.status !== "active" || !contradictionGroup) continue;
    const group = groups.get(contradictionGroup) ?? [];
    group.push(candidate);
    groups.set(contradictionGroup, group);
  }

  const suppressedIds = new Set<string>();
  const blockedGroups: string[] = [];
  for (const [groupName, group] of groups) {
    const topAuthority = Math.max(...group.map(memoryAuthorityScore));
    const top = group.filter(
      (candidate) => memoryAuthorityScore(candidate) === topAuthority,
    );
    const topValues = new Set(top.map(stableMemoryValueFingerprint));
    if (topValues.size > 1) {
      if (group.some((candidate) => candidate.impactLevel === "high")) {
        blockedGroups.push(groupName);
      }
      continue;
    }
    const resolvedValue = topValues.values().next().value;
    for (const candidate of group) {
      if (
        memoryAuthorityScore(candidate) < topAuthority &&
        (stableMemoryValueFingerprint(candidate) !== resolvedValue ||
          memoryAuthorityTier(candidate) === 0)
      ) {
        suppressedIds.add(candidate.id);
      }
    }
  }
  return { suppressedIds: [...suppressedIds].sort(), blockedGroups: blockedGroups.sort() };
}

function scoreCandidate(
  candidate: LayeredMemoryCandidate,
  now: Date,
): number {
  const ageDays = Math.max(0, (now.getTime() - candidate.observedAt.getTime()) / 86_400_000);
  const freshness = Math.max(0, 15 - Math.log2(ageDays + 1) * 3);
  const confidence = Math.max(0, Math.min(100, candidate.confidence)) / 10;
  return memoryAuthorityScore(candidate) + freshness + confidence;
}

function memoryContextCost(candidate: RetrievedMemory): number {
  return JSON.stringify(candidate).length;
}

function sanitizeTrust(candidate: LayeredMemoryCandidate): LayeredMemoryCandidate {
  if (candidate.sourceType !== "external_content" && candidate.creator !== "model_inference") {
    return candidate;
  }
  return { ...candidate, trustLevel: "untrusted" };
}

/** Pure defense-in-depth filter/ranker used by the database retrieval boundary and tests. */
export function selectSafeMemoryContext(
  candidates: readonly LayeredMemoryCandidate[],
  query: SafeMemoryQuery,
): SafeMemoryContext {
  const now = query.now ?? new Date();
  const classFilter = new Set(query.classes ?? MEMORY_CLASSES);
  const sensitivityFilter = new Set(allowedSensitivities(query));
  const queryTokens = tokens(query.query);
  const eligible = candidates
    .filter(
      (candidate) =>
        candidate.workspaceId === query.workspaceId &&
        candidate.brandId === query.brandId &&
        classFilter.has(candidate.memoryClass) &&
        candidate.status === "active" &&
        candidate.verificationState !== "rejected" &&
        candidate.validFrom <= now &&
        (!candidate.expiresAt || candidate.expiresAt > now) &&
        sensitivityFilter.has(candidate.sensitivity) &&
        candidate.allowedConsumers.includes(query.consumer),
    )
    .map(sanitizeTrust)
    .map((candidate) => {
      const untrustedData = candidate.trustLevel === "untrusted";
      const candidateRelevance = relevanceScore(candidate, queryTokens);
      return {
        ...candidate,
        score: scoreCandidate(candidate, now) + candidateRelevance,
        authorityTier: memoryAuthorityTier(candidate),
        relevanceScore: candidateRelevance,
        untrustedData,
        instructionNotAuthority: untrustedData,
        provenance: {
          sourceType: candidate.sourceType,
          sourceRef: candidate.sourceRef,
          creator: candidate.creator,
          observedAt: candidate.observedAt,
          extractionVersion: candidate.extractionVersion,
          modelVersion: candidate.modelVersion,
          verificationState: candidate.verificationState,
          trustLevel: candidate.trustLevel,
        },
      };
    })
    .filter((candidate) => queryTokens.length === 0 || candidate.relevanceScore > 0)
    .sort(
      (left, right) =>
        right.authorityTier - left.authorityTier ||
        right.score - left.score ||
        right.relevanceScore - left.relevanceScore ||
        right.observedAt.getTime() - left.observedAt.getTime() ||
        left.id.localeCompare(right.id),
    );

  const contradictionResolution = resolveActiveMemoryContradictions(eligible);
  const suppressedIds = new Set(contradictionResolution.suppressedIds);
  const blockedContradictionGroups = contradictionResolution.blockedGroups;
  const safeEligible = eligible.filter((candidate) => !suppressedIds.has(candidate.id));

  const limit = Math.max(1, Math.min(MAX_MEMORY_RESULTS, Math.floor(query.limit ?? 12)));
  const maxChars = Math.max(2, Math.min(MAX_MEMORY_CONTEXT_CHARS, Math.floor(query.maxChars ?? 6_000)));
  const items: RetrievedMemory[] = [];
  let serializedItemsChars = 0;
  let truncated = safeEligible.length > limit || suppressedIds.size > 0;
  for (const candidate of safeEligible) {
    if (items.length >= limit) break;
    const cost = memoryContextCost(candidate);
    const separatorChars = items.length > 0 ? 1 : 0;
    if (2 + serializedItemsChars + separatorChars + cost > maxChars) {
      truncated = true;
      continue;
    }
    items.push(candidate);
    serializedItemsChars += separatorChars + cost;
  }

  return {
    items,
    totalChars: 2 + serializedItemsChars,
    truncated,
    blockedHighImpact: blockedContradictionGroups.length > 0,
    blockedContradictionGroups,
  };
}

function fromMemoryRow(row: typeof agentMemoryRecords.$inferSelect): LayeredMemoryCandidate {
  return {
    ...row,
    memoryClass: row.memoryClass as StoredMemoryClass,
    impactLevel: row.impactLevel as MemoryImpactLevel,
    sourceType: row.sourceType as MemorySourceType,
    creator: row.creator as MemoryCreator,
    verificationState: row.verificationState as MemoryVerificationState,
    sensitivity: row.sensitivity as MemorySensitivity,
    allowedConsumers: row.allowedConsumers as MemoryConsumer[],
    trustLevel: row.trustLevel as MemoryTrustLevel,
    status: row.status as MemoryStatus,
  };
}

const MEMORY_EVIDENCE_REF_PATTERN =
  /^memory:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function memoryEvidenceRef(recordId: string): string {
  if (!MEMORY_EVIDENCE_REF_PATTERN.test(`memory:${recordId}`)) {
    throw new MemoryValidationError("Memory evidence requires a UUID record id");
  }
  return `memory:${recordId.toLowerCase()}`;
}

function parseMemoryEvidenceRefs(evidenceRefs: readonly string[]) {
  const ids: string[] = [];
  for (const ref of evidenceRefs) {
    if (!ref.startsWith("memory:")) continue;
    const match = MEMORY_EVIDENCE_REF_PATTERN.exec(ref);
    if (!match?.[1]) {
      return {
        valid: false as const,
        code: "malformed_ref" as const,
        ref,
        reason: "A memory evidence reference is malformed.",
      };
    }
    ids.push(match[1].toLowerCase());
  }
  return { valid: true as const, ids: [...new Set(ids)] };
}

/** Pure validation seam over a freshly tenant-scoped database snapshot. */
export function validateMemoryEvidenceSnapshot(
  scope: BrandScope,
  evidenceRefs: readonly string[],
  rows: readonly LayeredMemoryCandidate[],
  options: { consumer: MemoryConsumer; now?: Date },
): MemoryEvidenceValidationResult {
  const parsed = parseMemoryEvidenceRefs(evidenceRefs);
  if (!parsed.valid) return parsed;
  const now = options.now ?? new Date();
  const allowedSensitivity = new Set(
    allowedSensitivities({ ...scope, consumer: options.consumer }),
  );
  const byId = new Map(
    rows
      .filter(
        (row) => row.workspaceId === scope.workspaceId && row.brandId === scope.brandId,
      )
      .map((row) => [row.id.toLowerCase(), sanitizeTrust(row)] as const),
  );
  const records: LayeredMemoryCandidate[] = [];
  for (const id of parsed.ids) {
    const ref = `memory:${id}`;
    const row = byId.get(id);
    if (!row) {
      return {
        valid: false,
        code: "missing_or_wrong_tenant",
        ref,
        reason: "Memory evidence is missing or outside this tenant scope.",
      };
    }
    if (row.status === "superseded" || row.supersededById) {
      return { valid: false, code: "superseded", ref, reason: "Memory evidence was superseded." };
    }
    if (row.status !== "active") {
      return { valid: false, code: "inactive", ref, reason: "Memory evidence is inactive." };
    }
    if (row.validFrom > now) {
      return {
        valid: false,
        code: "not_yet_valid",
        ref,
        reason: "Memory evidence is not valid yet.",
      };
    }
    if (row.expiresAt && row.expiresAt <= now) {
      return { valid: false, code: "expired", ref, reason: "Memory evidence expired." };
    }
    if (!row.allowedConsumers.includes(options.consumer)) {
      return {
        valid: false,
        code: "consumer_disallowed",
        ref,
        reason: "Memory evidence is not permitted for this consumer.",
      };
    }
    if (!allowedSensitivity.has(row.sensitivity)) {
      return {
        valid: false,
        code: "sensitivity_disallowed",
        ref,
        reason: "Memory evidence exceeds this consumer's sensitivity boundary.",
      };
    }
    if (row.trustLevel !== "trusted") {
      return { valid: false, code: "untrusted", ref, reason: "Memory evidence is untrusted." };
    }
    if (row.verificationState !== "verified" && row.verificationState !== "owner_approved") {
      return { valid: false, code: "unverified", ref, reason: "Memory evidence is unverified." };
    }
    records.push(row);
  }
  return { valid: true, records };
}

/** Re-read every memory evidence ref immediately before dynamic execution. */
export async function validateMemoryEvidenceRefsAtExecution(
  scope: BrandScope,
  evidenceRefs: readonly string[],
  options: { consumer: MemoryConsumer; now?: Date },
): Promise<MemoryEvidenceValidationResult> {
  const parsed = parseMemoryEvidenceRefs(evidenceRefs);
  if (!parsed.valid) return parsed;
  if (parsed.ids.length === 0) return { valid: true, records: [] };
  if (parsed.ids.length > 32) {
    return {
      valid: false,
      code: "malformed_ref",
      ref: "memory:*",
      reason: "Too many memory evidence references were supplied.",
    };
  }
  const rows = await getDb()
    .select()
    .from(agentMemoryRecords)
    .where(
      and(
        eq(agentMemoryRecords.workspaceId, scope.workspaceId),
        eq(agentMemoryRecords.brandId, scope.brandId),
        inArray(agentMemoryRecords.id, parsed.ids),
      ),
    )
    .orderBy(asc(agentMemoryRecords.id));
  return validateMemoryEvidenceSnapshot(
    scope,
    evidenceRefs,
    rows.map(fromMemoryRow),
    options,
  );
}

function fromOwnerPolicyRow(
  row: typeof agentOwnerPolicies.$inferSelect,
): LayeredMemoryCandidate {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    brandId: row.brandId,
    memoryClass: "owner_policy",
    subjectKey: `owner_policy:${row.policyKey}`,
    statement: row.originalText,
    content: {
      effect: row.effect,
      capabilities: row.capabilities,
      resources: row.resources,
      conditions: row.conditions,
      policyVersion: row.policyVersion,
    },
    impactLevel: "high",
    sourceType: "owner_input",
    sourceRef: `agent_owner_policy:${row.id}`,
    creator: "owner",
    observedAt: row.confirmedAt ?? row.createdAt,
    validFrom: row.createdAt,
    expiresAt: row.expiresAt,
    confidence: 100,
    verificationState: row.confirmedAt ? "owner_approved" : "unverified",
    sensitivity: "internal",
    allowedConsumers: [...MEMORY_CONSUMERS],
    trustLevel: "trusted",
    status: "active",
    supersedesId: row.supersedesId,
    supersededById: null,
    contradictionGroup: null,
    extractionVersion: row.parserVersion,
    modelVersion: null,
    lifecycleVersion: 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Postgres-first retrieval with hard SQL filters before lexical ranking. */
export async function retrieveSafeMemory(query: SafeMemoryQuery): Promise<SafeMemoryContext> {
  const now = query.now ?? new Date();
  const classes = query.classes ?? MEMORY_CLASSES;
  const storedClasses = classes.filter(
    (memoryClass): memoryClass is StoredMemoryClass => memoryClass !== "owner_policy",
  );
  const sensitivities = allowedSensitivities(query);
  const lexicalTokens = tokens(query.query);
  const recordLexicalFilter =
    lexicalTokens.length > 0
      ? or(
          ...lexicalTokens.map((token) =>
            or(
              ilike(agentMemoryRecords.subjectKey, `%${escapedLikeToken(token)}%`),
              ilike(agentMemoryRecords.statement, `%${escapedLikeToken(token)}%`),
            ),
          ),
        )
      : undefined;
  const policyLexicalFilter =
    lexicalTokens.length > 0
      ? or(
          ...lexicalTokens.map((token) =>
            or(
              ilike(agentOwnerPolicies.policyKey, `%${escapedLikeToken(token)}%`),
              ilike(agentOwnerPolicies.originalText, `%${escapedLikeToken(token)}%`),
            ),
          ),
        )
      : undefined;
  const db = getDb();
  const recordHardFilter = and(
    eq(agentMemoryRecords.workspaceId, query.workspaceId),
    eq(agentMemoryRecords.brandId, query.brandId),
    eq(agentMemoryRecords.status, "active"),
    lte(agentMemoryRecords.validFrom, now),
    or(isNull(agentMemoryRecords.expiresAt), gt(agentMemoryRecords.expiresAt, now)),
    inArray(agentMemoryRecords.sensitivity, sensitivities),
    inArray(agentMemoryRecords.memoryClass, storedClasses),
    sql`${agentMemoryRecords.allowedConsumers} @> ${JSON.stringify([query.consumer])}::jsonb`,
    recordLexicalFilter,
  );

  const [trustedRecordRows, generalRecordRows, policyRows] = await Promise.all([
    storedClasses.length === 0
      ? Promise.resolve([])
      : db
          .select()
          .from(agentMemoryRecords)
          .where(
            and(
              recordHardFilter,
              eq(agentMemoryRecords.trustLevel, "trusted"),
              inArray(agentMemoryRecords.verificationState, ["owner_approved", "verified"]),
              inArray(agentMemoryRecords.creator, ["owner", "verified_tool", "system"]),
              ne(agentMemoryRecords.sourceType, "external_content"),
              ne(agentMemoryRecords.sourceType, "model_inference"),
            ),
          )
          .orderBy(
            sql`case ${agentMemoryRecords.memoryClass} when 'correction' then 0 when 'authoritative_fact' then 1 when 'preference' then 2 else 3 end`,
            desc(agentMemoryRecords.confidence),
            desc(agentMemoryRecords.observedAt),
          )
          .limit(MAX_TRUSTED_MEMORY_CANDIDATES),
    storedClasses.length === 0
      ? Promise.resolve([])
      : db
          .select()
          .from(agentMemoryRecords)
          .where(recordHardFilter)
          .orderBy(desc(agentMemoryRecords.observedAt))
          .limit(MAX_MEMORY_CANDIDATES),
    classes.includes("owner_policy") && sensitivities.includes("internal")
      ? db
          .select()
          .from(agentOwnerPolicies)
          .where(
            and(
              eq(agentOwnerPolicies.workspaceId, query.workspaceId),
              eq(agentOwnerPolicies.brandId, query.brandId),
              eq(agentOwnerPolicies.status, "active"),
              or(isNull(agentOwnerPolicies.expiresAt), gt(agentOwnerPolicies.expiresAt, now)),
              policyLexicalFilter,
            ),
          )
          .orderBy(desc(agentOwnerPolicies.createdAt))
          .limit(MAX_MEMORY_RESULTS)
      : Promise.resolve([]),
  ]);
  const recordRows = [
    ...new Map(
      [...trustedRecordRows, ...generalRecordRows].map((row) => [row.id, row] as const),
    ).values(),
  ];

  return selectSafeMemoryContext(
    [...recordRows.map(fromMemoryRow), ...policyRows.map(fromOwnerPolicyRow)],
    { ...query, now },
  );
}
