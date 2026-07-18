import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import {
  agentAutonomyExercises,
  agentAutonomyRollouts,
  agentAutonomyRolloutEvents,
  agentBehaviorReleases,
  agentCanaryMeasurements,
} from "@/lib/db/schema";
import { listOperationalIncidents } from "@/lib/observability/slos";

export const canarySummarySchema = z
  .object({
    metric: z.string().min(1),
    metricClass: z.enum(["agent_correctness", "business_effect"]),
    design: z.enum([
      "holdout",
      "staggered_rollout",
      "matched_cohort",
      "time_series_control",
    ]),
    direction: z.enum(["higher", "lower"]),
    treatment: z
      .object({
        n: z.number().int().nonnegative(),
        mean: z.number().finite(),
        variance: z.number().finite().nonnegative(),
      })
      .strict(),
    control: z
      .object({
        n: z.number().int().nonnegative(),
        mean: z.number().finite(),
        variance: z.number().finite().nonnegative(),
      })
      .strict(),
    minimumSampleSize: z.number().int().positive(),
    minimumImprovement: z.number().finite().nonnegative(),
    nonInferiorityMargin: z.number().finite().nonnegative(),
    harmThreshold: z.number().finite().nonnegative(),
    confidenceLevel: z.union([z.literal(0.9), z.literal(0.95), z.literal(0.99)]),
  })
  .strict();

export type CanaryConclusion =
  | "insufficient_data"
  | "non_inferior"
  | "improved"
  | "regressed"
  | "harm_detected";

const Z_CRITICAL = { 0.9: 1.644854, 0.95: 1.959964, 0.99: 2.575829 } as const;

function erf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const approximation =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
      t) *
      Math.exp(-x * x);
  return sign * approximation;
}

function normalCdf(value: number) {
  return (1 + erf(value / Math.sqrt(2))) / 2;
}

/** Transparent normal-approximation comparison over versioned summary data. */
export function assessCanarySummary(rawInput: unknown) {
  const input = canarySummarySchema.parse(rawInput);
  const direction = input.direction === "higher" ? 1 : -1;
  const rawEffect = input.treatment.mean - input.control.mean;
  const effect = direction * rawEffect;
  const enoughData =
    input.treatment.n >= input.minimumSampleSize &&
    input.control.n >= input.minimumSampleSize;
  const standardError = Math.sqrt(
    (input.treatment.n > 0 ? input.treatment.variance / input.treatment.n : 0) +
      (input.control.n > 0 ? input.control.variance / input.control.n : 0),
  );
  const zCritical = Z_CRITICAL[input.confidenceLevel];
  const intervalLow = effect - zCritical * standardError;
  const intervalHigh = effect + zCritical * standardError;
  const zScore = standardError > 0 ? effect / standardError : effect === 0 ? 0 : Infinity;
  const pValue = Math.max(0, Math.min(1, 2 * (1 - normalCdf(Math.abs(zScore)))));

  let conclusion: CanaryConclusion = "insufficient_data";
  if (enoughData) {
    if (intervalHigh < -input.harmThreshold) conclusion = "harm_detected";
    else if (intervalHigh < -input.nonInferiorityMargin) conclusion = "regressed";
    else if (intervalLow > input.minimumImprovement) conclusion = "improved";
    else if (intervalLow >= -input.nonInferiorityMargin) conclusion = "non_inferior";
  }
  return {
    ...input,
    effect,
    intervalLow,
    intervalHigh,
    pValue,
    conclusion,
    causalClaim: enoughData,
  };
}

export async function recordCanaryMeasurement(
  scope: BrandScope,
  input: {
    rolloutId: string;
    datasetVersion: string;
    graderVersion: string;
    windowStartsAt: Date;
    windowEndsAt: Date;
    evidenceRefs: string[];
    summary: z.input<typeof canarySummarySchema>;
  },
) {
  const assessed = assessCanarySummary(input.summary);
  const [rollout] = await getDb()
    .select({ id: agentAutonomyRollouts.id })
    .from(agentAutonomyRollouts)
    .where(
      and(
        eq(agentAutonomyRollouts.id, input.rolloutId),
        eq(agentAutonomyRollouts.workspaceId, scope.workspaceId),
        eq(agentAutonomyRollouts.brandId, scope.brandId),
      ),
    )
    .limit(1);
  if (!rollout) throw new Error("Autonomy rollout not found");
  const [measurement] = await getDb()
    .insert(agentCanaryMeasurements)
    .values({
      rolloutId: rollout.id,
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      metric: assessed.metric,
      metricClass: assessed.metricClass,
      design: assessed.design,
      datasetVersion: input.datasetVersion,
      graderVersion: input.graderVersion,
      windowStartsAt: input.windowStartsAt,
      windowEndsAt: input.windowEndsAt,
      treatmentN: assessed.treatment.n,
      controlN: assessed.control.n,
      treatmentMean: assessed.treatment.mean,
      controlMean: assessed.control.mean,
      effect: assessed.effect,
      confidenceLevel: assessed.confidenceLevel,
      intervalLow: assessed.intervalLow,
      intervalHigh: assessed.intervalHigh,
      pValue: assessed.pValue,
      conclusion: assessed.conclusion,
      causalClaim: assessed.causalClaim,
      evidenceRefs: input.evidenceRefs,
    })
    .onConflictDoUpdate({
      target: [
        agentCanaryMeasurements.rolloutId,
        agentCanaryMeasurements.metric,
        agentCanaryMeasurements.windowStartsAt,
        agentCanaryMeasurements.windowEndsAt,
      ],
      set: {
        datasetVersion: input.datasetVersion,
        graderVersion: input.graderVersion,
        treatmentN: assessed.treatment.n,
        controlN: assessed.control.n,
        treatmentMean: assessed.treatment.mean,
        controlMean: assessed.control.mean,
        effect: assessed.effect,
        confidenceLevel: assessed.confidenceLevel,
        intervalLow: assessed.intervalLow,
        intervalHigh: assessed.intervalHigh,
        pValue: assessed.pValue,
        conclusion: assessed.conclusion,
        causalClaim: assessed.causalClaim,
        evidenceRefs: input.evidenceRefs,
        recordedAt: new Date(),
      },
    })
    .returning();
  if (!measurement) throw new Error("Canary measurement could not be recorded");
  if (["regressed", "harm_detected"].includes(measurement.conclusion)) {
    await getDb().transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(agentAutonomyRollouts)
        .where(
          and(
            eq(agentAutonomyRollouts.id, rollout.id),
            eq(agentAutonomyRollouts.workspaceId, scope.workspaceId),
            eq(agentAutonomyRollouts.brandId, scope.brandId),
            eq(agentAutonomyRollouts.status, "active"),
          ),
        )
        .for("update")
        .limit(1);
      if (!current) return;
      const reason = `Canary metric ${measurement.metric} concluded ${measurement.conclusion}.`;
      const [paused] = await tx
        .update(agentAutonomyRollouts)
        .set({
          status: "paused",
          revision: current.revision + 1,
          pausedAt: new Date(),
          pauseReason: reason,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(agentAutonomyRollouts.id, current.id),
            eq(agentAutonomyRollouts.revision, current.revision),
          ),
        )
        .returning();
      if (!paused) return;
      await tx.insert(agentAutonomyRolloutEvents).values({
        rolloutId: current.id,
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        eventType: "paused",
        fromStatus: current.status,
        toStatus: paused.status,
        fromStage: current.rolloutStage,
        toStage: paused.rolloutStage,
        fromLevel: current.autonomyLevel,
        toLevel: paused.autonomyLevel,
        fromCohortPercent: current.cohortPercent,
        toCohortPercent: paused.cohortPercent,
        reason,
        evidenceRefs: [`canary-measurement:${measurement.id}`],
        owner: "agent-platform-oncall",
      });
    });
  }
  return measurement;
}

