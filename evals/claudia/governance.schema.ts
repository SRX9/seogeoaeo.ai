import { z } from "zod";

export const EVAL_SUITE_IDS = [
  "policy_authority",
  "steering_clarification",
  "planning_tool_selection",
  "content_grounding_citations",
  "memory_poisoning",
  "workflow_durability_chaos",
  "tenant_egress_security",
  "remote_verification_rollback",
  "ask_claudia_groundedness",
  "long_horizon_objectives",
] as const;

export const COMPONENT_VERSION_KEYS = [
  "prompts",
  "models",
  "toolSchemas",
  "policyParser",
  "deterministicPolicy",
  "planner",
  "memory",
  "scorersGraders",
  "contentGates",
  "auditAnalyzers",
] as const;

export const suiteCatalogSchema = z
  .object({
    version: z.literal("claudia-eval-catalog-v1"),
    suites: z
      .array(
        z
          .object({
            id: z.enum(EVAL_SUITE_IDS),
            capability: z.string().min(1),
            datasetVersion: z.string().min(1),
            grader: z.enum([
              "deterministic",
              "deterministic_with_human_calibration",
              "deterministic_with_staging_exercise",
              "deterministic_with_outcome_review",
            ]),
            evidence: z.array(z.string().min(1)).min(1),
            releaseThreshold: z.number().min(0).max(1),
          })
          .strict(),
      )
      .length(EVAL_SUITE_IDS.length),
  })
  .strict();

const componentVersionsSchema = z
  .object(
    Object.fromEntries(
      COMPONENT_VERSION_KEYS.map((key) => [key, z.string().min(1)]),
    ) as Record<(typeof COMPONENT_VERSION_KEYS)[number], z.ZodString>,
  )
  .strict();

export const behaviorReleaseSchema = z
  .object({
    version: z.literal("claudia-behavior-release-v1"),
    releaseKey: z.string().min(1),
    status: z.enum(["draft", "candidate", "canary", "released", "rolled_back"]),
    owner: z.string().min(1),
    componentVersions: componentVersionsSchema,
    affectedEvalSuites: z.array(z.enum(EVAL_SUITE_IDS)).min(1),
    beforeReport: z.string().min(1),
    afterReport: z.string().min(1),
    migrationPlan: z.string().min(1),
    rollbackPlan: z.string().min(1),
    canary: z
      .object({
        stage: z.string().min(1),
        maxBrands: z.number().int().positive(),
        autonomyLevel: z.number().int().min(0).max(4),
        stopOnAnyCriticalSlo: z.literal(true),
      })
      .strict(),
    monitoringWindowHours: z.number().int().positive(),
    requiredSecurityProgram: z.string().min(1),
  })
  .strict();

export const redTeamProgramSchema = z
  .object({
    version: z.literal("claudia-security-red-team-v1"),
    owner: z.string().min(1),
    cadence: z.string().min(1),
    lastExercisedAt: z.string().date(),
    threats: z.array(
      z
        .object({
          id: z.string().min(1),
          severity: z.enum(["low", "medium", "high", "critical"]),
          controls: z.array(z.string().min(1)).min(1),
          evidence: z.array(z.string().min(1)).min(1),
          outcome: z.enum(["pass", "fail"]),
        })
        .strict(),
    ),
    findings: z.array(
      z
        .object({
          id: z.string().min(1),
          severity: z.enum(["low", "medium", "high", "critical"]),
          status: z.enum(["open", "resolved", "accepted"]),
          owner: z.string().min(1),
          summary: z.string().min(1),
          acceptance: z.string().min(1).optional(),
        })
        .strict(),
    ),
  })
  .strict();

export const autonomyRolloutEvidenceSchema = z
  .object({
    version: z.literal("claudia-autonomy-rollout-v1"),
    status: z.enum(["code_complete_evidence_pending", "canary", "validated"]),
    productionAuthorityExpanded: z.boolean(),
    stages: z
      .array(
        z
          .object({
            stage: z.number().int().min(1).max(8),
            name: z.string().min(1),
            executionMode: z.enum(["eval", "synthetic", "internal", "shadow", "live"]),
            requiresPriorEvidence: z.boolean(),
          })
          .strict(),
      )
      .length(8),
    stopConditions: z.array(z.string().min(1)).min(9),
    requiredProductionLikeExercises: z
      .array(z.enum(["emergency_stop", "incident_reconstruction", "rollback"]))
      .length(3),
    claimPolicy: z
      .object({
        sotaClaimAllowed: z.boolean(),
        reason: z.string().min(1),
      })
      .strict(),
  })
  .strict();
