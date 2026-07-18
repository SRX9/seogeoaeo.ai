import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { ensureWeeklyPlan, replanAgentWork } from "@/lib/agent/planner";
import {
  effectiveMemoryContradictionGroup,
  memoryAuthorityScore,
  MUTUALLY_EXCLUSIVE_MEMORY_CLASSES,
  normalizeMemorySubjectKey,
  resolveActiveMemoryContradictions,
  stableMemoryValueFingerprint,
  type LayeredMemoryCandidate,
  type MemoryConsumer,
} from "@/lib/agent/layered-memory";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import {
  agentEvents,
  agentMemoryDependencies,
  agentMemoryPropagationMarkers,
  agentMemoryRecords,
  agentPlanVersions,
} from "@/lib/db/schema";
import { logError } from "@/lib/logging/logger";

const MAX_CONFLICT_ROWS = 2_000;
const MAX_EXPECTED_RECORDS = MAX_CONFLICT_ROWS;
const MAX_INVALIDATED_SUMMARIES = 500;
const MAX_PROPAGATION_ATTEMPTS = 5;
const PROPAGATION_LEASE_MS = 2 * 60_000;

const IMPACT_ORDER = { low: 0, medium: 1, high: 2 } as const;
const SENSITIVITY_ORDER = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
} as const;
type MemoryRecord = typeof agentMemoryRecords.$inferSelect;
type MemoryDb = Pick<ReturnType<typeof getDb>, "selectDistinct" | "update">;

export type MemoryConflictRecordView = {
  id: string;
  memoryClass: string;
  statement: string;
  creator: string;
  sourceType: string;
  sourceRef: string;
  confidence: number;
  verificationState: string;
  lifecycleVersion: number;
  observedAt: string;
};

export type MemoryContradictionView = {
  contradictionGroup: string;
  subjectKey: string;
  impactLevel: "low" | "medium" | "high";
  blocked: boolean;
  blockedReason: string | null;
  records: MemoryConflictRecordView[];
};

export type MemoryPropagationIssueView = {
  markerId: string;
  correctionId: string;
  subjectKey: string;
  error: string;
  attemptCount: number;
};

export type ResolveMemoryContradictionInput = {
  contradictionGroup: string;
  subjectKey: string;
  targetRecordId: string;
  expectedRecords: Array<{ id: string; lifecycleVersion: number }>;
  correctedStatement: string;
  reason: string;
  effectiveAt?: Date;
  /** Trusted internal origin; public API callers never set this field. */
  origin?: "owner_memory_ui" | "owner_profile_sync";
  /** Canonical raw profile value, accepted only for the trusted sync origin. */
  profileValue?: string | null;
  allowedConsumers?: readonly MemoryConsumer[];
};

export type CorrectMemoryRecordInput = {
  targetRecordId: string;
  expectedLifecycleVersion: number;
  correctedStatement: string;
  reason: string;
  effectiveAt?: Date;
  origin?: "owner_memory_ui" | "owner_profile_sync";
  profileValue?: string | null;
  allowedConsumers?: readonly MemoryConsumer[];
};

export class MemoryCorrectionError extends Error {
  constructor(
    readonly status: 404 | 409 | 422,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "MemoryCorrectionError";
  }
}

function asLayeredCandidate(row: MemoryRecord): LayeredMemoryCandidate {
  // Database checks constrain these text columns to the LayeredMemoryCandidate
  // unions. Keeping the conversion here makes every contradiction consumer use
  // the same authority resolver as safe retrieval.
  const candidate = row as unknown as LayeredMemoryCandidate;
  return {
    ...candidate,
    contradictionGroup: effectiveMemoryContradictionGroup(candidate),
  };
}

function impactLevel(rows: readonly MemoryRecord[]): "low" | "medium" | "high" {
  return rows.reduce<"low" | "medium" | "high">(
    (highest, row) =>
      IMPACT_ORDER[row.impactLevel as keyof typeof IMPACT_ORDER] > IMPACT_ORDER[highest]
        ? (row.impactLevel as "low" | "medium" | "high")
        : highest,
    "low",
  );
}

function mostSensitive(rows: readonly MemoryRecord[]) {
  return rows.reduce<keyof typeof SENSITIVITY_ORDER>(
    (highest, row) =>
      SENSITIVITY_ORDER[row.sensitivity as keyof typeof SENSITIVITY_ORDER] >
      SENSITIVITY_ORDER[highest]
        ? (row.sensitivity as keyof typeof SENSITIVITY_ORDER)
        : highest,
    "public",
  );
}

