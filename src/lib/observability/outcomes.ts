import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import { agentOutcomeAttributions } from "@/lib/db/schema";

export type OutcomeCategory = "agent_correctness" | "business_effect" | "unclassified";

const AGENT_CORRECTNESS_METRICS = new Set([
  "task_success",
  "correct_tool_selection",
  "correct_escalation",
  "policy_violation",
  "unsupported_claim",
  "citation_precision",
  "citation_coverage",
  "recovery_success",
  "rollback_success",
  "cost_per_successful_task",
]);

const BUSINESS_EFFECT_METRICS = new Set([
  "non_brand_impressions",
  "organic_impressions",
  "non_brand_clicks",
  "qualified_clicks",
  "qualified_organic_traffic",
  "ai_answer_appearance",
  "ai_citation_share",
  "content_indexation",
  "retained_ranking",
  "high_intent_page_performance",
  "conversions",
  "owner_time_saved",
  "owner_intervention_rate",
  "rejection_rate",
]);

const CAUSAL_DESIGNS = new Set([
  "holdout",
  "staggered_rollout",
  "matched_cohort",
  "time_series_control",
]);

export function classifyOutcomeMetric(outcomeKind: string): OutcomeCategory {
  if (AGENT_CORRECTNESS_METRICS.has(outcomeKind)) return "agent_correctness";
  if (BUSINESS_EFFECT_METRICS.has(outcomeKind)) return "business_effect";
  return "unclassified";
}

export function hasCausalBusinessSupport(input: {
  verified: boolean;
  baseline: unknown;
  evidenceRefs: readonly string[];
  holdoutGroup: string | null;
  confounders: Record<string, unknown>;
}) {
  if (!input.verified || !input.baseline || input.evidenceRefs.length === 0) return false;
  const design = input.confounders.causalDesign;
  if (typeof design !== "string" || !CAUSAL_DESIGNS.has(design)) return false;
  if (design === "holdout") return Boolean(input.holdoutGroup);
  return Boolean(
    input.confounders.controlRef ||
      input.confounders.matchedCohortId ||
      input.confounders.prePeriodRef,
  );
}

/**
 * Separates operational correctness from business movement. Business rows are
 * explicitly labelled correlational until a declared control design exists.
 */
export async function buildOutcomeMeasurementReport(
  scope: BrandScope,
  window: { from: Date; to: Date },
) {
  const rows = await getDb()
    .select()
    .from(agentOutcomeAttributions)
    .where(
      and(
        eq(agentOutcomeAttributions.workspaceId, scope.workspaceId),
        eq(agentOutcomeAttributions.brandId, scope.brandId),
        gte(agentOutcomeAttributions.observedAt, window.from),
        lte(agentOutcomeAttributions.observedAt, window.to),
      ),
    )
    .orderBy(asc(agentOutcomeAttributions.observedAt));

  const report = {
    window: { from: window.from.toISOString(), to: window.to.toISOString() },
    agentCorrectness: [] as Array<Record<string, unknown>>,
    businessEffect: [] as Array<Record<string, unknown>>,
    unclassified: [] as Array<Record<string, unknown>>,
  };
  for (const row of rows) {
    const category = classifyOutcomeMetric(row.outcomeKind);
    const common = {
      id: row.id,
      actionId: row.actionId,
      objectiveId: row.objectiveId,
      outcomeKind: row.outcomeKind,
      outcomeValue: row.outcomeValue,
      observedAt: row.observedAt.toISOString(),
      sourceRef: row.sourceRef,
      verified: row.verified,
      evidenceRefs: row.evidenceRefs,
    };
    if (category === "agent_correctness") {
      report.agentCorrectness.push(common);
    } else if (category === "business_effect") {
      report.businessEffect.push({
        ...common,
        attribution: hasCausalBusinessSupport({
          verified: row.verified,
          baseline: row.baseline,
          evidenceRefs: row.evidenceRefs,
          holdoutGroup: row.holdoutGroup,
          confounders: row.confounders,
        })
          ? "causally_supported"
          : "correlational_only",
        causalDesign: row.confounders.causalDesign ?? null,
        holdoutGroup: row.holdoutGroup,
      });
    } else {
      report.unclassified.push(common);
    }
  }
  return report;
}

