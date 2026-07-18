import { and, desc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getAgentControlState } from "@/lib/agent/memory";
import { getAgentSafetyDecision } from "@/lib/agent/safety";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import {
  agentActionLedger,
  agentMissions,
  agentOutcomeAttributions,
  agentStrategyWeightVersions,
  articles,
  performanceCheckpoints,
  topics,
} from "@/lib/db/schema";
import type { ResearchSourceType } from "@/lib/research/types";

export const LEARNING_EVALUATOR_VERSION = "claudia-learning-v1" as const;
export const MIN_PRODUCTION_SAMPLES = 20;
export const MIN_DISTINCT_ACTIONS = 5;
export const MIN_PRODUCTION_CONFIDENCE = 80;
export const PRODUCTION_WEIGHT_BOUNDS = { min: 0.75, max: 1.25 } as const;
export const DATABASE_WEIGHT_BOUNDS = { min: 0.5, max: 2 } as const;
const RESEARCH_SOURCE_ACTION_FAMILY = "research.source" as const;
const RESEARCH_OUTCOME_KIND = "organic_impressions" as const;
const ATTRIBUTION_BACKFILL_LIMIT = 100;
const LEARNING_OBSERVATION_LIMIT = 500;
const RESEARCH_SOURCE_TYPES = [
  "web_search",
  "rss",
  "sitemap",
  "trend_query",
  "keyword_api",
  "use_case",
  "competitor_gap",
  "gsc_query",
] as const satisfies readonly ResearchSourceType[];
const researchSourceTypeSchema = z.enum(RESEARCH_SOURCE_TYPES);

const confounderSchema = z
  .object({
    kind: z.enum([
      "seasonality",
      "site_wide_change",
      "competing_action",
      "external_event",
      "data_gap",
    ]),
    severity: z.enum(["low", "medium", "high"]),
    evidenceRef: z.string().min(1).max(500),
  })
  .strict();

export const outcomeAttributionInputSchema = z
  .object({
    attributionKey: z.string().min(1).max(240),
    actionId: z.string().uuid(),
    contentId: z.string().uuid().nullable().default(null),
    queryKey: z.string().trim().min(1).max(500).nullable().default(null),
    objectiveId: z.string().uuid().nullable().default(null),
    attributionLevel: z.enum(["action", "page", "query"]),
    outcomeKind: z.string().min(1).max(120),
    outcomeValue: z.number().finite(),
    observedAt: z.coerce.date(),
    baseline: z
      .object({
        value: z.number().finite(),
        observedAt: z.string().datetime(),
      })
      .strict()
      .nullable()
      .default(null),
    windowStart: z.coerce.date(),
    windowEnd: z.coerce.date(),
    confounders: z.array(confounderSchema).max(12).default([]),
    holdoutGroup: z
      .string()
      .regex(/^(?:treatment|holdout):[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/)
      .nullable()
      .default(null),
    verified: z.boolean(),
    evidenceRefs: z.array(z.string().min(1).max(500)).max(24),
    sourceRef: z.string().min(1).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.windowEnd <= value.windowStart) {
      context.addIssue({ code: "custom", path: ["windowEnd"], message: "Window must advance." });
    }
    if (value.observedAt < value.windowStart || value.observedAt > value.windowEnd) {
      context.addIssue({
        code: "custom",
        path: ["observedAt"],
        message: "Observation must fall inside its attribution window.",
      });
    }
    if (value.attributionLevel === "action" && (value.contentId || value.queryKey)) {
      context.addIssue({
        code: "custom",
        path: ["attributionLevel"],
        message: "Action attribution cannot claim page or query lineage.",
      });
    }
    if (value.attributionLevel === "page" && (!value.contentId || value.queryKey)) {
      context.addIssue({
        code: "custom",
        path: ["contentId"],
        message: "Page attribution requires content and no query key.",
      });
    }
    if (value.attributionLevel === "query" && (!value.contentId || !value.queryKey)) {
      context.addIssue({
        code: "custom",
        path: ["queryKey"],
        message: "Query attribution requires both page and query lineage.",
      });
    }
    if (value.verified && value.evidenceRefs.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["evidenceRefs"],
        message: "Verified attribution requires evidence.",
      });
    }
    if (value.verified && !value.evidenceRefs.includes(value.sourceRef)) {
      context.addIssue({
        code: "custom",
        path: ["sourceRef"],
        message: "Verified attribution source must be one of its evidence references.",
      });
    }
    if (
      value.baseline &&
      new Date(value.baseline.observedAt).getTime() > value.windowStart.getTime()
    ) {
      context.addIssue({
        code: "custom",
        path: ["baseline", "observedAt"],
        message: "Baseline must be observed before the attribution window.",
      });
    }
  });

export type OutcomeAttributionInput = z.infer<typeof outcomeAttributionInputSchema>;
export type AttributionLevel = OutcomeAttributionInput["attributionLevel"];

const storedConfoundersSchema = z
  .object({
    version: z.literal("claudia-confounders-v1"),
    items: z.array(confounderSchema).max(12),
  })
  .strict();

function attributionLevel(contentId: string | null, queryKey: string | null): AttributionLevel {
  if (queryKey) return "query";
  if (contentId) return "page";
  return "action";
}

