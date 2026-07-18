import {
  and,
  eq,
  inArray,
  isNotNull,
  lte,
} from "drizzle-orm";
import { z } from "zod";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import { agentMemoryRecords, agentStepExecutions } from "@/lib/db/schema";
import {
  appendLayeredMemory,
  type MemoryConsumer,
  type MemorySensitivity,
} from "@/lib/agent/layered-memory";

export const REFLECTION_VERSION = "claudia-reflection-v2" as const;
export const TERMINAL_STEP_EVIDENCE_PREFIX = "agent_step_execution:" as const;
export const REFLECTION_MAX_EVIDENCE_AGE_MS = 7 * 86_400_000;
export const REFLECTION_LIFETIME_MS = Object.freeze({
  episodic_observation: 90 * 86_400_000,
  semantic_summary: 30 * 86_400_000,
});

const storedReflectionClassSchema = z.enum([
  "authoritative_fact",
  "preference",
  "correction",
  "episodic_observation",
  "semantic_summary",
  "procedural_learning",
]);
const forbiddenReflectionClassSchema = z.enum([
  "owner_policy",
  "permission",
  "capability_grant",
]);
export const reflectionMemoryClassSchema = z.union([
  storedReflectionClassSchema,
  forbiddenReflectionClassSchema,
]);
const memoryConsumerSchema = z.enum([
  "planner",
  "research",
  "draft",
  "audit",
  "ask",
  "reflection",
  "learning",
]);

/** Model output contains claims and references only; never trusted provenance. */
export const reflectionProposalSchema = z
  .object({
    version: z.literal(REFLECTION_VERSION),
    task: z
      .object({
        taskId: z.string().min(1).max(120),
        objectiveId: z.string().min(1).max(120).nullable().optional(),
        actionId: z.string().min(1).max(120).nullable().optional(),
        checkpointRef: z.string().min(1).max(500),
      })
      .strict(),
    outcome: z
      .object({
        status: z.enum(["succeeded", "failed", "degraded", "interrupted"]),
        summary: z.string().min(1).max(1_000),
        evidenceRefs: z.array(z.string().min(1).max(500)).min(1).max(24),
      })
      .strict(),
    failureCause: z
      .object({
        code: z.string().min(1).max(120),
        summary: z.string().min(1).max(500),
        evidenceRefs: z.array(z.string().min(1).max(500)).min(1).max(12),
      })
      .strict()
      .nullable(),
    planAssumption: z
      .object({
        statement: z.string().min(1).max(500),
        result: z.enum(["held", "did_not_hold", "unknown"]),
        evidenceRefs: z.array(z.string().min(1).max(500)).min(1).max(12),
      })
      .strict()
      .nullable(),
    candidate: z
      .object({
        memoryClass: reflectionMemoryClassSchema,
        subjectKey: z.string().min(1).max(200),
        statement: z.string().min(1).max(2_000),
        content: z.record(z.string(), z.unknown()),
        confidence: z.number().int().min(0).max(100),
        impactLevel: z.enum(["low", "medium", "high"]),
        evidenceRefs: z.array(z.string().min(1).max(500)).min(1).max(24),
        allowedConsumers: z.array(memoryConsumerSchema).min(1).max(7),
        sensitivity: z.enum(["public", "internal", "confidential", "restricted"]),
        requestedDisposition: z.enum(["auto_store", "owner_review"]),
      })
      .strict(),
  })
  .strict();

export type ReflectionProposal = z.infer<typeof reflectionProposalSchema>;
export type ReflectionMemoryClass = z.infer<typeof reflectionMemoryClassSchema>;
export type AutoStoredReflectionClass = Extract<
  ReflectionMemoryClass,
  "episodic_observation" | "semantic_summary"
>;

export type ReflectionPolicy = {
  allowedAutoStoreClasses: readonly AutoStoredReflectionClass[];
  minimumProposedConfidence: number;
  storedConfidence: number;
  maximumEvidenceAgeMs: number;
  allowedConsumers: readonly MemoryConsumer[];
};