function conflictRecordView(row: MemoryRecord): MemoryConflictRecordView {
  return {
    id: row.id,
    memoryClass: row.memoryClass,
    statement: row.statement,
    creator: row.creator,
    sourceType: row.sourceType,
    sourceRef: row.sourceRef,
    confidence: row.confidence,
    verificationState: row.verificationState,
    lifecycleVersion: row.lifecycleVersion,
    observedAt: row.observedAt.toISOString(),
  };
}

/** Pure grouping seam used by the owner inbox and the core contradiction test. */
export function groupMemoryContradictions(
  rows: readonly MemoryRecord[],
): MemoryContradictionView[] {
  const candidates = rows.map(asLayeredCandidate);
  const sharedResolution = resolveActiveMemoryContradictions(candidates);
  const blockedGroups = new Set(sharedResolution.blockedGroups);
  const grouped = new Map<string, MemoryRecord[]>();
  for (const row of rows) {
    if (row.status !== "active") continue;
    const effectiveGroup = effectiveMemoryContradictionGroup(asLayeredCandidate(row));
    if (!effectiveGroup) continue;
    const group = grouped.get(effectiveGroup) ?? [];
    group.push(row);
    grouped.set(effectiveGroup, group);
  }

  const output: MemoryContradictionView[] = [];
  for (const [contradictionGroup, records] of grouped) {
    const groupHasHighImpact = records.some((row) => row.impactLevel === "high");
    if (groupHasHighImpact && !blockedGroups.has(contradictionGroup)) continue;
    const topAuthority = Math.max(
      ...records.map((row) => memoryAuthorityScore(asLayeredCandidate(row))),
    );
    const controllingRecords = records.filter(
      (row) => memoryAuthorityScore(asLayeredCandidate(row)) === topAuthority,
    );
    const distinctStatements = new Set(
      controllingRecords.map((row) => stableMemoryValueFingerprint(asLayeredCandidate(row))),
    );
    // A single trusted owner-approved value controls lower model/external
    // claims. It remains visible through retrieval provenance but is not an
    // unresolved contradiction and cannot be used for a poisoning DoS.
    if (controllingRecords.length < 2 || distinctStatements.size < 2) continue;
    const impact = groupHasHighImpact ? "high" : impactLevel(controllingRecords);
    const sorted = [...records].sort(
      (left, right) =>
        memoryAuthorityScore(asLayeredCandidate(right)) -
          memoryAuthorityScore(asLayeredCandidate(left)) ||
        right.confidence - left.confidence ||
        right.updatedAt.getTime() - left.updatedAt.getTime() ||
        left.id.localeCompare(right.id),
    );
    output.push({
      contradictionGroup,
      subjectKey: sorted[0]?.subjectKey ?? "unknown",
      impactLevel: impact,
      blocked: impact === "high",
      blockedReason:
        impact === "high"
          ? "High-impact actions that depend on this fact are blocked until the owner resolves it."
          : null,
      records: sorted.map(conflictRecordView),
    });
  }
  return output.sort(
    (left, right) =>
      IMPACT_ORDER[right.impactLevel] - IMPACT_ORDER[left.impactLevel] ||
      left.subjectKey.localeCompare(right.subjectKey),
  );
}

export async function listUnresolvedMemoryContradictions(
  scope: BrandScope,
  now = new Date(),
) {
  return (await scanMemoryContradictions(scope, now)).contradictions;
}

async function listActiveContradictionRows(scope: BrandScope, now: Date) {
  const rows = await getDb()
    .select()
    .from(agentMemoryRecords)
    .where(
      and(
        eq(agentMemoryRecords.workspaceId, scope.workspaceId),
        eq(agentMemoryRecords.brandId, scope.brandId),
        eq(agentMemoryRecords.status, "active"),
        inArray(agentMemoryRecords.memoryClass, [...MUTUALLY_EXCLUSIVE_MEMORY_CLASSES]),
        lte(agentMemoryRecords.validFrom, now),
        or(isNull(agentMemoryRecords.expiresAt), gt(agentMemoryRecords.expiresAt, now)),
      ),
    )
    .orderBy(desc(agentMemoryRecords.updatedAt))
    .limit(MAX_CONFLICT_ROWS + 1);
  return {
    rows: rows.slice(0, MAX_CONFLICT_ROWS),
    overflow: rows.length > MAX_CONFLICT_ROWS,
  };
}

export async function scanMemoryContradictions(scope: BrandScope, now = new Date()) {
  const scan = await listActiveContradictionRows(scope, now);
  return {
    contradictions: groupMemoryContradictions(scan.rows),
    overflow: scan.overflow,
  };
}