function sameAttribution(
  existing: typeof agentOutcomeAttributions.$inferSelect,
  input: OutcomeAttributionInput,
) {
  const storedConfounders = storedConfoundersSchema.safeParse(existing.confounders);
  if (!storedConfounders.success) return false;
  const canonicalConfounders = (items: z.infer<typeof confounderSchema>[]) =>
    [...items].sort((left, right) =>
      `${left.kind}:${left.severity}:${left.evidenceRef}`.localeCompare(
        `${right.kind}:${right.severity}:${right.evidenceRef}`,
      ),
    );
  const canonicalStrings = (items: string[]) => [...items].sort();
  return (
    existing.actionId === input.actionId &&
    existing.contentId === input.contentId &&
    existing.queryKey === input.queryKey &&
    attributionLevel(existing.contentId, existing.queryKey) === input.attributionLevel &&
    existing.objectiveId === input.objectiveId &&
    existing.outcomeKind === input.outcomeKind &&
    existing.outcomeValue === input.outcomeValue &&
    existing.observedAt.getTime() === input.observedAt.getTime() &&
    existing.windowStart.getTime() === input.windowStart.getTime() &&
    existing.windowEnd.getTime() === input.windowEnd.getTime() &&
    existing.sourceRef === input.sourceRef &&
    JSON.stringify(existing.baseline) === JSON.stringify(input.baseline) &&
    JSON.stringify(canonicalConfounders(storedConfounders.data.items)) ===
      JSON.stringify(canonicalConfounders(input.confounders)) &&
    existing.holdoutGroup === input.holdoutGroup &&
    existing.verified === input.verified &&
    JSON.stringify(canonicalStrings(existing.evidenceRefs)) ===
      JSON.stringify(canonicalStrings(input.evidenceRefs))
  );
}

/**
 * Append an idempotent outcome only after every referenced durable entity is
 * proven to belong to the supplied tenant scope.
 */
async function appendOutcomeAttribution(scope: BrandScope, raw: unknown) {
  const input = outcomeAttributionInputSchema.parse(raw);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [action] = await tx
      .select({
        id: agentActionLedger.id,
        verificationStatus: agentActionLedger.verificationStatus,
      })
      .from(agentActionLedger)
      .where(
        and(
          eq(agentActionLedger.id, input.actionId),
          eq(agentActionLedger.workspaceId, scope.workspaceId),
          eq(agentActionLedger.brandId, scope.brandId),
        ),
      )
      .limit(1);
    if (!action) throw new Error("Outcome attribution action is outside the tenant scope");
    if (input.verified && action.verificationStatus !== "verified") {
      throw new Error("Verified outcome attribution requires a verified action");
    }

    if (input.contentId) {
      const [content] = await tx
        .select({ id: articles.id })
        .from(articles)
        .where(
          and(
            eq(articles.id, input.contentId),
            eq(articles.workspaceId, scope.workspaceId),
            eq(articles.brandId, scope.brandId),
          ),
        )
        .limit(1);
      if (!content) throw new Error("Outcome attribution content is outside the tenant scope");
    }

    if (input.objectiveId) {
      const [objective] = await tx
        .select({ id: agentMissions.id })
        .from(agentMissions)
        .where(
          and(
            eq(agentMissions.id, input.objectiveId),
            eq(agentMissions.workspaceId, scope.workspaceId),
            eq(agentMissions.brandId, scope.brandId),
          ),
        )
        .limit(1);
      if (!objective) throw new Error("Outcome attribution objective is outside the tenant scope");
    }

    const [created] = await tx
      .insert(agentOutcomeAttributions)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        attributionKey: input.attributionKey,
        actionId: input.actionId,
        contentId: input.contentId,
        queryKey: input.queryKey,
        objectiveId: input.objectiveId,
        outcomeKind: input.outcomeKind,
        outcomeValue: input.outcomeValue,
        observedAt: input.observedAt,
        baseline: input.baseline,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        confounders: { version: "claudia-confounders-v1", items: input.confounders },
        holdoutGroup: input.holdoutGroup,
        verified: input.verified,
        evidenceRefs: input.evidenceRefs,
        sourceRef: input.sourceRef,
      })
      .onConflictDoNothing({
        target: [agentOutcomeAttributions.brandId, agentOutcomeAttributions.attributionKey],
      })
      .returning();
    if (created) return created;

    const [existing] = await tx
      .select()
      .from(agentOutcomeAttributions)
      .where(
        and(
          eq(agentOutcomeAttributions.workspaceId, scope.workspaceId),
          eq(agentOutcomeAttributions.brandId, scope.brandId),
          eq(agentOutcomeAttributions.attributionKey, input.attributionKey),
        ),
      )
      .limit(1);
    if (!existing || !sameAttribution(existing, input)) {
      throw new Error("Outcome attribution key was reused with different lineage");
    }
    return existing;
  });
}

export type PerformanceCheckpointAttributionResult =
  | {
      status: "recorded";
      attribution: typeof agentOutcomeAttributions.$inferSelect;
    }
  | {
      status: "skipped";
      reason:
        | "metrics_unavailable"
        | "no_prior_baseline"
        | "no_verified_publication_action";
    };

/**
 * Convert one durable article checkpoint into verified learning evidence.
 * The checkpoint id is the only caller-selected fact; lineage, metrics,
 * chronology, verification, and objective attribution are all resolved from
 * tenant-scoped database rows.
 */
