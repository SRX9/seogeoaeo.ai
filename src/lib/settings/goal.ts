import type { ObjectiveMetricMeasurement } from "@/lib/agent/objective-measurements";
import type { ObjectiveDefinition } from "@/lib/agent/objectives";
import type { AgentMissionView, AgentObjectiveMetricId } from "@/lib/agent/types";
import {
  FIRST_OUTCOME_IDS,
  firstOutcomeObjective,
  type FirstOutcomeId,
} from "@/lib/onboarding/first-outcome";

export const GOAL_OPTIONS: ReadonlyArray<{
  id: FirstOutcomeId;
  label: string;
  description: string;
}> = [
  {
    id: "discovery",
    label: "Get discovered by more customers",
    description: "Grow qualified visibility across search and AI answers.",
  },
  {
    id: "consistent_content",
    label: "Publish useful content consistently",
    description: "Keep a reliable flow of grounded, helpful content going live.",
  },
  {
    id: "priority_keywords",
    label: "Improve priority keyword performance",
    description: "Focus Claudia on the searches most important to your business.",
  },
  {
    id: "ai_answers",
    label: "Appear more often in AI answers",
    description: "Improve trusted mentions and citations for relevant questions.",
  },
  {
    id: "website_health",
    label: "Improve website search health",
    description: "Prioritize crawler access and important discovery issues.",
  },
];

const GOAL_METRICS: Record<FirstOutcomeId, AgentObjectiveMetricId> = {
  discovery: "qualified_non_brand_clicks",
  consistent_content: "grounded_pages_published",
  priority_keywords: "qualified_non_brand_clicks",
  ai_answers: "ai_answer_share_percent",
  website_health: "critical_crawler_findings",
};

const GOAL_CAPABILITIES: Record<FirstOutcomeId, AgentMissionView["allowedCapabilities"]> = {
  discovery: ["observe", "prepare", "article.create", "article.update"],
  consistent_content: ["observe", "prepare", "article.create", "article.update"],
  priority_keywords: ["observe", "prepare", "article.create", "article.update"],
  ai_answers: ["observe", "prepare", "article.create", "article.update"],
  website_health: ["observe", "prepare"],
};

const GOAL_SUCCESS: Record<FirstOutcomeId, string> = {
  discovery: "Increase qualified discovery during the next 90 days.",
  consistent_content: "Publish at least four additional grounded pages during the next 90 days.",
  priority_keywords: "Increase qualified visits from priority searches during the next 90 days.",
  ai_answers: "Increase eligible AI answer visibility during the next 90 days.",
  website_health: "Resolve the currently measured critical crawler findings during the next 90 days.",
};

export type GoalView = {
  selectedGoal: FirstOutcomeId | null;
  objective: string;
  progress: {
    status: AgentMissionView["progress"]["status"];
    currentValue: number | null;
    targetValue: number | null;
    percent: number | null;
  };
};

export function inferGoalId(mission: AgentMissionView, brandName: string): FirstOutcomeId | null {
  const exact = FIRST_OUTCOME_IDS.find(
    (goalId) => firstOutcomeObjective(goalId, brandName) === mission.objective,
  );
  if (exact) return exact;
  if (mission.metric === "ai_answer_share_percent") return "ai_answers";
  if (mission.metric === "critical_crawler_findings") return "website_health";
  if (mission.metric === "grounded_pages_published") return "consistent_content";
  if (mission.metric === "qualified_non_brand_clicks") {
    return mission.objective.toLowerCase().includes("priority")
      ? "priority_keywords"
      : "discovery";
  }
  return null;
}

export function toGoalView(mission: AgentMissionView, brandName: string): GoalView {
  return {
    selectedGoal: inferGoalId(mission, brandName),
    objective: mission.objective,
    progress: {
      status: mission.progress.status,
      currentValue: mission.progress.currentValue,
      targetValue: mission.target?.value ?? null,
      percent: mission.progress.progressPercent,
    },
  };
}

function targetFor(metric: AgentObjectiveMetricId, measuredValue: number) {
  if (metric === "critical_crawler_findings") {
    return { baseline: Math.max(1, Math.ceil(measuredValue)), target: 0 };
  }
  if (metric === "ai_answer_share_percent") {
    const baseline = Math.min(99, Math.max(0, measuredValue));
    return { baseline, target: Math.min(100, Math.max(baseline + 1, baseline + 10)) };
  }
  const baseline = Math.max(0, Math.floor(measuredValue));
  if (metric === "grounded_pages_published") return { baseline, target: baseline + 4 };
  return { baseline, target: baseline + Math.max(10, Math.ceil(baseline * 0.25)) };
}

export function buildGoalDefinition(input: {
  goalId: FirstOutcomeId;
  brandName: string;
  mission: AgentMissionView;
  measurement: ObjectiveMetricMeasurement | null;
  now?: Date;
}): ObjectiveDefinition {
  const now = input.now ?? new Date();
  const metric = GOAL_METRICS[input.goalId];
  const sameMetric = input.mission.metric === metric;
  const measuredValue =
    input.measurement?.value ?? (sameMetric ? input.mission.baseline?.value : null) ?? 0;
  const { baseline, target } = targetFor(metric, measuredValue);
  const sourceRefs =
    input.measurement?.recordRefs && input.measurement.recordRefs.length > 0
      ? input.measurement.recordRefs
      : sameMetric && input.mission.baseline?.sourceRefs.length
        ? input.mission.baseline.sourceRefs
        : [`agent_mission:${input.mission.id}`];
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 90);
  const capabilities = Array.from(
    new Set([...input.mission.allowedCapabilities, ...GOAL_CAPABILITIES[input.goalId]]),
  );

  return {
    objective: firstOutcomeObjective(input.goalId, input.brandName),
    metric,
    baseline: {
      value: baseline,
      observedAt: input.measurement?.observedAt ?? now.toISOString(),
      sourceRefs,
    },
    target: { value: target },
    horizon: { startAt: now.toISOString(), endAt: end.toISOString() },
    priority: input.mission.priority,
    budget: input.mission.budget ?? {
      maxCredits: 100,
      maxRemoteWrites: 0,
      maxCostCents: 0,
    },
    constraints: input.mission.constraints,
    allowedCapabilities: capabilities,
    successCondition: GOAL_SUCCESS[input.goalId],
    stopCondition:
      input.mission.stopCondition ??
      "Stop when a budget, safety, or permission limit is reached.",
  };
}