export async function listMemoryPropagationIssues(
  scope: BrandScope,
): Promise<MemoryPropagationIssueView[]> {
  return getDb()
    .select({
      markerId: agentMemoryPropagationMarkers.id,
      correctionId: agentMemoryPropagationMarkers.correctionId,
      subjectKey: agentMemoryRecords.subjectKey,
      error: agentMemoryPropagationMarkers.lastError,
      attemptCount: agentMemoryPropagationMarkers.attemptCount,
    })
    .from(agentMemoryPropagationMarkers)
    .leftJoin(
      agentMemoryRecords,
      and(
        eq(agentMemoryRecords.id, agentMemoryPropagationMarkers.correctionId),
        eq(agentMemoryRecords.workspaceId, scope.workspaceId),
        eq(agentMemoryRecords.brandId, scope.brandId),
      ),
    )
    .where(
      and(
        eq(agentMemoryPropagationMarkers.workspaceId, scope.workspaceId),
        eq(agentMemoryPropagationMarkers.brandId, scope.brandId),
        eq(agentMemoryPropagationMarkers.status, "dead_letter"),
      ),
    )
    .orderBy(desc(agentMemoryPropagationMarkers.updatedAt))
    .limit(20)
    .then((rows) =>
      rows.map((row) => ({
        ...row,
        subjectKey: row.subjectKey ?? "unknown memory subject",
        error: row.error ?? "The correction could not be propagated to future plans.",
      })),
    );
}

/** Fail-closed execution gate for facts whose active values still conflict. */
export async function hasUnresolvedHighImpactMemoryContradiction(
  scope: BrandScope,
  now = new Date(),
) {
  const scan = await listActiveContradictionRows(scope, now);
  if (scan.overflow) return "memory-contradiction-scan-overflow";
  return (
    resolveActiveMemoryContradictions(scan.rows.map(asLayeredCandidate)).blockedGroups[0] ?? null
  );
}

function expectedSetMatches(
  rows: readonly MemoryRecord[],
  expected: ResolveMemoryContradictionInput["expectedRecords"],
) {
  if (rows.length !== expected.length) return false;
  const versions = new Map(expected.map((item) => [item.id, item.lifecycleVersion]));
  return rows.every((row) => versions.get(row.id) === row.lifecycleVersion);
}

