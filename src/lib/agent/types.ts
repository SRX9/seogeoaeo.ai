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

export type AgentMissionView = {
  id: string;
  objective: string;
  successCondition: string | null;
  horizon: string;
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
    | "unsupported";
  title: string;
  summary: string;
  planDiff?: PlanDiff;
  memory?: { kind: string; key: string; expiresAt: string | null };
  approval?: { id: string; actionType: string; resourceRef: string };
  task?: AgentTaskView;
  sources?: Array<{ label: string; href: string }>;
};
