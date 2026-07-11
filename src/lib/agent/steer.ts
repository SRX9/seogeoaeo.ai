import { createAgentApproval } from "@/lib/agent/events";
import {
  getAgentControlState,
  rememberAgentInstruction,
} from "@/lib/agent/memory";
import {
  ensureOwnerDirectedWritingTask,
  replanAgentWork,
  setFutureAgentTasksPaused,
} from "@/lib/agent/planner";
import {
  getAgentState,
  getTaskByIdempotencyKey,
  toAgentTaskView,
} from "@/lib/agent/state";
import type { SteeringIntent, SteeringResult } from "@/lib/agent/types";
import type { BrandScope } from "@/lib/brand/repository";
import type { ConnectorCapability } from "@/lib/integrations/capabilities";

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function shortHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function resolveSteeringIntent(message: string): SteeringIntent {
  const value = message.trim().toLowerCase();
  if (!value) return "unsupported";
  if (/\bwhy\b|explain|reason|evidence/.test(value)) return "explanation";
  if (/\b(you may|you can|i authorize)\b/.test(value)) return "permission";
  if (/\b(pause|resume|schedule|until|after monday|after tuesday|after wednesday|after thursday|after friday)\b/.test(value)) {
    return "schedule";
  }
  if (/\b(never|do not|don't|dont|must not|avoid)\b/.test(value)) return "constraint";
  if (/\b(you may|you can|authorize|permission|automatically|auto-apply)\b/.test(value)) {
    return "permission";
  }
  if (/\b(focus|prioritize|priority|emphasize|concentrate)\b/.test(value)) return "priority";
  if (/\b(write|create|research|audit|publish|launch|work on)\b/.test(value)) return "direction";
  if (/\b(status|update)\b|what (changed|are you doing|did you do)/.test(value)) return "status";
  return "unsupported";
}

function expiryFromInstruction(message: string, now = new Date()): Date | null {
  const value = message.toLowerCase();
  if (value.includes("this week")) {
    const expiry = new Date(now);
    const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7;
    expiry.setUTCDate(expiry.getUTCDate() + daysUntilMonday);
    expiry.setUTCHours(0, 0, 0, 0);
    return expiry;
  }
  if (value.includes("this month")) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  }
  if (value.includes("tomorrow")) {
    const expiry = new Date(now);
    expiry.setUTCDate(expiry.getUTCDate() + 1);
    expiry.setUTCHours(8, 0, 0, 0);
    return expiry;
  }
  const days = value.match(/for\s+(\d{1,3})\s+days?/);
  if (days?.[1]) {
    const expiry = new Date(now);
    expiry.setUTCDate(expiry.getUTCDate() + Number(days[1]));
    return expiry;
  }
  const weekday = WEEKDAYS.findIndex(
    (day) => value.includes(`until ${day}`) || value.includes(`after ${day}`),
  );
  if (weekday >= 0) {
    const expiry = new Date(now);
    const distance = (weekday - now.getUTCDay() + 7) % 7 || 7;
    expiry.setUTCDate(expiry.getUTCDate() + distance);
    expiry.setUTCHours(8, 0, 0, 0);
    return expiry;
  }
  return null;
}

/** Extract the subject of a writing instruction without pretending to support arbitrary work. */
export function parseDirectedWritingTopic(message: string): string | null {
  const match = message.match(
    /^\s*(?:please\s+)?(?:write|create)\s+(?:(?:an?|the)\s+)?(?:(?:article|post)\s+)?(?:about|on|for)\s+(.+?)\s*$/i,
  );
  const raw = match?.[1]?.replace(/\s+(?:next|first)\.?$/i, "").trim();
  if (!raw || raw.length < 3) return null;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function capabilityFromInstruction(message: string): ConnectorCapability | null {
  const value = message.toLowerCase();
  if (value.includes("robots")) return "robots.update";
  if (value.includes("llms.txt") || value.includes("llms txt")) return "llms_txt.update";
  if (value.includes("schema")) {
    return value.includes("article") ? "article.schema.update" : "site.schema.update";
  }
  if (value.includes("metadata") || value.includes("meta")) {
    return value.includes("article") ? "article.meta.update" : "site.meta.update";
  }
  if (value.includes("publish")) return "article.create";
  if (value.includes("article") && value.includes("update")) return "article.update";
  return null;
}

async function structuredReplan(
  scope: BrandScope,
  message: string,
  reason: string,
) {
  const replanned = await replanAgentWork(scope, reason, {
    source: "owner_steering",
    instruction: message,
  });
  return {
    fromVersion: replanned.current.version,
    toVersion: replanned.plan.version,
    reason,
    movedTaskCount: replanned.movedTaskCount,
  };
}

export async function steerAgent(
  scope: BrandScope,
  input: { brandName: string; subscriptionStatus?: string | null; message: string },
): Promise<SteeringResult> {
  const message = input.message.trim();
  const intent = resolveSteeringIntent(message);
  const key = shortHash(message.toLowerCase());

  if (intent === "priority") {
    const expiresAt = expiryFromInstruction(message);
    const memory = await rememberAgentInstruction(scope, {
      kind: "preference",
      key: "priority:active",
      value: { instruction: message },
      provenance: "owner_steering",
      expiresAt,
    });
    const reason = `Owner priority: ${message}`;
    const planDiff = await structuredReplan(scope, message, reason);
    return {
      intent,
      outcome: "plan_updated",
      title: "Plan updated",
      summary: "I moved future work under this priority and kept completed work unchanged.",
      planDiff,
      memory: {
        kind: memory.kind,
        key: memory.key,
        expiresAt: memory.expiresAt?.toISOString() ?? null,
      },
    };
  }

  if (intent === "schedule") {
    const resume = /\bresume\b/i.test(message);
    const pause = /\bpause\b/i.test(message) || /\b(?:until|after)\s+(?:sun|mon|tues|wednes|thurs|fri|satur)day\b/i.test(message);
    const expiresAt = resume ? null : expiryFromInstruction(message);
    if (!resume && !pause && !expiresAt) {
      return {
        intent: "unsupported",
        outcome: "unsupported",
        title: "Use a concrete pause window",
        summary: 'Say "pause until Monday," "pause for 3 days," or "resume work" so I know exactly how long to pause.',
      };
    }
    const scheduleScope = /\bpublish(?:ing)?\b/i.test(message)
      ? "publishing"
      : "automation";
    const memory = await rememberAgentInstruction(scope, {
      kind: "constraint",
      key: `schedule:${scheduleScope}`,
      value: { instruction: message, paused: !resume, scheduleScope },
      provenance: "owner_steering",
      expiresAt,
    });
    const reason = `Owner ${resume ? "resumed" : "paused"} ${scheduleScope}: ${message}`;
    const planDiff = await structuredReplan(scope, message, reason);
    if (scheduleScope === "automation") {
      await setFutureAgentTasksPaused(scope, !resume);
    }
    return {
      intent,
      outcome: "constraint_remembered",
      title:
        scheduleScope === "publishing"
          ? resume
            ? "Publishing resumed"
            : "Publishing paused"
          : resume
            ? "Work resumed"
            : expiresAt
              ? "Work paused temporarily"
              : "Work paused",
      summary: resume
        ? scheduleScope === "publishing"
          ? "Agent-initiated publishing is active again."
          : "Future work is active again and will continue on the normal cadence."
        : expiresAt
          ? scheduleScope === "publishing"
            ? `No agent-initiated publish will start until ${expiresAt.toLocaleString()}.`
            : `No new autonomous work will start until ${expiresAt.toLocaleString()}.`
          : scheduleScope === "publishing"
            ? "No agent-initiated publish will start until you resume publishing."
            : "No new autonomous work will start until you resume it.",
      planDiff,
      memory: {
        kind: memory.kind,
        key: memory.key,
        expiresAt: memory.expiresAt?.toISOString() ?? null,
      },
    };
  }

  if (intent === "constraint") {
    const memory = await rememberAgentInstruction(scope, {
      kind: "constraint",
      key: `constraint:${key}`,
      value: { instruction: message },
      provenance: "owner_steering",
    });
    const planDiff = await structuredReplan(scope, message, `Owner constraint: ${message}`);
    return {
      intent,
      outcome: "constraint_remembered",
      title: "Constraint remembered",
      summary: "I will enforce this before matching live actions and keep it in the plan history.",
      planDiff,
      memory: { kind: memory.kind, key: memory.key, expiresAt: null },
    };
  }

  if (intent === "permission") {
    const capability = capabilityFromInstruction(message);
    if (!capability) {
      return {
        intent: "unsupported",
        outcome: "unsupported",
        title: "Name the exact permission",
        summary: "Specify publishing, article updates, metadata, schema, robots.txt, or llms.txt so the authority change has a deterministic scope.",
      };
    }
    const isDirectGrant = /\b(you may|you can|i authorize)\b/i.test(message);
    const permissionExpiresAt = expiryFromInstruction(message);
    if (isDirectGrant) {
      const memory = await rememberAgentInstruction(scope, {
        kind: "permission",
        key: capability,
        value: { instruction: message, capability, granted: true },
        provenance: "owner_steering",
        expiresAt: permissionExpiresAt,
      });
      const planDiff = await structuredReplan(
        scope,
        message,
        `Owner granted ${capability} authority. Connector capability and risk policy still apply.`,
      );
      return {
        intent,
        outcome: "permission_updated",
        title: "Permission updated",
        summary:
          "I recorded the authority. I will still require a matching connector capability and pass the deterministic risk policy before acting.",
        planDiff,
        memory: {
          kind: memory.kind,
          key: memory.key,
          expiresAt: memory.expiresAt?.toISOString() ?? null,
        },
      };
    }

    const approval = await createAgentApproval(scope, {
      actionType: `grant ${capability}`,
      resourceRef: capability,
      afterState: {
        instruction: message,
        capability,
        expiresAt: permissionExpiresAt?.toISOString() ?? null,
      },
      riskLevel: "medium",
      expectedBenefit: "Allow the requested work and record each action in the audit log.",
      expiresAt: permissionExpiresAt,
    });
    return {
      intent,
      outcome: "approval_needed",
      title: "Exact authority needed",
      summary: "Review the proposed permission before it changes how I can act.",
      approval: {
        id: approval.id,
        actionType: approval.actionType,
        resourceRef: approval.resourceRef,
      },
    };
  }

  if (intent === "direction") {
    const topicTitle = parseDirectedWritingTopic(message);
    if (!topicTitle) {
      return {
        intent: "unsupported",
        outcome: "unsupported",
        title: "That executor is not connected yet",
        summary: 'I can queue an article when you say "write an article about...". Use the existing controls for audits, publishing, and launches.',
      };
    }
    const taskKey = `steer:${key}`;
    const existingTask = await getTaskByIdempotencyKey(scope.brandId, taskKey);
    if (existingTask) {
      return {
        intent,
        outcome: "task_created",
        title: "Task already queued",
        summary: "This exact article direction is already in the durable work plan.",
        task: toAgentTaskView(existingTask),
      };
    }
    const replanned = await replanAgentWork(scope, `Owner-directed work: ${message}`, {
      source: "owner_steering",
      instruction: message,
    });
    const controls = await getAgentControlState(scope.brandId);
    const task = await ensureOwnerDirectedWritingTask(scope, {
      missionId: replanned.mission.id,
      planVersionId: replanned.plan.id,
      idempotencyKey: taskKey,
      title: topicTitle,
      instruction: message,
      paused: controls.paused,
    });
    return {
      intent,
      outcome: "task_created",
      title: "Task created",
      summary: controls.paused
        ? "I queued this article at the front of the topic list; it will wait until you resume autonomous work."
        : "I put this article at the front of the topic queue for the next daily writing pass.",
      task: toAgentTaskView(task),
      planDiff: {
        fromVersion: replanned.current.version,
        toVersion: replanned.plan.version,
        reason: `Owner-directed work: ${message}`,
        movedTaskCount: replanned.movedTaskCount,
        createdTaskId: task.id,
      },
    };
  }

  if (intent === "explanation" || intent === "status") {
    const state = await getAgentState(scope, input);
    if (intent === "explanation") {
      const task = state.now ?? state.next[0] ?? null;
      return {
        intent,
        outcome: "explained",
        title: task ? `Why ${task.title}` : "Why this plan",
        summary: task
          ? `${task.reason} Expected impact: ${task.expectedImpact ?? "Not yet estimated"}. Confidence: ${task.confidence}%.`
          : state.plan.rationale,
        sources: [
          { label: "Current plan", href: "/dashboard" },
          { label: "Work history", href: "/activity" },
        ],
      };
    }
    return {
      intent,
      outcome: "status",
      title: state.presence.label,
      summary: state.now
        ? `${state.now.title}. ${state.now.reason}`
        : `${state.presence.reason}${state.next[0] ? ` Next: ${state.next[0].title}.` : ""}`,
      sources: [
        { label: "Claudia", href: "/dashboard" },
        { label: "Reports", href: "/reports" },
      ],
    };
  }

  return {
    intent: "unsupported",
    outcome: "unsupported",
    title: "Outside my role",
    summary:
      "I can change this brand's priorities, constraints, permissions, schedule, or work plan, and explain the work already underway.",
  };
}