async function invalidateDependentSummaries(
  db: MemoryDb,
  scope: BrandScope,
  rootRecordIds: readonly string[],
  now: Date,
) {
  let frontier = [...new Set(rootRecordIds)];
  const invalidated = new Set<string>();
  while (frontier.length > 0) {
    const remaining = MAX_INVALIDATED_SUMMARIES - invalidated.size;
    if (remaining <= 0) {
      throw new Error("Correction affects too many semantic summaries to propagate safely");
    }
    const candidates = await db
      .selectDistinct({ id: agentMemoryDependencies.recordId })
      .from(agentMemoryDependencies)
      .innerJoin(
        agentMemoryRecords,
        and(
          eq(agentMemoryRecords.id, agentMemoryDependencies.recordId),
          eq(agentMemoryRecords.workspaceId, scope.workspaceId),
          eq(agentMemoryRecords.brandId, scope.brandId),
          eq(agentMemoryRecords.memoryClass, "semantic_summary"),
          eq(agentMemoryRecords.status, "active"),
        ),
      )
      .where(
        and(
          eq(agentMemoryDependencies.workspaceId, scope.workspaceId),
          eq(agentMemoryDependencies.brandId, scope.brandId),
          inArray(agentMemoryDependencies.dependsOnRecordId, frontier),
        ),
      )
      .limit(remaining + 1);
    const ids = [...new Set(candidates.map((candidate) => candidate.id))].filter(
      (id) => !invalidated.has(id),
    );
    if (ids.length > remaining) {
      throw new Error("Correction affects too many semantic summaries to propagate safely");
    }
    if (ids.length === 0) break;
    const updated = await db
      .update(agentMemoryRecords)
      .set({
        status: "invalidated",
        lifecycleVersion: sql`${agentMemoryRecords.lifecycleVersion} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(agentMemoryRecords.workspaceId, scope.workspaceId),
          eq(agentMemoryRecords.brandId, scope.brandId),
          eq(agentMemoryRecords.memoryClass, "semantic_summary"),
          eq(agentMemoryRecords.status, "active"),
          inArray(agentMemoryRecords.id, ids),
        ),
      )
      .returning({ id: agentMemoryRecords.id });
    frontier = updated.map((row) => row.id);
    for (const row of updated) invalidated.add(row.id);
  }
  return [...invalidated];
}

async function commitMemoryCorrection(
  scope: BrandScope,
  input: ResolveMemoryContradictionInput,
  now = new Date(),
  requireConflict = true,
) {
  const statement = input.correctedStatement.trim().replace(/\s+/g, " ");
  const reason = input.reason.trim();
  const effectiveAt = input.effectiveAt ?? now;
  if (!statement || !reason) {
    throw new MemoryCorrectionError(422, "A corrected value and reason are required.");
  }
  if (
    input.expectedRecords.length < (requireConflict ? 2 : 1) ||
    input.expectedRecords.length > MAX_EXPECTED_RECORDS ||
    new Set(input.expectedRecords.map((row) => row.id)).size !== input.expectedRecords.length
  ) {
    throw new MemoryCorrectionError(422, "The expected conflict set is invalid.");
  }
  if (effectiveAt.getTime() > now.getTime()) {
    throw new MemoryCorrectionError(422, "Corrections must take effect immediately or in the past.");
  }

  return getDb().transaction(async (tx) => {
    const contradictionLock = `claudia-memory-contradiction:${scope.workspaceId}:${scope.brandId}:${input.contradictionGroup}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${contradictionLock}))`);
    const candidates = await tx
      .select()
      .from(agentMemoryRecords)
      .where(
        and(
          eq(agentMemoryRecords.workspaceId, scope.workspaceId),
          eq(agentMemoryRecords.brandId, scope.brandId),
          eq(agentMemoryRecords.status, "active"),
          inArray(agentMemoryRecords.memoryClass, [...MUTUALLY_EXCLUSIVE_MEMORY_CLASSES]),
          or(
            eq(agentMemoryRecords.contradictionGroup, input.contradictionGroup),
            and(
              isNull(agentMemoryRecords.contradictionGroup),
              sql`lower(regexp_replace(btrim(${agentMemoryRecords.subjectKey}), '[[:space:]]+', ' ', 'g')) = ${normalizeMemorySubjectKey(input.subjectKey)}`,
            ),
          ),
          lte(agentMemoryRecords.validFrom, now),
          or(isNull(agentMemoryRecords.expiresAt), gt(agentMemoryRecords.expiresAt, now)),
        ),
      )
      .orderBy(asc(agentMemoryRecords.id))
      .limit(MAX_EXPECTED_RECORDS + 1)
      .for("update");
    const active = candidates.filter(
      (row) =>
        effectiveMemoryContradictionGroup(asLayeredCandidate(row)) ===
        input.contradictionGroup,
    );
    if (active.length === 0) {
      throw new MemoryCorrectionError(404, "Memory conflict not found.");
    }
    if (active.length > MAX_EXPECTED_RECORDS) {
      throw new MemoryCorrectionError(
        422,
        "This memory conflict exceeds the safe owner-resolution limit and requires operator recovery.",
      );
    }
    if (
      !expectedSetMatches(active, input.expectedRecords) ||
      !active.some((row) => row.id === input.targetRecordId)
    ) {
      throw new MemoryCorrectionError(409, "This memory conflict changed in another session.", {
        currentRecords: active.map((row) => ({
          id: row.id,
          lifecycleVersion: row.lifecycleVersion,
        })),
      });
    }
    const normalizedSubjectKey = normalizeMemorySubjectKey(input.subjectKey);
    if (active.some((row) => normalizeMemorySubjectKey(row.subjectKey) !== normalizedSubjectKey)) {
      throw new MemoryCorrectionError(422, "The contradiction group mixes different subjects.");
    }
    if (
      requireConflict &&
      new Set(active.map((row) => stableMemoryValueFingerprint(asLayeredCandidate(row)))).size < 2
    ) {
      throw new MemoryCorrectionError(409, "This memory conflict has already been resolved.");
    }

    const target = active.find((row) => row.id === input.targetRecordId);
    if (!target) throw new MemoryCorrectionError(409, "The correction target changed.");
    const supersededRecordIds = active.map((row) => row.id);
    const [correction] = await tx
      .insert(agentMemoryRecords)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        memoryClass: "correction",
        subjectKey: input.subjectKey,
        statement,
        content: {
          semanticValue: statement,
          reason,
          targetBeliefId: target.id,
          supersededRecordIds,
          previousStatements: active.map((row) => ({ id: row.id, statement: row.statement })),
          effectiveAt: effectiveAt.toISOString(),
          correctionOrigin: input.origin ?? "owner_memory_ui",
          ...(input.origin === "owner_profile_sync"
            ? { profileValue: input.profileValue ?? null }
            : {}),
        },
        impactLevel: impactLevel(active),
        sourceType: "owner_input",
        sourceRef: `owner-memory-resolution:${input.contradictionGroup}`,
        creator: "owner",
        observedAt: now,
        validFrom: effectiveAt,
        expiresAt: null,
        confidence: 100,
        verificationState: "owner_approved",
        sensitivity: mostSensitive(active),
        allowedConsumers:
          input.origin === "owner_profile_sync" && input.allowedConsumers
            ? [...new Set(input.allowedConsumers)]
            : [...new Set(active.flatMap((row) => row.allowedConsumers))],
        trustLevel: "trusted",
        status: "active",
        supersedesId: target.id,
        contradictionGroup: input.contradictionGroup,
        extractionVersion: "owner-correction-v1",
        modelVersion: null,
      })
      .returning();
    if (!correction) throw new Error("Memory correction could not be recorded");

    const superseded = await tx
      .update(agentMemoryRecords)
      .set({
        status: "superseded",
        supersededById: correction.id,
        lifecycleVersion: sql`${agentMemoryRecords.lifecycleVersion} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(agentMemoryRecords.workspaceId, scope.workspaceId),
          eq(agentMemoryRecords.brandId, scope.brandId),
          eq(agentMemoryRecords.status, "active"),
          inArray(agentMemoryRecords.id, supersededRecordIds),
        ),
      )
      .returning({ id: agentMemoryRecords.id });
    if (superseded.length !== active.length) {
      throw new Error("Memory conflict changed while the correction was being committed");
    }

    await tx.insert(agentMemoryDependencies).values(
      active.map((row) => ({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        recordId: correction.id,
        dependsOnRecordId: row.id,
        relation: row.id === target.id ? "corrects" : "contradicts",
      })),
    );
    const invalidatedSummaryIds = await invalidateDependentSummaries(
      tx,
      scope,
      supersededRecordIds,
      now,
    );

    const [marker] = await tx
      .insert(agentMemoryPropagationMarkers)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        correctionId: correction.id,
      })
      .returning();
    if (!marker) throw new Error("Memory propagation marker could not be recorded");

    const [event] = await tx
      .insert(agentEvents)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        eventType: "memory_corrected",
        summary: requireConflict
          ? `Owner resolved a memory conflict for ${input.subjectKey}.`
          : `Owner corrected memory for ${input.subjectKey}.`,
        actor: "owner",
        data: {
          contradictionGroup: input.contradictionGroup,
          correctionId: correction.id,
          supersededRecordIds,
          invalidatedSummaryIds,
          propagationMarkerId: marker.id,
        },
      })
      .returning({ id: agentEvents.id });
    if (!event) throw new Error("Memory correction event could not be recorded");

    return {
      correction,
      marker,
      supersededRecordIds,
      invalidatedSummaryIds,
      eventId: event.id,
    };
  });
}