export const DEFAULT_REFLECTION_POLICY = Object.freeze({
  allowedAutoStoreClasses: ["episodic_observation", "semantic_summary"],
  minimumProposedConfidence: 70,
  storedConfidence: 60,
  maximumEvidenceAgeMs: REFLECTION_MAX_EVIDENCE_AGE_MS,
  allowedConsumers: ["planner", "reflection", "learning"],
} satisfies ReflectionPolicy);

export type TrustedReflectionEvidence = {
  ref: string;
  sourceType: "verified_tool" | "system";
  observedAt: Date;
  terminalStatus: "completed" | "completed_degraded" | "permanent_failure";
  terminalOutcome: string;
  stepKey: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: { code: string | null; errorClass: string | null; message: string | null } | null;
};

export type TrustedReflectionEvidenceResolver = (
  scope: BrandScope,
  refs: readonly string[],
  now: Date,
) => Promise<readonly TrustedReflectionEvidence[]>;

export type ReflectionRecordCandidate = {
  memoryClass: AutoStoredReflectionClass;
  subjectKey: string;
  statement: string;
  content: Record<string, unknown>;
  impactLevel: "low";
  sourceType: "system";
  sourceRef: string;
  creator: "model_inference";
  observedAt: Date;
  validFrom: Date;
  expiresAt: Date;
  confidence: number;
  verificationState: "unverified";
  sensitivity: MemorySensitivity;
  allowedConsumers: MemoryConsumer[];
  trustLevel: "untrusted";
  extractionVersion: string;
  modelVersion: string | null;
};

export type ReflectionResolutionResult =
  | {
      disposition: "rejected";
      reason:
        | "invalid_schema"
        | "authority_escalation"
        | "unresolved_evidence"
        | "untrusted_evidence"
        | "future_evidence";
      proposal: ReflectionProposal | null;
    }
  | {
      disposition: "owner_review";
      reason:
        | "authoritative_fact_requires_owner"
        | "owner_authored_class"
        | "procedural_learning_requires_threshold"
        | "auto_store_not_permitted"
        | "high_impact_requires_owner"
        | "insufficient_confidence"
        | "semantic_summary_requires_sources"
        | "stale_evidence";
      proposal: ReflectionProposal;
    }
  | {
      disposition: "auto_store";
      proposal: ReflectionProposal;
      evidence: TrustedReflectionEvidence[];
      record: ReflectionRecordCandidate;
    };

function containsAuthorityShape(value: unknown, key = ""): boolean {
  const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, "");
  if (
    normalizedKey.includes("permission") ||
    normalizedKey.includes("capability") ||
    normalizedKey.includes("authority") ||
    normalizedKey.includes("policy") ||
    normalizedKey.startsWith("grant") ||
    normalizedKey.startsWith("allow")
  ) {
    return true;
  }
  if (typeof value === "string") {
    return /\b(?:grant(?:ed)?|allow(?:ed)?|authori[sz](?:e|ed|ation)|can|may)\b.{0,60}\b(?:publish|write|delete|update|execute|access)\b/i.test(
      value,
    );
  }
  if (Array.isArray(value)) return value.some((item) => containsAuthorityShape(item));
  if (value && typeof value === "object") {
    return Object.entries(value).some(([nestedKey, nestedValue]) =>
      containsAuthorityShape(nestedValue, nestedKey),
    );
  }
  return false;
}

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function hashMaterial(material: unknown) {
  const value = JSON.stringify(stableValue(material));
  const hash = (seed: number) => {
    let result = seed;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 0x01000193);
    }
    return (result >>> 0).toString(16).padStart(8, "0");
  };
  return `${hash(0x811c9dc5)}${hash(0x9e3779b1)}${value.length.toString(16)}`;
}

function atLeastInternal(sensitivity: ReflectionProposal["candidate"]["sensitivity"]): MemorySensitivity {
  return sensitivity === "public" ? "internal" : sensitivity;
}