/** Read-only promotion evidence. It never expands authority itself. */
export async function getAutonomyReadiness(
  scope: BrandScope,
  rolloutId: string,
) {
  const [rollout] = await getDb()
    .select()
    .from(agentAutonomyRollouts)
    .where(
      and(
        eq(agentAutonomyRollouts.id, rolloutId),
        eq(agentAutonomyRollouts.workspaceId, scope.workspaceId),
        eq(agentAutonomyRollouts.brandId, scope.brandId),
      ),
    )
    .limit(1);
  if (!rollout) return null;
  const [release, measurements, exercises, incidents] = await Promise.all([
    rollout.releaseId
      ? getDb().query.agentBehaviorReleases.findFirst({
          where: eq(agentBehaviorReleases.id, rollout.releaseId),
        })
      : null,
    getDb()
      .select()
      .from(agentCanaryMeasurements)
      .where(eq(agentCanaryMeasurements.rolloutId, rollout.id)),
    getDb()
      .select()
      .from(agentAutonomyExercises)
      .where(eq(agentAutonomyExercises.rolloutId, rollout.id)),
    listOperationalIncidents({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      includeGlobal: true,
    }),
  ]);

  const blockers: string[] = [];
  if (!release || !["canary", "released"].includes(release.status)) {
    blockers.push("Behavior release is not in canary or released state.");
  }
  if (incidents.some((incident) => ["high", "critical"].includes(incident.severity))) {
    blockers.push("High or critical operational incidents remain active.");
  }
  if (measurements.some((item) => ["regressed", "harm_detected"].includes(item.conclusion))) {
    blockers.push("A canary metric regressed or detected harm.");
  }
  if (measurements.some((item) => item.conclusion === "insufficient_data")) {
    blockers.push("A canary metric has insufficient data.");
  }
  if (!measurements.some((item) => item.metricClass === "agent_correctness")) {
    blockers.push("Agent-correctness comparison evidence is missing.");
  }
  const business = measurements.filter((item) => item.metricClass === "business_effect");
  if (business.length === 0) {
    blockers.push("Business-effect comparison evidence is missing.");
  } else {
    if (business.some((item) => !item.causalClaim)) {
      blockers.push("Business-effect evidence lacks a supported control design.");
    }
    if (!business.some((item) => item.conclusion === "improved")) {
      blockers.push("No business metric shows statistically credible improvement.");
    }
  }

  const passedProductionLikeKinds = new Set(
    exercises
      .filter(
        (exercise) =>
          exercise.status === "passed" &&
          ["production_like", "production"].includes(exercise.environment),
      )
      .map((exercise) => exercise.kind),
  );
  for (const kind of ["emergency_stop", "incident_reconstruction", "rollback"] as const) {
    if (!passedProductionLikeKinds.has(kind)) {
      blockers.push(`A passed production-like ${kind} exercise is missing.`);
    }
  }
  if (rollout.autonomyLevel === 4) {
    if (!rollout.certificationId || !rollout.strategyRef || !rollout.releaseId) {
      blockers.push("Level 4 certification, strategy, or release evidence is missing.");
    }
    if (![7, 8].includes(rollout.rolloutStage)) {
      blockers.push("Level 4 requires percentage canary or certified GA stage.");
    }
  }
  return {
    rollout,
    ready: blockers.length === 0,
    blockers,
    evidence: {
      releaseStatus: release?.status ?? null,
      measurementCount: measurements.length,
      exerciseCount: exercises.length,
      activeIncidentCount: incidents.length,
    },
  };
}
