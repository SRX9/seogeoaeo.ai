import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { policyCapabilitySchema } from "@/lib/agent/policy-model";
import { buildObjectiveReplanMarker } from "@/lib/agent/objective-replan";
import type {
  AgentMissionView,
  AgentObjectiveCapability,
  AgentObjectiveMetricId,
  AgentObjectiveProgress,
} from "@/lib/agent/types";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import { agentEvents, agentMissions, agentScheduledWork, brands } from "@/lib/db/schema";

const MAX_HORIZON_MS = 5 * 366 * 24 * 60 * 60 * 1_000;

export const OBJECTIVE_METRICS = {
  ai_answer_share_percent: {
    label: "Eligible AI answer share",
    unit: "percent",
    direction: "increase",
  },
  qualified_non_brand_clicks: {
    label: "Qualified non-brand clicks",
    unit: "clicks",
    direction: "increase",
  },
  critical_crawler_findings: {
    label: "Open critical crawler findings",
    unit: "findings",
    direction: "decrease",
  },
  grounded_pages_published: {
    label: "Grounded pages published",
    unit: "pages",
    direction: "increase",
  },
} as const satisfies Record<
  AgentObjectiveMetricId,
  { label: string; unit: string; direction: "increase" | "decrease" }
>;

export const objectiveMetricSchema = z.enum([
  "ai_answer_share_percent",
  "qualified_non_brand_clicks",
  "critical_crawler_findings",
  "grounded_pages_published",
]);

export const objectiveBaselineSchema = z
  .object({
    value: z.number().finite(),
    observedAt: z.string().datetime({ offset: true }),
    sourceRefs: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
  })
  .strict();

export const objectiveTargetSchema = z
  .object({
    value: z.number().finite(),
  })
  .strict();

export const objectiveHorizonSchema = z
  .object({
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((horizon, context) => {
    const start = new Date(horizon.startAt).getTime();
    const end = new Date(horizon.endAt).getTime();
    if (end <= start) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "Horizon end must be after its start",
      });
    } else if (end - start > MAX_HORIZON_MS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "Horizon cannot exceed five years",
      });
    }
  });

export const objectiveBudgetSchema = z
  .object({
    maxCredits: z.number().finite().int().min(0).max(1_000_000),
    maxRemoteWrites: z.number().finite().int().min(0).max(10_000),
    maxCostCents: z.number().finite().int().min(0).max(100_000_000),
  })
  .strict();

const constraintsSchema = z
  .array(z.string().trim().min(1).max(500))
  .max(20)
  .refine(
    (constraints) =>
      new Set(constraints.map((constraint) => constraint.toLowerCase())).size ===
      constraints.length,
    "Constraints must be unique",
  );

const allowedCapabilitiesSchema = z
  .array(policyCapabilitySchema)
  .min(1)
  .max(20)
  .refine(
    (capabilities) => new Set(capabilities).size === capabilities.length,
    "Allowed capabilities must be unique",
  );

export const objectiveDefinitionSchema = z
  .object({
    objective: z.string().trim().min(3).max(1_000),
    metric: objectiveMetricSchema,
    baseline: objectiveBaselineSchema,
    target: objectiveTargetSchema,
    horizon: objectiveHorizonSchema,
    priority: z.number().int().min(0).max(100),
    budget: objectiveBudgetSchema,
    constraints: constraintsSchema,
    allowedCapabilities: allowedCapabilitiesSchema,
    successCondition: z.string().trim().min(3).max(2_000),
    stopCondition: z.string().trim().min(3).max(2_000),
  })
  .strict()
  .superRefine((definition, context) => {
    const metric = OBJECTIVE_METRICS[definition.metric];
    const baseline = definition.baseline.value;
    const target = definition.target.value;

    if (metric.direction === "increase" && target <= baseline) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target", "value"],
        message: "Target must be greater than baseline for an increasing metric",
      });
    }
    if (metric.direction === "decrease" && target >= baseline) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target", "value"],
        message: "Target must be less than baseline for a decreasing metric",
      });
    }

    const isPercent = definition.metric === "ai_answer_share_percent";
    if (isPercent && (baseline < 0 || baseline > 100 || target < 0 || target > 100)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target", "value"],
        message: "Percentage values must be between 0 and 100",
      });
    }
    if (!isPercent && (baseline < 0 || target < 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target", "value"],
        message: "Count values cannot be negative",
      });
    }
    if (
      new Date(definition.baseline.observedAt).getTime() >
      new Date(definition.horizon.endAt).getTime()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["baseline", "observedAt"],
        message: "Baseline must be observed before the horizon ends",
      });
    }
  });

export const configureObjectiveRequestSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    definition: objectiveDefinitionSchema,
  })
  .strict();

export type ObjectiveDefinition = z.infer<typeof objectiveDefinitionSchema>;
export type ObjectiveMeasurement = {
  value: number;
  observedAt: string;
  recordRefs?: string[];
};

const objectiveMeasurementSchema = z
  .object({
    value: z.number().finite(),
    observedAt: z.string().datetime({ offset: true }),
    recordRefs: z.array(z.string().trim().min(1).max(200)).max(20).optional().default([]),
  })
  .strict();