function evidenceRefs(proposal: ReflectionProposal) {
  return [
    ...new Set([
      proposal.task.checkpointRef,
      ...proposal.outcome.evidenceRefs,
      ...proposal.candidate.evidenceRefs,
      ...(proposal.failureCause?.evidenceRefs ?? []),
      ...(proposal.planAssumption?.evidenceRefs ?? []),
    ]),
  ].sort();
}

function preliminaryDisposition(proposal: ReflectionProposal): ReflectionResolutionResult | null {
  const candidate = proposal.candidate;
  if (
    candidate.memoryClass === "owner_policy" ||
    candidate.memoryClass === "permission" ||
    candidate.memoryClass === "capability_grant" ||
    containsAuthorityShape(candidate.content) ||
    containsAuthorityShape(candidate.statement)
  ) {
    return { disposition: "rejected", reason: "authority_escalation", proposal };
  }
  if (candidate.memoryClass === "authoritative_fact") {
    return {
      disposition: "owner_review",
      reason: "authoritative_fact_requires_owner",
      proposal,
    };
  }
  if (candidate.memoryClass === "preference" || candidate.memoryClass === "correction") {
    return { disposition: "owner_review", reason: "owner_authored_class", proposal };
  }
  if (candidate.memoryClass === "procedural_learning") {
    return {
      disposition: "owner_review",
      reason: "procedural_learning_requires_threshold",
      proposal,
    };
  }
  return null;
}