export async function resolveMemoryContradiction(
  scope: BrandScope,
  input: ResolveMemoryContradictionInput,
  now = new Date(),
) {
  return commitMemoryCorrection(scope, input, now, true);
}

/** Correct one current belief without requiring a manufactured conflict row. */
export async function correctMemoryRecord(
  scope: BrandScope,
  input: CorrectMemoryRecordInput,
  now = new Date(),
) {
  const [target] = await getDb()
    .select()
    .from(agentMemoryRecords)
    .where(
      and(
        eq(agentMemoryRecords.id, input.targetRecordId),
        eq(agentMemoryRecords.workspaceId, scope.workspaceId),
        eq(agentMemoryRecords.brandId, scope.brandId),
        eq(agentMemoryRecords.status, "active"),
        inArray(agentMemoryRecords.memoryClass, [...MUTUALLY_EXCLUSIVE_MEMORY_CLASSES]),
        lte(agentMemoryRecords.validFrom, now),
        or(isNull(agentMemoryRecords.expiresAt), gt(agentMemoryRecords.expiresAt, now)),
      ),
    )
    .limit(1);
  if (!target) throw new MemoryCorrectionError(404, "Memory record not found.");
  const contradictionGroup = effectiveMemoryContradictionGroup(
    asLayeredCandidate(target),
  );
  if (!contradictionGroup) {
    throw new MemoryCorrectionError(422, "This memory class cannot be owner-corrected.");
  }
  return commitMemoryCorrection(
    scope,
    {
      contradictionGroup,
      subjectKey: target.subjectKey,
      targetRecordId: target.id,
      expectedRecords: [
        { id: target.id, lifecycleVersion: input.expectedLifecycleVersion },
      ],
      correctedStatement: input.correctedStatement,
      reason: input.reason,
      effectiveAt: input.effectiveAt,
      origin: input.origin,
      profileValue: input.profileValue,
      allowedConsumers: input.allowedConsumers,
    },
    now,
    false,
  );
}

export type MemoryPropagationResult = {
  status: "applied" | "pending" | "in_progress" | "dead_letter";
  correctionId: string;
  planDiff: { fromVersion: number; toVersion: number; movedTaskCount: number } | null;
  error: string | null;
};

function propagationResult(
  correctionId: string,
  status: MemoryPropagationResult["status"],
  error: string | null = null,
): MemoryPropagationResult {
  return { status, correctionId, planDiff: null, error };
}