export async function recordPerformanceCheckpointAttribution(
  scope: BrandScope,
  checkpointId: string,
  now = new Date(),
): Promise<PerformanceCheckpointAttributionResult> {
  checkpointId = z.string().uuid().parse(checkpointId);
  if (!Number.isFinite(now.getTime())) throw new Error("Attribution clock is invalid");

  const db = getDb();
  const [checkpoint] = await db
    .select({
      id: performanceCheckpoints.id,
      articleId: performanceCheckpoints.articleId,
      day: performanceCheckpoints.day,
      impressions: performanceCheckpoints.impressions,
      createdAt: performanceCheckpoints.createdAt,
    })
    .from(performanceCheckpoints)
    .innerJoin(
      articles,
      and(
        eq(articles.id, performanceCheckpoints.articleId),
        eq(articles.workspaceId, scope.workspaceId),
        eq(articles.brandId, scope.brandId),
      ),
    )
    .where(
      and(
        eq(performanceCheckpoints.id, checkpointId),
        eq(performanceCheckpoints.workspaceId, scope.workspaceId),
        eq(performanceCheckpoints.brandId, scope.brandId),
      ),
    )
    .limit(1);
  if (!checkpoint) {
    throw new Error("Performance checkpoint is outside the tenant scope");
  }
  if (checkpoint.createdAt > now) {
    throw new Error("Performance checkpoint is in the future");
  }
  if (checkpoint.impressions === null) {
    return { status: "skipped", reason: "metrics_unavailable" };
  }

  const [prior] = await db
    .select({
      id: performanceCheckpoints.id,
      impressions: performanceCheckpoints.impressions,
      createdAt: performanceCheckpoints.createdAt,
    })
    .from(performanceCheckpoints)
    .where(
      and(
        eq(performanceCheckpoints.workspaceId, scope.workspaceId),
        eq(performanceCheckpoints.brandId, scope.brandId),
        eq(performanceCheckpoints.articleId, checkpoint.articleId),
        lt(performanceCheckpoints.day, checkpoint.day),
        lt(performanceCheckpoints.createdAt, checkpoint.createdAt),
      ),
    )
    .orderBy(desc(performanceCheckpoints.day), desc(performanceCheckpoints.createdAt))
    .limit(1);
  if (!prior || prior.impressions === null) {
    return { status: "skipped", reason: "no_prior_baseline" };
  }

  const publicationActionTypes = ["publish article", "update article"] as const;
  const [publicationAction] = await db
    .select({
      id: agentActionLedger.id,
      verifiedAt: agentActionLedger.verifiedAt,
      createdAt: agentActionLedger.createdAt,
    })
    .from(agentActionLedger)
    .where(
      and(
        eq(agentActionLedger.workspaceId, scope.workspaceId),
        eq(agentActionLedger.brandId, scope.brandId),
        inArray(agentActionLedger.actionType, publicationActionTypes),
        eq(agentActionLedger.verificationStatus, "verified"),
        sql`${agentActionLedger.verifiedAt} is not null`,
        lte(agentActionLedger.verifiedAt, checkpoint.createdAt),
        sql`${agentActionLedger.resourceRef} like ${`%:article:${checkpoint.articleId}`}`,
      ),
    )
    .orderBy(desc(agentActionLedger.verifiedAt), desc(agentActionLedger.createdAt))
    .limit(1);
  if (!publicationAction?.verifiedAt) {
    return { status: "skipped", reason: "no_verified_publication_action" };
  }
  if (publicationAction.verifiedAt >= checkpoint.createdAt) {
    throw new Error("Performance outcome does not postdate its verified action");
  }

  const competingActions = await db
    .select({ id: agentActionLedger.id })
    .from(agentActionLedger)
    .where(
      and(
        eq(agentActionLedger.workspaceId, scope.workspaceId),
        eq(agentActionLedger.brandId, scope.brandId),
        inArray(agentActionLedger.actionType, publicationActionTypes),
        eq(agentActionLedger.verificationStatus, "verified"),
        sql`${agentActionLedger.verifiedAt} is not null`,
        sql`${agentActionLedger.verifiedAt} > ${prior.createdAt}`,
        lt(agentActionLedger.verifiedAt, checkpoint.createdAt),
        sql`${agentActionLedger.resourceRef} like ${`%:article:${checkpoint.articleId}`}`,
      ),
    )
    .limit(2);

  const windowStart =
    publicationAction.verifiedAt > prior.createdAt
      ? publicationAction.verifiedAt
      : prior.createdAt;
  const sourceRef = `performance_checkpoint:${checkpoint.id}`;
  const baselineRef = `performance_checkpoint:${prior.id}`;
  const actionRef = `agent_action:${publicationAction.id}`;
  const competingActionRefs = competingActions
    .filter((action) => action.id !== publicationAction.id)
    .map((action) => `agent_action:${action.id}`);
  const attribution = await appendOutcomeAttribution(scope, {
    attributionKey: `${sourceRef}:organic_impressions:v1`,
    actionId: publicationAction.id,
    contentId: checkpoint.articleId,
    queryKey: null,
    // No persisted mission metric exactly matches organic impressions. Do not
    // mislabel this proxy as qualified traffic.
    objectiveId: null,
    attributionLevel: "page",
    outcomeKind: "organic_impressions",
    outcomeValue: checkpoint.impressions,
    observedAt: checkpoint.createdAt,
    baseline: {
      value: prior.impressions,
      observedAt: prior.createdAt.toISOString(),
    },
    windowStart,
    windowEnd: checkpoint.createdAt,
    confounders: competingActionRefs.map((evidenceRef) => ({
      kind: "competing_action" as const,
      severity: "medium" as const,
      evidenceRef,
    })),
    holdoutGroup: null,
    verified: true,
    evidenceRefs: [sourceRef, baselineRef, actionRef, ...competingActionRefs],
    sourceRef,
  });
  return { status: "recorded", attribution };
}

export type LearningObservation = {
  id?: string;
  actionId: string;
  attributionLevel: AttributionLevel;
  outcomeValue: number;
  baselineValue: number | null;
  verified: boolean;
  confounders: z.infer<typeof confounderSchema>[];
  holdoutGroup: string | null;
  evidenceRefs: string[];
};

export type StrategyLearningInput = {
  actionFamily: string;
  strategyKey: string;
  outcomeKind: string;
  direction: "increase" | "decrease";
  attributionLevel: AttributionLevel;
  currentWeight: number;
  observations: readonly LearningObservation[];
  minSamples?: number;
  minDistinctActions?: number;
  minConfidence?: number;
  minimumMaterialEffect?: number;
};