type MissionRow = typeof agentMissions.$inferSelect;

function storedDefinition(row: MissionRow): ObjectiveDefinition | null {
  if (!row.horizonStartAt || !row.horizonEndAt) return null;
  const parsed = objectiveDefinitionSchema.safeParse({
    objective: row.objective,
    metric: row.metric,
    baseline: row.baseline,
    target: row.target,
    horizon: {
      startAt: row.horizonStartAt.toISOString(),
      endAt: row.horizonEndAt.toISOString(),
    },
    priority: row.priority,
    budget: row.budget,
    constraints: row.constraints,
    allowedCapabilities: row.allowedCapabilities,
    successCondition: row.successCondition,
    stopCondition: row.stopCondition,
  });
  return parsed.success ? parsed.data : null;
}

export function isMeasurableMission(row: MissionRow): boolean {
  return storedDefinition(row) !== null;
}

export function evaluateObjectiveProgress(
  definition: ObjectiveDefinition,
  measurement: ObjectiveMeasurement | null,
  options: { missionStatus?: string; at?: Date } = {},
): AgentObjectiveProgress {
  const parsedDefinition = objectiveDefinitionSchema.safeParse(definition);
  if (!parsedDefinition.success) return needsConfigurationProgress();
  const safeDefinition = parsedDefinition.data;
  const parsedMeasurement = objectiveMeasurementSchema.safeParse(measurement);
  const safeMeasurement = parsedMeasurement.success ? parsedMeasurement.data : null;
  const at = options.at ?? new Date();
  if (options.missionStatus && options.missionStatus !== "active") {
    return {
      status: "stopped",
      currentValue: safeMeasurement?.value ?? null,
      progressPercent: null,
      targetReached: false,
      measuredAt: safeMeasurement?.observedAt ?? null,
      recordRefs: safeMeasurement?.recordRefs ?? [],
    };
  }

  const metric = OBJECTIVE_METRICS[safeDefinition.metric];
  const current = safeMeasurement?.value ?? null;
  const horizonStart = new Date(safeDefinition.horizon.startAt).getTime();
  const horizonEnd = new Date(safeDefinition.horizon.endAt).getTime();
  const measuredAt = safeMeasurement
    ? new Date(safeMeasurement.observedAt).getTime()
    : null;
  const measuredWithinHorizon =
    measuredAt != null && measuredAt >= horizonStart && measuredAt <= horizonEnd;
  const targetReached =
    current != null &&
    measuredWithinHorizon &&
    (metric.direction === "increase"
      ? current >= safeDefinition.target.value
      : current <= safeDefinition.target.value);
  const expired = at.getTime() > horizonEnd;
  let progressPercent: number | null = null;
  if (current != null) {
    const distance = Math.abs(safeDefinition.target.value - safeDefinition.baseline.value);
    const movement =
      metric.direction === "increase"
        ? current - safeDefinition.baseline.value
        : safeDefinition.baseline.value - current;
    progressPercent = Math.round(Math.max(0, Math.min(100, (movement / distance) * 100)));
  }

  return {
    status: targetReached ? "succeeded" : expired ? "expired" : "in_progress",
    currentValue: current,
    progressPercent,
    targetReached,
    measuredAt: safeMeasurement?.observedAt ?? null,
    recordRefs: safeMeasurement?.recordRefs ?? [],
  };
}

function needsConfigurationProgress(): AgentObjectiveProgress {
  return {
    status: "needs_configuration",
    currentValue: null,
    progressPercent: null,
    targetReached: false,
    measuredAt: null,
    recordRefs: [],
  };
}

export function toAgentMissionView(
  row: MissionRow,
  measurement: ObjectiveMeasurement | null = null,
): AgentMissionView {
  const definition = storedDefinition(row);
  const safeConstraints = constraintsSchema.safeParse(row.constraints);
  const safeCapabilities = allowedCapabilitiesSchema.safeParse(row.allowedCapabilities);
  const allowedCapabilities: AgentObjectiveCapability[] = safeCapabilities.success
    ? safeCapabilities.data
    : ["observe", "prepare"];

  return {
    id: row.id,
    key: row.key,
    objective: row.objective,
    metric: definition?.metric ?? null,
    baseline: definition?.baseline ?? null,
    target: definition?.target ?? null,
    horizon: definition?.horizon ?? null,
    budget: definition?.budget ?? null,
    constraints: safeConstraints.success ? safeConstraints.data : [],
    allowedCapabilities,
    successCondition: row.successCondition,
    stopCondition: row.stopCondition,
    priority: row.priority,
    status: row.status,
    definitionVersion: row.definitionVersion,
    configurationStatus: definition ? "configured" : "needs_configuration",
    progress: definition
      ? evaluateObjectiveProgress(definition, measurement, { missionStatus: row.status })
      : needsConfigurationProgress(),
    origin: row.origin,
  };
}

/**
 * This is only a mission-level ceiling. A true result never grants authority:
 * the Phase 1 policy engine must independently allow the action.
 */