async function planCreatedForCorrection(scope: BrandScope, correctionId: string) {
  const [plan] = await getDb()
    .select({ id: agentPlanVersions.id, version: agentPlanVersions.version })
    .from(agentPlanVersions)
    .where(
      and(
        eq(agentPlanVersions.workspaceId, scope.workspaceId),
        eq(agentPlanVersions.brandId, scope.brandId),
        sql`${agentPlanVersions.evidenceSnapshot}->>'memoryCorrectionId' = ${correctionId}`,
      ),
    )
    .orderBy(desc(agentPlanVersions.createdAt))
    .limit(1);
  return plan ?? null;
}

async function settlePropagationFromReceipt(scope: BrandScope, correctionId: string) {
  const [settled] = await getDb()
    .update(agentMemoryPropagationMarkers)
    .set({
      status: "applied",
      leaseOwner: null,
      leaseExpiresAt: null,
      retryAfter: null,
      lastError: null,
      settledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(agentMemoryPropagationMarkers.workspaceId, scope.workspaceId),
        eq(agentMemoryPropagationMarkers.brandId, scope.brandId),
        eq(agentMemoryPropagationMarkers.correctionId, correctionId),
      ),
    )
    .returning({ id: agentMemoryPropagationMarkers.id });
  return Boolean(settled);
}

async function readPropagationMarker(scope: BrandScope, correctionId: string) {
  const [marker] = await getDb()
    .select()
    .from(agentMemoryPropagationMarkers)
    .where(
      and(
        eq(agentMemoryPropagationMarkers.workspaceId, scope.workspaceId),
        eq(agentMemoryPropagationMarkers.brandId, scope.brandId),
        eq(agentMemoryPropagationMarkers.correctionId, correctionId),
      ),
    )
    .limit(1);
  return marker ?? null;
}

function resultFromMarker(
  marker: NonNullable<Awaited<ReturnType<typeof readPropagationMarker>>>,
): MemoryPropagationResult {
  if (marker.status === "applied") return propagationResult(marker.correctionId, "applied");
  if (marker.status === "dead_letter") {
    return propagationResult(
      marker.correctionId,
      "dead_letter",
      marker.lastError ?? "The correction could not be propagated to future plans.",
    );
  }
  return propagationResult(
    marker.correctionId,
    marker.status === "in_progress" ? "in_progress" : "pending",
    marker.lastError,
  );
}

/**
 * Fenced, retryable consumer for the correction outbox. An immutable plan
 * receipt wins if a process dies after replanning but before marker settlement.
 */