export type StrategyLearningResult = {
  evaluatorVersion: typeof LEARNING_EVALUATOR_VERSION;
  actionFamily: string;
  strategyKey: string;
  outcomeKind: string;
  direction: "increase" | "decrease";
  attributionLevel: AttributionLevel;
  status:
    | "eligible"
    | "insufficient_evidence"
    | "blocked_by_confounders"
    | "invalid_holdout"
    | "no_material_effect";
  productionChange: boolean;
  priorWeight: number;
  candidateWeight: number;
  sampleSize: number;
  distinctActions: number;
  confidence: number;
  normalizedEffect: number;
  experimentalDesign: "holdout" | "observational";
  excluded: { unverified: number; missingBaseline: number; levelMismatch: number; confounded: number };
  evidenceIds: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function assignment(holdoutGroup: string | null) {
  if (!holdoutGroup) return { arm: "unassigned" as const, experiment: null };
  const separator = holdoutGroup.indexOf(":");
  const arm = holdoutGroup.slice(0, separator);
  return {
    arm: arm === "holdout" ? ("holdout" as const) : ("treatment" as const),
    experiment: holdoutGroup.slice(separator + 1),
  };
}

function confounderWeight(items: LearningObservation["confounders"]) {
  if (items.some((item) => item.severity === "high")) return 0;
  if (items.some((item) => item.severity === "medium")) return 0.5;
  if (items.some((item) => item.severity === "low")) return 0.8;
  return 1;
}

function weightedMean(rows: Array<{ effect: number; quality: number }>) {
  const total = rows.reduce((sum, row) => sum + row.quality, 0);
  if (total === 0) return 0;
  return rows.reduce((sum, row) => sum + row.effect * row.quality, 0) / total;
}

/**
 * Produce a conservative, bounded strategy candidate. No result below the
 * sample/confidence gates is eligible to change production behavior.
 */
export function evaluateStrategyLearning(input: StrategyLearningInput): StrategyLearningResult {
  const minSamples = Math.max(MIN_PRODUCTION_SAMPLES, input.minSamples ?? MIN_PRODUCTION_SAMPLES);
  const minDistinctActions = Math.max(
    MIN_DISTINCT_ACTIONS,
    input.minDistinctActions ?? MIN_DISTINCT_ACTIONS,
  );
  const minConfidence = Math.max(
    MIN_PRODUCTION_CONFIDENCE,
    input.minConfidence ?? MIN_PRODUCTION_CONFIDENCE,
  );
  const minimumMaterialEffect = clamp(input.minimumMaterialEffect ?? 0.02, 0, 1);
  const priorWeight = clamp(
    Number.isFinite(input.currentWeight) ? input.currentWeight : 1,
    PRODUCTION_WEIGHT_BOUNDS.min,
    PRODUCTION_WEIGHT_BOUNDS.max,
  );
  const excluded = { unverified: 0, missingBaseline: 0, levelMismatch: 0, confounded: 0 };
  const usable: Array<LearningObservation & { effect: number; quality: number }> = [];

  for (const observation of input.observations) {
    if (observation.attributionLevel !== input.attributionLevel) {
      excluded.levelMismatch += 1;
      continue;
    }
    if (!observation.verified || observation.evidenceRefs.length === 0) {
      excluded.unverified += 1;
      continue;
    }
    if (observation.baselineValue === null || !Number.isFinite(observation.baselineValue)) {
      excluded.missingBaseline += 1;
      continue;
    }
    const quality = confounderWeight(observation.confounders);
    if (quality === 0) {
      excluded.confounded += 1;
      continue;
    }
    const rawDelta =
      (observation.outcomeValue - observation.baselineValue) /
      Math.max(1, Math.abs(observation.baselineValue));
    const effect = clamp(input.direction === "increase" ? rawDelta : -rawDelta, -1, 1);
    usable.push({ ...observation, effect, quality });
  }

  const experiments = new Map<string, { treatment: typeof usable; holdout: typeof usable }>();
  for (const row of usable) {
    const parsed = assignment(row.holdoutGroup);
    if (!parsed.experiment) continue;
    const group = experiments.get(parsed.experiment) ?? { treatment: [], holdout: [] };
    group[parsed.arm].push(row);
    experiments.set(parsed.experiment, group);
  }
  const hasAssignedRows = usable.some((row) => assignment(row.holdoutGroup).experiment !== null);
  const completeExperiments = [...experiments.values()].filter(
    (experiment) => experiment.treatment.length > 0 && experiment.holdout.length > 0,
  );
  const invalidHoldout = hasAssignedRows && completeExperiments.length !== experiments.size;
  const experimentalRows = completeExperiments.flatMap((experiment) => [
    ...experiment.treatment,
    ...experiment.holdout,
  ]);
  const evidenceRows = completeExperiments.length > 0 ? experimentalRows : usable;
  const distinctActions = new Set(evidenceRows.map((row) => row.actionId)).size;
  const sampleSize = evidenceRows.length;

  let normalizedEffect = 0;
  if (completeExperiments.length > 0) {
    const effects = completeExperiments.map(
      (experiment) =>
        weightedMean(experiment.treatment) - weightedMean(experiment.holdout),
    );
    normalizedEffect = effects.reduce((sum, effect) => sum + effect, 0) / effects.length;
  } else {
    normalizedEffect = weightedMean(usable);
  }
  normalizedEffect = clamp(normalizedEffect, -1, 1);

  const averageQuality =
    evidenceRows.length > 0
      ? evidenceRows.reduce((sum, row) => sum + row.quality, 0) / evidenceRows.length
      : 0;
  const sampleConfidence = Math.min(1, sampleSize / minSamples) * 70;
  const designBonus = completeExperiments.length > 0 ? 20 : 10;
  const confidence = Math.round(clamp(sampleConfidence + designBonus, 0, 100) * averageQuality);
  const candidateWeight = clamp(
    priorWeight * (1 + clamp(normalizedEffect, -0.25, 0.25) * 0.5),
    PRODUCTION_WEIGHT_BOUNDS.min,
    PRODUCTION_WEIGHT_BOUNDS.max,
  );

  let status: StrategyLearningResult["status"] = "eligible";
  if (invalidHoldout) status = "invalid_holdout";
  else if (usable.length === 0 && excluded.confounded > 0) status = "blocked_by_confounders";
  else if (
    sampleSize < minSamples ||
    distinctActions < minDistinctActions ||
    confidence < minConfidence
  ) {
    status = "insufficient_evidence";
  } else if (Math.abs(normalizedEffect) < minimumMaterialEffect) {
    status = "no_material_effect";
  }

  return {
    evaluatorVersion: LEARNING_EVALUATOR_VERSION,
    actionFamily: input.actionFamily,
    strategyKey: input.strategyKey,
    outcomeKind: input.outcomeKind,
    direction: input.direction,
    attributionLevel: input.attributionLevel,
    status,
    productionChange: status === "eligible",
    priorWeight,
    candidateWeight: status === "eligible" ? candidateWeight : priorWeight,
    sampleSize,
    distinctActions,
    confidence,
    normalizedEffect,
    experimentalDesign: completeExperiments.length > 0 ? "holdout" : "observational",
    excluded,
    evidenceIds: evidenceRows.flatMap((row) => (row.id ? [row.id] : [])),
  };
}

export type ControlledCandidate = {
  id: string;
  baseScore: number;
  /** Already-resolved scoring input. This helper never grants authority. */
  productionWeight?: number;
};

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
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

function evidenceDigest(material: unknown) {
  const serialized = JSON.stringify(stableValue(material));
  const secondary = stableHash(`secondary:${serialized}`);
  return `strategy-evidence-v1:${stableHash(serialized)
    .toString(16)
    .padStart(8, "0")}${secondary.toString(16).padStart(8, "0")}`;
}

function researchSourceTypeFromEvidence(evidenceJson: string | null) {
  if (!evidenceJson) return null;
  try {
    const parsed = JSON.parse(evidenceJson) as { sourceType?: unknown };
    const sourceType = researchSourceTypeSchema.safeParse(parsed.sourceType);
    return sourceType.success ? sourceType.data : null;
  } catch {
    return null;
  }
}

function researchStrategyKey(sourceType: ResearchSourceType) {
  return `source:${sourceType}`;
}

/** Deterministic ranking primitive. Authority and strategy resolution happen outside it. */
export function selectControlledCandidate(
  candidates: readonly ControlledCandidate[],
  options: { seed: string; explorationRate?: number; maximumAlternatives?: number },
) {
  const authorized = candidates
    .filter(
      (candidate) =>
        candidate.id.length > 0 &&
        Number.isFinite(candidate.baseScore),
    )
    .map((candidate) => {
      const productionWeight = Number.isFinite(candidate.productionWeight)
        ? clamp(
            candidate.productionWeight ?? 1,
            PRODUCTION_WEIGHT_BOUNDS.min,
            PRODUCTION_WEIGHT_BOUNDS.max,
          )
        : 1;
      return {
        ...candidate,
        productionWeight,
        learnedScore: candidate.baseScore * productionWeight,
      };
    })
    .sort(
      (left, right) =>
        right.learnedScore - left.learnedScore || left.id.localeCompare(right.id),
    );
  if (authorized.length === 0) return null;

  const explorationRate = clamp(options.explorationRate ?? 0.1, 0, 0.2);
  const percentile = stableHash(`${options.seed}:decision`) / 0x1_0000_0000;
  if (authorized.length === 1 || percentile >= explorationRate) {
    return { candidate: authorized[0], mode: "exploit" as const };
  }

  const alternatives = authorized.slice(
    1,
    1 + Math.max(1, Math.min(options.maximumAlternatives ?? 3, authorized.length - 1)),
  );
  const selected = alternatives[stableHash(`${options.seed}:alternative`) % alternatives.length];
  return { candidate: selected, mode: "explore" as const };
}

function parseStoredConfounders(value: Record<string, unknown>) {
  const parsed = storedConfoundersSchema.safeParse(value);
  return parsed.success
    ? parsed.data.items
    : [
        {
          kind: "data_gap" as const,
          severity: "high" as const,
          evidenceRef: "invalid:confounder-payload",
        },
      ];
}

const strategyScopeSchema = z
  .object({
    actionFamily: z.string().trim().min(1).max(120).regex(/^[a-z0-9][a-z0-9._:-]*$/i),
    strategyKey: z.string().trim().min(1).max(160).regex(/^[a-z0-9][a-z0-9._:-]*$/i),
  })
  .strict();

function learningLockKey(scope: BrandScope, actionFamily: string, strategyKey: string) {
  return `claudia-learning:${scope.workspaceId}:${scope.brandId}:${actionFamily}:${strategyKey}`;
}

async function lockStrategy(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  scope: BrandScope,
  actionFamily: string,
  strategyKey: string,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${learningLockKey(scope, actionFamily, strategyKey)}))`,
  );
}

export async function getActiveStrategyWeight(
  scope: BrandScope,
  actionFamily: string,
  strategyKey: string,
) {
  ({ actionFamily, strategyKey } = strategyScopeSchema.parse({ actionFamily, strategyKey }));
  const [active] = await getDb()
    .select()
    .from(agentStrategyWeightVersions)
    .where(
      and(
        eq(agentStrategyWeightVersions.workspaceId, scope.workspaceId),
        eq(agentStrategyWeightVersions.brandId, scope.brandId),
        eq(agentStrategyWeightVersions.actionFamily, actionFamily),
        eq(agentStrategyWeightVersions.strategyKey, strategyKey),
        eq(agentStrategyWeightVersions.status, "active"),
      ),
    )
    .limit(1);
  return active ?? null;
}

/** Only threshold-qualified, tenant-scoped research weights can reach production scoring. */
export async function getActiveResearchSourceWeights(
  scope: BrandScope,
): Promise<Partial<Record<ResearchSourceType, number>>> {
  try {
    const rows = await getDb()
      .select({
        strategyKey: agentStrategyWeightVersions.strategyKey,
        weight: agentStrategyWeightVersions.weight,
        version: agentStrategyWeightVersions.version,
        sampleSize: agentStrategyWeightVersions.sampleSize,
        confidence: agentStrategyWeightVersions.confidence,
        evidenceSnapshot: agentStrategyWeightVersions.evidenceSnapshot,
      })
      .from(agentStrategyWeightVersions)
      .where(
        and(
          eq(agentStrategyWeightVersions.workspaceId, scope.workspaceId),
          eq(agentStrategyWeightVersions.brandId, scope.brandId),
          eq(agentStrategyWeightVersions.actionFamily, RESEARCH_SOURCE_ACTION_FAMILY),
          eq(agentStrategyWeightVersions.status, "active"),
        ),
      );
    const weights: Partial<Record<ResearchSourceType, number>> = {};
    for (const row of rows) {
      const sourceType = researchSourceTypeSchema.safeParse(
        row.strategyKey.startsWith("source:") ? row.strategyKey.slice("source:".length) : null,
      );
      if (!sourceType.success) continue;
      const neutralBaseline =
        row.version === 1 &&
        row.sampleSize === 0 &&
        row.confidence === 0 &&
        row.evidenceSnapshot.kind === "neutral_baseline";
      if (
        !neutralBaseline &&
        (row.sampleSize < MIN_PRODUCTION_SAMPLES ||
          row.confidence < MIN_PRODUCTION_CONFIDENCE)
      ) {
        continue;
      }
      weights[sourceType.data] = clamp(
        row.weight,
        PRODUCTION_WEIGHT_BOUNDS.min,
        PRODUCTION_WEIGHT_BOUNDS.max,
      );
    }
    return weights;
  } catch (error) {
    console.error("[learning] active research source weights unavailable", error);
    return {};
  }
}

/**
 * Production selector: current safety state and active strategy versions are
 * resolved inside the service. Callers cannot supply policy receipts or weights.
 */
export async function selectProductionCandidate<
  T extends { id: string; baseScore: number; sourceType: ResearchSourceType },
>(
  scope: BrandScope,
  candidates: readonly T[],
  options: { seed: string; explorationRate?: number; maximumAlternatives?: number },
): Promise<{ candidate: T; mode: "exploit" | "explore"; productionWeight: number } | null> {
  const controls = await getAgentControlState(scope.brandId);
  const safety = getAgentSafetyDecision("drafting", { actor: "agent", controls });
  if (!safety.allowed) return null;

  const valid = candidates.filter(
    (candidate, index) =>
      candidate.id.length > 0 &&
      Number.isFinite(candidate.baseScore) &&
      researchSourceTypeSchema.safeParse(candidate.sourceType).success &&
      candidates.findIndex((item) => item.id === candidate.id) === index,
  ).slice(0, 50);
  if (valid.length === 0) return null;
  const weights = await getActiveResearchSourceWeights(scope);
  const selection = selectControlledCandidate(
    valid.map((candidate) => ({
      id: candidate.id,
      baseScore: candidate.baseScore,
      productionWeight: weights[candidate.sourceType] ?? 1,
    })),
    options,
  );
  if (!selection) return null;
  const candidate = valid.find((item) => item.id === selection.candidate.id);
  return candidate
    ? {
        candidate,
        mode: selection.mode,
        productionWeight: selection.candidate.productionWeight,
      }
    : null;
}

type StrategyProposalInput = {
  actionFamily: string;
  strategyKey: string;
  /** Exact server ledger action types belonging to this strategy family. */
  ledgerActionTypes: readonly string[];
  outcomeKind: string;
  direction: "increase" | "decrease";
  attributionLevel: AttributionLevel;
};

async function evaluateAndProposeStrategyWeightInternal(
  scope: BrandScope,
  input: StrategyProposalInput,
  options: {
    researchSourceType?: ResearchSourceType;
    now?: Date;
  },
) {
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("Learning clock is invalid");
  const strategyScope = strategyScopeSchema.parse({
    actionFamily: input.actionFamily,
    strategyKey: input.strategyKey,
  });
  const ledgerActionTypes = z
    .array(z.string().trim().min(1).max(120))
    .min(1)
    .max(16)
    .parse([...new Set(input.ledgerActionTypes)]);
  input = { ...input, ...strategyScope, ledgerActionTypes };
  const db = getDb();
  const rows = await db
    .select({
      id: agentOutcomeAttributions.id,
      actionId: agentOutcomeAttributions.actionId,
      contentId: agentOutcomeAttributions.contentId,
      queryKey: agentOutcomeAttributions.queryKey,
      outcomeValue: agentOutcomeAttributions.outcomeValue,
      observedAt: agentOutcomeAttributions.observedAt,
      windowStart: agentOutcomeAttributions.windowStart,
      baseline: agentOutcomeAttributions.baseline,
      verified: agentOutcomeAttributions.verified,
      confounders: agentOutcomeAttributions.confounders,
      holdoutGroup: agentOutcomeAttributions.holdoutGroup,
      evidenceRefs: agentOutcomeAttributions.evidenceRefs,
      actionVerifiedAt: agentActionLedger.verifiedAt,
      topicEvidenceJson: topics.evidenceJson,
    })
    .from(agentOutcomeAttributions)
    .innerJoin(agentActionLedger, eq(agentActionLedger.id, agentOutcomeAttributions.actionId))
    .leftJoin(
      articles,
      and(
        eq(articles.id, agentOutcomeAttributions.contentId),
        eq(articles.workspaceId, scope.workspaceId),
        eq(articles.brandId, scope.brandId),
      ),
    )
    .leftJoin(
      topics,
      and(
        eq(topics.id, articles.topicId),
        eq(topics.workspaceId, scope.workspaceId),
        eq(topics.brandId, scope.brandId),
      ),
    )
    .where(
      and(
        eq(agentOutcomeAttributions.workspaceId, scope.workspaceId),
        eq(agentOutcomeAttributions.brandId, scope.brandId),
        eq(agentOutcomeAttributions.outcomeKind, input.outcomeKind),
        eq(agentOutcomeAttributions.verified, true),
        lte(agentOutcomeAttributions.observedAt, now),
        eq(agentActionLedger.workspaceId, scope.workspaceId),
        eq(agentActionLedger.brandId, scope.brandId),
        eq(agentActionLedger.verificationStatus, "verified"),
        inArray(agentActionLedger.actionType, ledgerActionTypes),
        options.researchSourceType
          ? sql`${topics.evidenceJson} ~ ${`"sourceType"\\s*:\\s*"${options.researchSourceType}"`}`
          : undefined,
      ),
    )
    .orderBy(desc(agentOutcomeAttributions.observedAt))
    .limit(LEARNING_OBSERVATION_LIMIT);
  const observations = rows.flatMap((row): LearningObservation[] => {
    if (
      options.researchSourceType &&
      researchSourceTypeFromEvidence(row.topicEvidenceJson) !== options.researchSourceType
    ) {
      return [];
    }
    const baselineObservedAt = row.baseline?.observedAt
      ? new Date(row.baseline.observedAt)
      : null;
    const chronologyValid =
      row.actionVerifiedAt !== null &&
      row.actionVerifiedAt < row.observedAt &&
      baselineObservedAt !== null &&
      Number.isFinite(baselineObservedAt.getTime()) &&
      baselineObservedAt <= row.windowStart;
    return [{
      id: row.id,
      actionId: row.actionId,
      attributionLevel: attributionLevel(row.contentId, row.queryKey),
      outcomeValue: row.outcomeValue,
      baselineValue: row.baseline?.value ?? null,
      verified: row.verified && chronologyValid,
      confounders: parseStoredConfounders(row.confounders),
      holdoutGroup: row.holdoutGroup,
      evidenceRefs: row.evidenceRefs,
    }];
  });
  const result = evaluateStrategyLearning({
    ...input,
    // Each evidence snapshot is evaluated from the neutral baseline. Reusing
    // the same observations therefore cannot compound the current weight.
    currentWeight: 1,
    observations,
  });
  if (!result.productionChange) return { result, candidate: null };

  const includedEvidence = new Set(result.evidenceIds);
  const digest = evidenceDigest({
    evaluatorVersion: result.evaluatorVersion,
    actionFamily: input.actionFamily,
    strategyKey: input.strategyKey,
    outcomeKind: input.outcomeKind,
    direction: input.direction,
    attributionLevel: input.attributionLevel,
    observations: observations
      .filter((observation) => observation.id && includedEvidence.has(observation.id))
      .map((observation) => stableValue(observation))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  });

  const candidate = await db.transaction(async (tx) => {
    await lockStrategy(tx, scope, input.actionFamily, input.strategyKey);
    let [active] = await tx
      .select()
      .from(agentStrategyWeightVersions)
      .where(
        and(
          eq(agentStrategyWeightVersions.workspaceId, scope.workspaceId),
          eq(agentStrategyWeightVersions.brandId, scope.brandId),
          eq(agentStrategyWeightVersions.actionFamily, input.actionFamily),
          eq(agentStrategyWeightVersions.strategyKey, input.strategyKey),
          eq(agentStrategyWeightVersions.status, "active"),
        ),
      )
      .limit(1);

    const versions = await tx
      .select()
      .from(agentStrategyWeightVersions)
      .where(
        and(
          eq(agentStrategyWeightVersions.workspaceId, scope.workspaceId),
          eq(agentStrategyWeightVersions.brandId, scope.brandId),
          eq(agentStrategyWeightVersions.actionFamily, input.actionFamily),
          eq(agentStrategyWeightVersions.strategyKey, input.strategyKey),
        ),
      )
      .orderBy(desc(agentStrategyWeightVersions.version));
    const existing = versions.find(
      (version) => version.evidenceSnapshot.evidenceDigest === digest,
    );
    if (existing) return existing;

    if (!active) {
      if (versions.length > 0) {
        throw new Error("Strategy history has no active rollback baseline");
      }
      const [baseline] = await tx
        .insert(agentStrategyWeightVersions)
        .values({
          workspaceId: scope.workspaceId,
          brandId: scope.brandId,
          actionFamily: input.actionFamily,
          strategyKey: input.strategyKey,
          version: 1,
          weight: 1,
          priorVersionId: null,
          sampleSize: 0,
          confidence: 0,
          status: "active",
          evidenceSnapshot: {
            kind: "neutral_baseline",
            evaluatorVersion: LEARNING_EVALUATOR_VERSION,
          },
          activatedAt: now,
        })
        .returning();
      if (!baseline) throw new Error("Neutral strategy baseline could not be recorded");
      active = baseline;
    }

    if (Math.abs(active.weight - result.candidateWeight) < Number.EPSILON) {
      return active;
    }
    const [created] = await tx
      .insert(agentStrategyWeightVersions)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        actionFamily: input.actionFamily,
        strategyKey: input.strategyKey,
        version: Math.max(versions[0]?.version ?? 0, active.version) + 1,
        weight: result.candidateWeight,
        priorVersionId: active.id,
        sampleSize: result.sampleSize,
        confidence: result.confidence,
        status: "candidate",
        evidenceSnapshot: {
          ...result,
          evidenceIds: result.evidenceIds,
          evidenceDigest: digest,
          priorProductionWeight: active.weight,
          ledgerActionTypes,
          researchSourceType: options.researchSourceType ?? null,
        },
      })
      .returning();
    if (!created) throw new Error("Strategy weight candidate could not be recorded");
    return created;
  });
  return { result, candidate };
}

export async function evaluateAndProposeStrategyWeight(
  scope: BrandScope,
  input: StrategyProposalInput,
) {
  return evaluateAndProposeStrategyWeightInternal(scope, input, {});
}

/**
 * Bounded daily recovery and learning drain. It first repairs attribution for
 * recently durable checkpoints, then evaluates only fixed research-source
 * strategies and activates candidates that pass every production threshold.
 */
export async function refreshResearchSourceStrategyWeights(
  scope: BrandScope,
  now = new Date(),
) {
  if (!Number.isFinite(now.getTime())) throw new Error("Learning refresh clock is invalid");
  const db = getDb();
  const checkpoints = await db
    .select({ id: performanceCheckpoints.id })
    .from(performanceCheckpoints)
    .innerJoin(
      articles,
      and(
        eq(articles.id, performanceCheckpoints.articleId),
        eq(articles.workspaceId, scope.workspaceId),
        eq(articles.brandId, scope.brandId),
      ),
    )
    .where(
      and(
        eq(performanceCheckpoints.workspaceId, scope.workspaceId),
        eq(performanceCheckpoints.brandId, scope.brandId),
        lte(performanceCheckpoints.createdAt, now),
      ),
    )
    .orderBy(desc(performanceCheckpoints.createdAt))
    .limit(ATTRIBUTION_BACKFILL_LIMIT);

  const attribution = { recorded: 0, skipped: 0, failed: 0 };
  for (const checkpoint of checkpoints.toReversed()) {
    try {
      const result = await recordPerformanceCheckpointAttribution(scope, checkpoint.id, now);
      attribution[result.status] += 1;
    } catch (error) {
      attribution.failed += 1;
      console.error(
        `[learning] checkpoint attribution recovery failed for ${checkpoint.id}`,
        error,
      );
    }
  }

  let evaluated = 0;
  let activated = 0;
  let shadowCandidates = 0;
  for (const sourceType of RESEARCH_SOURCE_TYPES) {
    const proposal = await evaluateAndProposeStrategyWeightInternal(
      scope,
      {
        actionFamily: RESEARCH_SOURCE_ACTION_FAMILY,
        strategyKey: researchStrategyKey(sourceType),
        ledgerActionTypes: ["publish article", "update article"],
        outcomeKind: RESEARCH_OUTCOME_KIND,
        direction: "increase",
        attributionLevel: "page",
      },
      { researchSourceType: sourceType, now },
    );
    evaluated += 1;
    if (proposal.candidate?.status === "candidate") {
      if (proposal.result.experimentalDesign === "holdout") {
        const active = await activateStrategyWeight(scope, proposal.candidate.id);
        if (active) activated += 1;
      } else {
        // Observational checkpoints can propose a shadow version, but cannot
        // self-activate without seasonality/site-wide controls or a holdout.
        shadowCandidates += 1;
      }
    }
  }
  return { attribution, evaluated, activated, shadowCandidates };
}

export async function activateStrategyWeight(scope: BrandScope, candidateId: string) {
  return getDb().transaction(async (tx) => {
    const [candidate] = await tx
      .select()
      .from(agentStrategyWeightVersions)
      .where(
        and(
          eq(agentStrategyWeightVersions.id, candidateId),
          eq(agentStrategyWeightVersions.workspaceId, scope.workspaceId),
          eq(agentStrategyWeightVersions.brandId, scope.brandId),
          eq(agentStrategyWeightVersions.status, "candidate"),
        ),
      )
      .limit(1);
    if (!candidate) return null;
    if (
      candidate.sampleSize < MIN_PRODUCTION_SAMPLES ||
      candidate.confidence < MIN_PRODUCTION_CONFIDENCE ||
      candidate.weight < PRODUCTION_WEIGHT_BOUNDS.min ||
      candidate.weight > PRODUCTION_WEIGHT_BOUNDS.max
    ) {
      throw new Error("Strategy candidate does not meet production activation gates");
    }
    await lockStrategy(tx, scope, candidate.actionFamily, candidate.strategyKey);
    const [active] = await tx
      .select()
      .from(agentStrategyWeightVersions)
      .where(
        and(
          eq(agentStrategyWeightVersions.workspaceId, scope.workspaceId),
          eq(agentStrategyWeightVersions.brandId, scope.brandId),
          eq(agentStrategyWeightVersions.actionFamily, candidate.actionFamily),
          eq(agentStrategyWeightVersions.strategyKey, candidate.strategyKey),
          eq(agentStrategyWeightVersions.status, "active"),
        ),
      )
      .limit(1);
    if ((active?.id ?? null) !== candidate.priorVersionId) {
      throw new Error("Strategy candidate is stale relative to the active version");
    }
    const now = new Date();
    if (active) {
      await tx
        .update(agentStrategyWeightVersions)
        .set({ status: "rolled_back", rolledBackAt: now })
        .where(
          and(
            eq(agentStrategyWeightVersions.id, active.id),
            eq(agentStrategyWeightVersions.status, "active"),
          ),
        );
    }
    const [activated] = await tx
      .update(agentStrategyWeightVersions)
      .set({ status: "active", activatedAt: now, rolledBackAt: null })
      .where(
        and(
          eq(agentStrategyWeightVersions.id, candidate.id),
          eq(agentStrategyWeightVersions.status, "candidate"),
        ),
      )
      .returning();
    if (!activated) throw new Error("Strategy candidate activation lost its compare-and-swap");
    return activated;
  });
}

export async function rollbackActiveStrategyWeight(
  scope: BrandScope,
  actionFamily: string,
  strategyKey: string,
) {
  ({ actionFamily, strategyKey } = strategyScopeSchema.parse({ actionFamily, strategyKey }));
  return getDb().transaction(async (tx) => {
    await lockStrategy(tx, scope, actionFamily, strategyKey);
    const [active] = await tx
      .select()
      .from(agentStrategyWeightVersions)
      .where(
        and(
          eq(agentStrategyWeightVersions.workspaceId, scope.workspaceId),
          eq(agentStrategyWeightVersions.brandId, scope.brandId),
          eq(agentStrategyWeightVersions.actionFamily, actionFamily),
          eq(agentStrategyWeightVersions.strategyKey, strategyKey),
          eq(agentStrategyWeightVersions.status, "active"),
        ),
      )
      .limit(1);
    if (!active?.priorVersionId) return null;
    const [prior] = await tx
      .select()
      .from(agentStrategyWeightVersions)
      .where(
        and(
          eq(agentStrategyWeightVersions.id, active.priorVersionId),
          eq(agentStrategyWeightVersions.workspaceId, scope.workspaceId),
          eq(agentStrategyWeightVersions.brandId, scope.brandId),
          eq(agentStrategyWeightVersions.actionFamily, actionFamily),
          eq(agentStrategyWeightVersions.strategyKey, strategyKey),
          eq(agentStrategyWeightVersions.status, "rolled_back"),
        ),
      )
      .limit(1);
    if (!prior) throw new Error("Prior strategy version is unavailable for rollback");
    const now = new Date();
    await tx
      .update(agentStrategyWeightVersions)
      .set({ status: "rolled_back", rolledBackAt: now })
      .where(
        and(
          eq(agentStrategyWeightVersions.id, active.id),
          eq(agentStrategyWeightVersions.status, "active"),
        ),
      );
    const [restored] = await tx
      .update(agentStrategyWeightVersions)
      .set({ status: "active", rolledBackAt: null })
      .where(
        and(
          eq(agentStrategyWeightVersions.id, prior.id),
          eq(agentStrategyWeightVersions.status, "rolled_back"),
        ),
      )
      .returning();
    if (!restored) throw new Error("Prior strategy version could not be restored");
    return { rolledBack: active, restored };
  });
}