export function isCapabilityAllowedByObjective(
  allowedCapabilities: readonly AgentObjectiveCapability[],
  capability: AgentObjectiveCapability,
): boolean {
  return allowedCapabilities.includes(capability);
}

export async function getPrimaryObjective(scope: BrandScope): Promise<MissionRow | null> {
  const [mission] = await getDb()
    .select()
    .from(agentMissions)
    .where(
      and(
        eq(agentMissions.workspaceId, scope.workspaceId),
        eq(agentMissions.brandId, scope.brandId),
        eq(agentMissions.key, "primary"),
      ),
    )
    .limit(1);
  return mission ?? null;
}

/** Tenant-safe fallback mission creation. Measurement fields intentionally stay null. */
export async function ensurePrimaryObjective(
  scope: BrandScope,
  brandName: string,
  options: { objective?: string; successCondition?: string; origin?: string } = {},
): Promise<MissionRow | null> {
  const db = getDb();
  const [ownedBrand] = await db
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.id, scope.brandId), eq(brands.workspaceId, scope.workspaceId)))
    .limit(1);
  if (!ownedBrand) return null;

  const existing = await getPrimaryObjective(scope);
  if (existing) return existing;

  const [created] = await db
    .insert(agentMissions)
    .values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      key: "primary",
      objective:
        options.objective ?? `Grow qualified discovery and trusted visibility for ${brandName}.`,
      successCondition:
        options.successCondition ??
        "Improve visibility, answer share, and qualified search traffic without exceeding authority or budget.",
      horizon: "ongoing",
      priority: 100,
      origin: options.origin ?? "system_created",
    })
    .onConflictDoNothing({ target: [agentMissions.brandId, agentMissions.key] })
    .returning();
  return created ?? (await getPrimaryObjective(scope));
}

export type ConfigureObjectiveResult =
  | { ok: true; mission: MissionRow }
  | { ok: false; reason: "not_found" | "archived" | "version_conflict"; currentVersion?: number };

/**
 * Configure the stable primary mission with compare-and-swap semantics. There
 * is intentionally no delete path; future lifecycle removal must archive a
 * mission so linked plans, tasks, and events remain intact.
 */
export async function configurePrimaryObjective(
  scope: BrandScope,
  expectedVersion: number,
  input: ObjectiveDefinition,
): Promise<ConfigureObjectiveResult> {
  const definition = objectiveDefinitionSchema.parse(input);
  return getDb().transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(agentMissions)
      .where(
        and(
          eq(agentMissions.workspaceId, scope.workspaceId),
          eq(agentMissions.brandId, scope.brandId),
          eq(agentMissions.key, "primary"),
        ),
      )
      .for("update")
      .limit(1);
    if (!current) return { ok: false as const, reason: "not_found" as const };
    if (current.status === "archived") {
      return { ok: false as const, reason: "archived" as const };
    }
    if (current.definitionVersion !== expectedVersion) {
      return {
        ok: false as const,
        reason: "version_conflict" as const,
        currentVersion: current.definitionVersion,
      };
    }

    const nextVersion = expectedVersion + 1;
    const [updated] = await tx
      .update(agentMissions)
      .set({
        objective: definition.objective,
        metric: definition.metric,
        baseline: definition.baseline,
        target: definition.target,
        successCondition: definition.successCondition,
        horizon: `until ${new Date(definition.horizon.endAt).toISOString().slice(0, 10)}`,
        horizonStartAt: new Date(definition.horizon.startAt),
        horizonEndAt: new Date(definition.horizon.endAt),
        priority: definition.priority,
        budget: definition.budget,
        constraints: definition.constraints,
        allowedCapabilities: definition.allowedCapabilities,
        stopCondition: definition.stopCondition,
        definitionVersion: nextVersion,
        origin: "owner_configured",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(agentMissions.id, current.id),
          eq(agentMissions.workspaceId, scope.workspaceId),
          eq(agentMissions.brandId, scope.brandId),
          eq(agentMissions.definitionVersion, expectedVersion),
        ),
      )
      .returning();
    if (!updated) {
      return { ok: false as const, reason: "version_conflict" as const };
    }

    const [event] = await tx
      .insert(agentEvents)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        missionId: updated.id,
        eventType: "objective_updated",
        summary: `Owner configured objective: ${definition.objective}`,
        actor: "owner",
        data: {
          fromVersion: current.definitionVersion,
          toVersion: updated.definitionVersion,
          before: {
            objective: current.objective,
            definition: storedDefinition(current),
          },
          after: definition,
        },
      })
      .returning({ id: agentEvents.id });
    if (!event) throw new Error("Objective update event could not be recorded");

    const replanMarker = buildObjectiveReplanMarker(scope, updated);
    await tx
      .insert(agentScheduledWork)
      .values(replanMarker)
      .onConflictDoNothing({
        target: [
          agentScheduledWork.scheduleKind,
          agentScheduledWork.brandId,
          agentScheduledWork.scheduleKey,
        ],
      });
    return { ok: true as const, mission: updated };
  });
}