export async function reconcileMemoryCorrectionPropagation(
  scope: BrandScope,
  correctionId: string,
  options: { now?: Date; workerId?: string } = {},
): Promise<MemoryPropagationResult> {
  const now = options.now ?? new Date();
  const workerId = options.workerId ?? `memory-propagation:${crypto.randomUUID()}`;
  const existing = await readPropagationMarker(scope, correctionId);
  if (!existing) return propagationResult(correctionId, "dead_letter", "Propagation marker not found.");

  const receipt = await planCreatedForCorrection(scope, correctionId);
  if (receipt) {
    await settlePropagationFromReceipt(scope, correctionId);
    return propagationResult(correctionId, "applied");
  }
  if (existing.status === "applied" || existing.status === "dead_letter") {
    return resultFromMarker(existing);
  }

  const [claimed] = await getDb()
    .update(agentMemoryPropagationMarkers)
    .set({
      status: "in_progress",
      attemptCount: sql`${agentMemoryPropagationMarkers.attemptCount} + 1`,
      leaseOwner: workerId,
      leaseExpiresAt: new Date(now.getTime() + PROPAGATION_LEASE_MS),
      retryAfter: null,
      lastError: null,
      settledAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(agentMemoryPropagationMarkers.id, existing.id),
        eq(agentMemoryPropagationMarkers.workspaceId, scope.workspaceId),
        eq(agentMemoryPropagationMarkers.brandId, scope.brandId),
        or(
          and(
            eq(agentMemoryPropagationMarkers.status, "pending"),
            or(
              isNull(agentMemoryPropagationMarkers.retryAfter),
              lte(agentMemoryPropagationMarkers.retryAfter, now),
            ),
          ),
          and(
            eq(agentMemoryPropagationMarkers.status, "in_progress"),
            or(
              isNull(agentMemoryPropagationMarkers.leaseExpiresAt),
              lte(agentMemoryPropagationMarkers.leaseExpiresAt, now),
            ),
          ),
        ),
      ),
    )
    .returning();
  if (!claimed) {
    const current = await readPropagationMarker(scope, correctionId);
    return current
      ? resultFromMarker(current)
      : propagationResult(correctionId, "dead_letter", "Propagation marker not found.");
  }

  try {
    const concurrentReceipt = await planCreatedForCorrection(scope, correctionId);
    if (concurrentReceipt) {
      await settlePropagationFromReceipt(scope, correctionId);
      return propagationResult(correctionId, "applied");
    }
    const [correction] = await getDb()
      .select()
      .from(agentMemoryRecords)
      .where(
        and(
          eq(agentMemoryRecords.id, correctionId),
          eq(agentMemoryRecords.workspaceId, scope.workspaceId),
          eq(agentMemoryRecords.brandId, scope.brandId),
          eq(agentMemoryRecords.memoryClass, "correction"),
        ),
      )
      .limit(1);
    if (!correction) {
      const corruption = "The correction record is missing or outside its tenant scope.";
      await getDb()
        .update(agentMemoryPropagationMarkers)
        .set({
          status: "dead_letter",
          leaseOwner: null,
          leaseExpiresAt: null,
          retryAfter: null,
          lastError: corruption,
          settledAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(agentMemoryPropagationMarkers.id, claimed.id),
            eq(agentMemoryPropagationMarkers.workspaceId, scope.workspaceId),
            eq(agentMemoryPropagationMarkers.brandId, scope.brandId),
            eq(agentMemoryPropagationMarkers.status, "in_progress"),
            eq(agentMemoryPropagationMarkers.attemptCount, claimed.attemptCount),
            eq(agentMemoryPropagationMarkers.leaseOwner, workerId),
          ),
        );
      return propagationResult(correctionId, "dead_letter", corruption);
    }
    if (correction.status !== "active") {
      const [settled] = await getDb()
        .update(agentMemoryPropagationMarkers)
        .set({
          status: "applied",
          leaseOwner: null,
          leaseExpiresAt: null,
          settledAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(agentMemoryPropagationMarkers.id, claimed.id),
            eq(agentMemoryPropagationMarkers.workspaceId, scope.workspaceId),
            eq(agentMemoryPropagationMarkers.brandId, scope.brandId),
            eq(agentMemoryPropagationMarkers.status, "in_progress"),
            eq(agentMemoryPropagationMarkers.attemptCount, claimed.attemptCount),
            eq(agentMemoryPropagationMarkers.leaseOwner, workerId),
          ),
        )
        .returning({ id: agentMemoryPropagationMarkers.id });
      if (!settled) {
        const current = await readPropagationMarker(scope, correctionId);
        return current ? resultFromMarker(current) : propagationResult(correctionId, "applied");
      }
      return propagationResult(correctionId, "applied");
    }

    const roots = Array.isArray(correction.content.supersededRecordIds)
      ? correction.content.supersededRecordIds.filter(
          (value): value is string => typeof value === "string",
        )
      : correction.supersedesId
        ? [correction.supersedesId]
        : [];
    if (roots.length > 0) {
      const uniqueRoots = [...new Set(roots)];
      await getDb().transaction(async (tx) => {
        const lockedRoots = await tx
          .select({ id: agentMemoryRecords.id })
          .from(agentMemoryRecords)
          .where(
            and(
              eq(agentMemoryRecords.workspaceId, scope.workspaceId),
              eq(agentMemoryRecords.brandId, scope.brandId),
              inArray(agentMemoryRecords.id, uniqueRoots),
            ),
          )
          .orderBy(asc(agentMemoryRecords.id))
          .for("update");
        if (lockedRoots.length !== uniqueRoots.length) {
          throw new Error("Correction provenance references missing memory records");
        }
        return invalidateDependentSummaries(tx, scope, uniqueRoots, now);
      });
    }

    const { mission } = await ensureWeeklyPlan(scope, { at: now });
    const replanned = await replanAgentWork(
      scope,
      `Owner corrected memory for ${correction.subjectKey}.`,
      {
        source: "owner_memory_correction",
        correctionRecordId: correction.id,
        subjectKey: correction.subjectKey,
        sourceRef: correction.sourceRef,
        allowedConsumers: correction.allowedConsumers,
      },
      {
        expectedMissionDefinitionVersion: mission.definitionVersion,
        memoryCorrectionId: correction.id,
        memoryCorrectionBoundary: correction.createdAt,
      },
    );

    const [settled] = await getDb()
      .update(agentMemoryPropagationMarkers)
      .set({
        status: "applied",
        leaseOwner: null,
        leaseExpiresAt: null,
        retryAfter: null,
        lastError: null,
        settledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(agentMemoryPropagationMarkers.id, claimed.id),
          eq(agentMemoryPropagationMarkers.workspaceId, scope.workspaceId),
          eq(agentMemoryPropagationMarkers.brandId, scope.brandId),
          eq(agentMemoryPropagationMarkers.status, "in_progress"),
          eq(agentMemoryPropagationMarkers.attemptCount, claimed.attemptCount),
          eq(agentMemoryPropagationMarkers.leaseOwner, workerId),
        ),
      )
      .returning({ id: agentMemoryPropagationMarkers.id });
    if (!settled) {
      const afterReceipt = await planCreatedForCorrection(scope, correctionId);
      if (afterReceipt) await settlePropagationFromReceipt(scope, correctionId);
    }
    return {
      status: "applied",
      correctionId,
      planDiff: replanned.alreadyApplied
        ? null
        : {
            fromVersion: replanned.current.version,
            toVersion: replanned.plan.version,
            movedTaskCount: replanned.movedTaskCount,
          },
      error: null,
    };
  } catch (error) {
    const crashReceipt = await planCreatedForCorrection(scope, correctionId);
    if (crashReceipt) {
      await settlePropagationFromReceipt(scope, correctionId);
      return propagationResult(correctionId, "applied");
    }
    const failedAt = new Date();
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
    const deadLetter = claimed.attemptCount >= MAX_PROPAGATION_ATTEMPTS;
    const [failed] = await getDb()
      .update(agentMemoryPropagationMarkers)
      .set({
        status: deadLetter ? "dead_letter" : "pending",
        leaseOwner: null,
        leaseExpiresAt: null,
        retryAfter: deadLetter
          ? null
          : new Date(
              failedAt.getTime() +
                Math.min(60, 5 * 2 ** Math.max(0, claimed.attemptCount - 1)) * 60_000,
            ),
        lastError: message,
        settledAt: deadLetter ? failedAt : null,
        updatedAt: failedAt,
      })
      .where(
        and(
          eq(agentMemoryPropagationMarkers.id, claimed.id),
          eq(agentMemoryPropagationMarkers.workspaceId, scope.workspaceId),
          eq(agentMemoryPropagationMarkers.brandId, scope.brandId),
          eq(agentMemoryPropagationMarkers.status, "in_progress"),
          eq(agentMemoryPropagationMarkers.attemptCount, claimed.attemptCount),
          eq(agentMemoryPropagationMarkers.leaseOwner, workerId),
        ),
      )
      .returning({ id: agentMemoryPropagationMarkers.id });
    logError("agent.memory_correction_propagation_failed", {
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      correctionId,
      attempt: claimed.attemptCount,
      error: message,
    });
    if (!failed) {
      const current = await readPropagationMarker(scope, correctionId);
      return current
        ? resultFromMarker(current)
        : propagationResult(correctionId, "dead_letter", message);
    }
    return propagationResult(correctionId, deadLetter ? "dead_letter" : "pending", message);
  }
}