/** Resolve model references against a separate trusted evidence channel. */
export async function resolveReflectionProposal(
  scope: BrandScope,
  raw: unknown,
  options: {
    resolver: TrustedReflectionEvidenceResolver;
    extractionVersion: string;
    modelVersion?: string | null;
    now?: Date;
    policy?: ReflectionPolicy;
  },
): Promise<ReflectionResolutionResult> {
  const parsed = reflectionProposalSchema.safeParse(raw);
  if (!parsed.success) {
    return { disposition: "rejected", reason: "invalid_schema", proposal: null };
  }
  const proposal = parsed.data;
  const candidate = proposal.candidate;
  const preliminary = preliminaryDisposition(proposal);
  if (preliminary) return preliminary;
  const policy = options.policy ?? DEFAULT_REFLECTION_POLICY;
  if (candidate.requestedDisposition !== "auto_store") {
    return { disposition: "owner_review", reason: "auto_store_not_permitted", proposal };
  }
  if (
    candidate.memoryClass !== "episodic_observation" &&
    candidate.memoryClass !== "semantic_summary"
  ) {
    return { disposition: "owner_review", reason: "auto_store_not_permitted", proposal };
  }
  const memoryClass: AutoStoredReflectionClass = candidate.memoryClass;
  if (!policy.allowedAutoStoreClasses.includes(memoryClass)) {
    return { disposition: "owner_review", reason: "auto_store_not_permitted", proposal };
  }
  if (candidate.impactLevel !== "low") {
    return { disposition: "owner_review", reason: "high_impact_requires_owner", proposal };
  }
  if (candidate.confidence < policy.minimumProposedConfidence) {
    return { disposition: "owner_review", reason: "insufficient_confidence", proposal };
  }
  if (
    candidate.memoryClass === "semantic_summary" &&
    new Set(candidate.evidenceRefs).size < 2
  ) {
    return {
      disposition: "owner_review",
      reason: "semantic_summary_requires_sources",
      proposal,
    };
  }

  const refs = evidenceRefs(proposal);
  if (refs.length > 24) {
    return { disposition: "rejected", reason: "unresolved_evidence", proposal };
  }
  const now = options.now ?? new Date();
  const resolved = [...(await options.resolver(scope, refs, now))];
  const byRef = new Map(resolved.map((item) => [item.ref, item]));
  if (resolved.length !== refs.length || refs.some((ref) => !byRef.has(ref))) {
    return { disposition: "rejected", reason: "unresolved_evidence", proposal };
  }
  if (
    resolved.some(
      (item) =>
        (item.sourceType !== "verified_tool" && item.sourceType !== "system") ||
        !["completed", "completed_degraded", "permanent_failure"].includes(
          item.terminalStatus,
        ) ||
        !Number.isFinite(item.observedAt.getTime()),
    )
  ) {
    return { disposition: "rejected", reason: "untrusted_evidence", proposal };
  }
  if (resolved.some((item) => item.observedAt > now)) {
    return { disposition: "rejected", reason: "future_evidence", proposal };
  }
  if (
    resolved.some(
      (item) => now.getTime() - item.observedAt.getTime() > policy.maximumEvidenceAgeMs,
    )
  ) {
    return { disposition: "owner_review", reason: "stale_evidence", proposal };
  }
  const orderedEvidence = refs.map((ref) => byRef.get(ref)!);
  const observedAt = new Date(
    Math.max(...orderedEvidence.map((item) => item.observedAt.getTime())),
  );

  const expiresAt = new Date(observedAt.getTime() + REFLECTION_LIFETIME_MS[memoryClass]);
  const sourceRef = `reflection:${hashMaterial({
    proposal: {
      task: proposal.task,
      outcome: proposal.outcome,
      failureCause: proposal.failureCause,
      planAssumption: proposal.planAssumption,
      candidate: {
        memoryClass: candidate.memoryClass,
        subjectKey: candidate.subjectKey,
        statement: candidate.statement,
        content: candidate.content,
        sensitivity: candidate.sensitivity,
      },
    },
    evidence: orderedEvidence.map((item) => ({
      ref: item.ref,
      observedAt: item.observedAt,
      terminalStatus: item.terminalStatus,
      terminalOutcome: item.terminalOutcome,
      error: item.error,
    })),
    extractionVersion: options.extractionVersion,
    modelVersion: options.modelVersion ?? null,
  })}`;
  return {
    disposition: "auto_store",
    proposal,
    evidence: orderedEvidence,
    record: {
      memoryClass,
      subjectKey: candidate.subjectKey,
      statement: candidate.statement,
      content: {
        ...candidate.content,
        reflection: {
          outcome: proposal.outcome,
          failureCause: proposal.failureCause,
          planAssumption: proposal.planAssumption,
          evidenceRefs: refs,
        },
      },
      impactLevel: "low",
      sourceType: "system",
      sourceRef,
      creator: "model_inference",
      observedAt,
      validFrom: observedAt,
      expiresAt,
      confidence: policy.storedConfidence,
      verificationState: "unverified",
      sensitivity: atLeastInternal(candidate.sensitivity),
      allowedConsumers: [...policy.allowedConsumers],
      trustLevel: "untrusted",
      extractionVersion: options.extractionVersion,
      modelVersion: options.modelVersion ?? null,
    },
  };
}

