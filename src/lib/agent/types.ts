export type AgentPresenceId =
  | "working_now"
  | "on_duty"
  | "waiting_for_you"
  | "scheduled"
  | "paused"
  | "needs_attention";

export type AgentPresenceLabel =
  | "Working now"
  | "On duty"
  | "Waiting for you"
  | "Scheduled"
  | "Paused"
  | "Needs attention";

export type AgentPresenceView = {
  id: AgentPresenceId;
  label: AgentPresenceLabel;
  reason: string;
  isWorking: boolean;
};

export type AgentObjectiveMetricId =
  | "ai_answer_share_percent"
  | "qualified_non_brand_clicks"
  | "critical_crawler_findings"
  | "grounded_pages_published";

export type AgentObjectiveBaseline = {
  value: number;
  observedAt: string;
  sourceRefs: string[];
};

export type AgentObjectiveTarget = {
  value: number;
};

export type AgentObjectiveHorizon = {
  startAt: string;
  endAt: string;
};

export type AgentObjectiveBudget = {
  maxCredits: number;
  maxRemoteWrites: number;
  maxCostCents: number;
};

export type AgentObjectiveCapability =
  | "observe"
  | "prepare"
  | "article.create"
  | "article.update"
  | "article.meta.update"
  | "article.schema.update"
  | "site.meta.update"
  | "site.schema.update"
  | "robots.update"
  | "llms_txt.update"
  | "rollback.supported";

export type AgentObjectiveProgressStatus =
  | "needs_configuration"
  | "in_progress"
  | "succeeded"
  | "expired"
  | "stopped";

export type AgentObjectiveProgress = {
  status: AgentObjectiveProgressStatus;
  currentValue: number | null;
  progressPercent: number | null;
  targetReached: boolean;
  measuredAt: string | null;
  recordRefs: string[];
};

export type AgentMissionView = {
  id: string;
  key: string;
  objective: string;
  metric: AgentObjectiveMetricId | null;
  baseline: AgentObjectiveBaseline | null;
  target: AgentObjectiveTarget | null;
  horizon: AgentObjectiveHorizon | null;
  budget: AgentObjectiveBudget | null;
  constraints: string[];
  allowedCapabilities: AgentObjectiveCapability[];
  successCondition: string | null;
  stopCondition: string | null;
  priority: number;
  status: string;
  definitionVersion: number;
  configurationStatus: "configured" | "needs_configuration";
  progress: AgentObjectiveProgress;
  origin: string;
};

export type AgentTaskView = {
  id: string;
  title: string;
  reason: string;
  taskType: string;
  status: string;
  expectedImpact: string | null;
  confidence: number;
  riskLevel: string;
  requiredAuthority: string;
  scheduledFor: string | null;
  startedAt: string | null;
  artifactRef: string | null;
  outcomeRef: string | null;
};

export type AgentEventView = {
  id: string;
  type: string;
  summary: string;
  taskId: string | null;
  artifactRef: string | null;
  createdAt: string;
};

export type AgentWaitingView = {
  id: string;
  title: string;
  blockedValue: string;
  actionLabel: string;
  href: string;
  kind: "approval" | "connection" | "decision" | "recovery";
};

export type AgentState = {
  presence: AgentPresenceView;
  mission: AgentMissionView;
  plan: {
    id: string;
    version: number;
    rationale: string;
    windowStart: string;
    windowEnd: string;
  };
  now: AgentTaskView | null;
  next: AgentTaskView[];
  waiting: AgentWaitingView | null;
  recentEvents: AgentEventView[];
};

export type SteeringIntent =
  | "priority"
  | "constraint"
  | "permission"
  | "schedule"
  | "direction"
  | "explanation"
  | "status"
  | "ambiguous"
  | "unsupported";

export type PlanDiff = {
  fromVersion: number;
  toVersion: number;
  reason: string;
  movedTaskCount: number;
  createdTaskId?: string;
};

export type SteeringResult = {
  intent: SteeringIntent;
  outcome:
    | "plan_updated"
    | "constraint_remembered"
    | "permission_updated"
    | "approval_needed"
    | "task_created"
    | "explained"
    | "status"
    | "clarification_required"
    | "unsupported";
  title: string;
  summary: string;
  planDiff?: PlanDiff;
  memory?: { kind: string; key: string; expiresAt: string | null };
  approval?: {
    id: string;
    actionType: string;
    resourceRef: string;
    proposalHash?: string;
    proposal?: Record<string, unknown>;
  };
  policies?: Array<Record<string, unknown>>;
  task?: AgentTaskView;
  sources?: Array<{ label: string; href: string }>;
};