export type MemoryPropagationDrainSummary = {
  examined: number;
  applied: number;
  pending: number;
  inProgress: number;
  deadLetter: number;
  failed: number;
};

export async function drainMemoryCorrectionPropagation(
  options: { limit?: number; now?: Date } = {},
): Promise<MemoryPropagationDrainSummary> {
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(100, options.limit ?? 25));
  const markers = await getDb()
    .select()
    .from(agentMemoryPropagationMarkers)
    .where(
      or(
        and(
          eq(agentMemoryPropagationMarkers.status, "pending"),
          or(
            isNull(agentMemoryPropagationMarkers.retryAfter),
            lte(agentMemoryPropagationMarkers.retryAfter, now),
          ),
        ),
        and(
          eq(agentMemoryPropagationMarkers.status, "in_progress"),
          or(
            isNull(agentMemoryPropagationMarkers.leaseExpiresAt),
            lte(agentMemoryPropagationMarkers.leaseExpiresAt, now),
          ),
        ),
      ),
    )
    .orderBy(asc(agentMemoryPropagationMarkers.createdAt))
    .limit(limit);
  const summary: MemoryPropagationDrainSummary = {
    examined: markers.length,
    applied: 0,
    pending: 0,
    inProgress: 0,
    deadLetter: 0,
    failed: 0,
  };
  for (const marker of markers) {
    try {
      const result = await reconcileMemoryCorrectionPropagation(
        { workspaceId: marker.workspaceId, brandId: marker.brandId },
        marker.correctionId,
        { now },
      );
      if (result.status === "applied") summary.applied += 1;
      else if (result.status === "pending") summary.pending += 1;
      else if (result.status === "in_progress") summary.inProgress += 1;
      else summary.deadLetter += 1;
    } catch (error) {
      summary.failed += 1;
      logError("agent.memory_correction_drain_failed", {
        workspaceId: marker.workspaceId,
        brandId: marker.brandId,
        correctionId: marker.correctionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return summary;
}