function executionIdFromRef(ref: string) {
  const parsed = z
    .string()
    .regex(/^agent_step_execution:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    .safeParse(ref);
  return parsed.success ? ref.slice(TERMINAL_STEP_EVIDENCE_PREFIX.length) : null;
}

/** Production resolver: only tenant-scoped, durably terminal step executions. */
export async function resolveTerminalStepExecutionEvidence(
  scope: BrandScope,
  refs: readonly string[],
  now = new Date(),
): Promise<TrustedReflectionEvidence[]> {
  const refToId = new Map<string, string>();
  for (const ref of refs) {
    const id = executionIdFromRef(ref);
    if (!id) return [];
    refToId.set(ref, id);
  }
  const ids = [...new Set(refToId.values())];
  if (ids.length !== refs.length) return [];
  const rows = await getDb()
    .select({
      id: agentStepExecutions.id,
      stepKey: agentStepExecutions.stepKey,
      status: agentStepExecutions.status,
      outcome: agentStepExecutions.outcome,
      input: agentStepExecutions.input,
      output: agentStepExecutions.output,
      lastErrorCode: agentStepExecutions.lastErrorCode,
      lastErrorClass: agentStepExecutions.lastErrorClass,
      lastError: agentStepExecutions.lastError,
      settledAt: agentStepExecutions.settledAt,
    })
    .from(agentStepExecutions)
    .where(
      and(
        eq(agentStepExecutions.workspaceId, scope.workspaceId),
        eq(agentStepExecutions.brandId, scope.brandId),
        inArray(agentStepExecutions.id, ids),
        inArray(agentStepExecutions.status, [
          "completed",
          "completed_degraded",
          "permanent_failure",
        ]),
        isNotNull(agentStepExecutions.settledAt),
        lte(agentStepExecutions.settledAt, now),
      ),
    );
  if (rows.length !== ids.length) return [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  return refs.flatMap((ref) => {
    const row = byId.get(refToId.get(ref)!);
    if (!row?.settledAt) return [];
    return [
      {
        ref,
        sourceType: "system" as const,
        observedAt: row.settledAt,
        terminalStatus: row.status as TrustedReflectionEvidence["terminalStatus"],
        terminalOutcome: row.outcome ?? row.status,
        stepKey: row.stepKey,
        input: row.input,
        output: row.output,
        error:
          row.lastErrorCode || row.lastErrorClass || row.lastError
            ? {
                code: row.lastErrorCode,
                errorClass: row.lastErrorClass,
                message: row.lastError,
              }
            : null,
      },
    ];
  });
}

function sameStoredReflection(
  existing: typeof agentMemoryRecords.$inferSelect,
  record: ReflectionRecordCandidate,
) {
  return (
    existing.memoryClass === record.memoryClass &&
    existing.subjectKey === record.subjectKey &&
    existing.statement === record.statement &&
    JSON.stringify(stableValue(existing.content)) === JSON.stringify(stableValue(record.content)) &&
    existing.observedAt.getTime() === record.observedAt.getTime() &&
    existing.expiresAt?.getTime() === record.expiresAt.getTime()
  );
}

async function findReflectionBySource(scope: BrandScope, sourceRef: string) {
  const [existing] = await getDb()
    .select()
    .from(agentMemoryRecords)
    .where(
      and(
        eq(agentMemoryRecords.workspaceId, scope.workspaceId),
        eq(agentMemoryRecords.brandId, scope.brandId),
        eq(agentMemoryRecords.sourceRef, sourceRef),
      ),
    )
    .limit(1);
  return existing ?? null;
}

async function persistResolvedReflection(
  scope: BrandScope,
  resolution: ReflectionResolutionResult,
) {
  if (resolution.disposition !== "auto_store") {
    return { resolution, stored: null } as const;
  }
  const existing = await findReflectionBySource(scope, resolution.record.sourceRef);
  if (existing) {
    if (!sameStoredReflection(existing, resolution.record)) {
      throw new Error("Reflection identity collided with different material");
    }
    return { resolution, stored: existing } as const;
  }
  try {
    const stored = await appendLayeredMemory(scope, resolution.record);
    return { resolution, stored } as const;
  } catch (error) {
    const raced = await findReflectionBySource(scope, resolution.record.sourceRef);
    if (raced && sameStoredReflection(raced, resolution.record)) {
      return { resolution, stored: raced } as const;
    }
    throw error;
  }
}

/** Idempotent production persistence backed only by the terminal-step resolver. */
export async function persistReflection(
  scope: BrandScope,
  raw: unknown,
  options: {
    extractionVersion: string;
    modelVersion?: string | null;
    now?: Date;
    policy?: ReflectionPolicy;
  },
) {
  const resolution = await resolveReflectionProposal(scope, raw, {
    ...options,
    resolver: resolveTerminalStepExecutionEvidence,
  });
  return persistResolvedReflection(scope, resolution);
}

/**
 * Safe fixed-workflow seam: all content is derived from one terminal daily
 * summary checkpoint; callers cannot supply a summary or provenance fields.
 */
export async function persistDailySummaryReflection(
  scope: BrandScope,
  stepExecutionId: string,
  now = new Date(),
) {
  const ref = `${TERMINAL_STEP_EVIDENCE_PREFIX}${stepExecutionId}`;
  const evidence = await resolveTerminalStepExecutionEvidence(scope, [ref], now);
  const checkpoint = evidence[0];
  if (!checkpoint || checkpoint.stepKey !== "daily-settle:record_summary_job") {
    throw new Error("Daily reflection requires a terminal record-summary checkpoint");
  }
  const runDate = checkpoint.input?.runDate;
  if (typeof runDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(runDate)) {
    throw new Error("Daily summary checkpoint is missing its durable run date");
  }
  const integer = (value: unknown) =>
    typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
  const generated = integer(checkpoint.input?.generated);
  const researchTopics = integer(checkpoint.input?.researchTopics);
  const hadTargets = checkpoint.input?.hadTargets === true;
  const outOfCredits = checkpoint.input?.outOfCredits === true;
  const writeFailures = Array.isArray(checkpoint.input?.writeFailures)
    ? checkpoint.input.writeFailures.filter(
        (item): item is Record<string, unknown> => Boolean(item && typeof item === "object"),
      )
    : [];
  const outputStatus =
    typeof checkpoint.output?.status === "string"
      ? checkpoint.output.status
      : checkpoint.terminalStatus === "permanent_failure"
        ? "permanent_failure"
        : checkpoint.terminalOutcome;
  const outcomeStatus =
    checkpoint.terminalStatus === "permanent_failure"
      ? ("failed" as const)
      : checkpoint.terminalStatus === "completed_degraded" ||
          writeFailures.length > 0 ||
          outOfCredits
        ? ("degraded" as const)
        : ("succeeded" as const);
  const failureCode =
    checkpoint.error?.code ??
    (typeof writeFailures[0]?.errorClass === "string"
      ? writeFailures[0].errorClass
      : outOfCredits
        ? "out_of_credits"
        : null);
  const failureSummary =
    checkpoint.terminalStatus === "permanent_failure"
      ? "The daily summary checkpoint could not be persisted."
      : writeFailures.length > 0
        ? `${writeFailures.length} selected write target(s) did not complete.`
        : outOfCredits
          ? "The daily plan stopped when its approved credit budget was exhausted."
          : null;
  const proposal: ReflectionProposal = {
    version: REFLECTION_VERSION,
    task: {
      taskId: `daily-summary:${runDate}`,
      checkpointRef: ref,
    },
    outcome: {
      status: outcomeStatus,
      summary: `Daily work settled with status ${outputStatus}: ${generated} article(s) generated and ${researchTopics} topic(s) researched.`,
      evidenceRefs: [ref],
    },
    failureCause:
      failureCode && failureSummary
        ? {
            code: failureCode,
            summary: failureSummary,
            evidenceRefs: [ref],
          }
        : null,
    planAssumption: {
      statement: "The daily content plan could complete its selected targets within its stop conditions.",
      result:
        checkpoint.terminalStatus === "permanent_failure" || writeFailures.length > 0
          ? "did_not_hold"
          : hadTargets || generated > 0 || researchTopics > 0
            ? "held"
            : "unknown",
      evidenceRefs: [ref],
    },
    candidate: {
      memoryClass: "episodic_observation",
      subjectKey: `daily-summary:${runDate}`,
      statement: `Daily work for ${runDate} settled with status ${outputStatus}.`,
      content: {
        runDate,
        status: outputStatus,
        terminalOutcome: checkpoint.terminalOutcome,
        generated,
        researchTopics,
        hadTargets,
        outOfCredits,
        writeFailureCount: writeFailures.length,
        errorClass: checkpoint.error?.errorClass ?? null,
      },
      confidence: 100,
      impactLevel: "low",
      evidenceRefs: [ref],
      allowedConsumers: ["planner", "reflection", "learning"],
      sensitivity: "internal",
      requestedDisposition: "auto_store",
    },
  };
  const resolution = await resolveReflectionProposal(scope, proposal, {
    extractionVersion: "daily-summary-reflection-v1",
    modelVersion: null,
    now,
    resolver: async () => evidence,
  });
  return persistResolvedReflection(scope, resolution);
}
