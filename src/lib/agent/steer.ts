import { createAgentApproval } from "@/lib/agent/events";
import { rememberAgentInstruction } from "@/lib/agent/memory";
import {
  ensurePlannedTask,
  replanAgentWork,
} from "@/lib/agent/planner";
import { getAgentState, toAgentTaskView } from "@/lib/agent/state";
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
  if (value.includes("tomorrow")) {
    const expiry = new Date(now);
    expiry.setUTCDate(expiry.getUTCDate() + 1);
    expiry.setUTCHours(23, 59, 59, 999);
    return expiry;
  }
  const days = value.match(/for\s+(\d{1,3})\s+days?/);
  if (days?.[1]) {
    const expiry = new Date(now);
    expiry.setUTCDate(expiry.getUTCDate() + Number(days[1]));
    return expiry;
  }
  const weekday = WEEKDAYS.findIndex((day) => value.includes(`until ${day}`));
  if (weekday >= 0) {
    const expiry = new Date(now);
    const distance = (weekday - now.getUTCDay() + 7) % 7 || 7;
    expiry.setUTCDate(expiry.getUTCDate() + distance);
    expiry.setUTCHours(8, 0, 0, 0);
    return expiry;
  }
  return null;
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
    const memory = await rememberAgentInstruction(scope, {
      kind: "preference",
      key: `priority:${key}`,
      value: { instruction: message },
      provenance: "owner_steering",
    });
    const reason = `Owner priority: ${message}`;
    const planDiff = await structuredReplan(scope, message, reason);
    return {
      intent,
      outcome: "plan_updated",
      title: "Plan updated",
      summary: "I moved future work under this priority and kept completed work unchanged.",
      planDiff,
      memory: { kind: memory.kind, key: memory.key, expiresAt: null },
    };
  }

  if (intent === "constraint" || intent === "schedule") {
    const expiresAt = intent === "schedule" ? expiryFromInstruction(message) : null;
    const memory = await rememberAgentInstruction(scope, {
      kind: "constraint",
      key: `${intent}:${key}`,
      value: { instruction: message },
      provenance: "owner_steering",
      expiresAt,
    });
    const reason = `${intent === "schedule" ? "Operating window" : "Owner constraint"}: ${message}`;
    const planDiff = await structuredReplan(scope, message, reason);
    return {
      intent,
      outcome: "constraint_remembered",
      title: expiresAt ? "Temporary constraint remembered" : "Constraint remembered",
      summary: expiresAt
        ? `I will enforce this until ${expiresAt.toLocaleString()}.`
        : "I will enforce this across research, planning, writing, and authorization.",
      planDiff,
      memory: {
        kind: memory.kind,
        key: memory.key,
        expiresAt: memory.expiresAt?.toISOString() ?? null,
      },
    };
  }

  if (intent === "permission") {
    const capability = capabilityFromInstruction(message);
    const isDirectGrant = /\b(you may|you can|i authorize)\b/i.test(message);
    if (capability && isDirectGrant) {
      const memory = await rememberAgentInstruction(scope, {
        kind: "permission",
        key: capability,
        value: { instruction: message, capability, granted: true },
        provenance: "owner_steering",
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
        memory: { kind: memory.kind, key: memory.key, expiresAt: null },
      };
    }

    const approval = await createAgentApproval(scope, {
      actionType: capability ? `grant ${capability}` : "change operating authority",
      resourceRef: capability ?? "brand-authority",
      afterState: { instruction: message, capability },
      riskLevel: "medium",
      expectedBenefit: "Unlock the requested class of autonomous work with an explicit audit trail.",
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
    const replanned = await replanAgentWork(scope, `Owner-directed work: ${message}`, {
      source: "owner_steering",
      instruction: message,
    });
    const task = await ensurePlannedTask(scope, replanned.mission.id, replanned.plan.id, {
      title: message.slice(0, 140),
      reason: "The owner explicitly moved this work ahead of the normal queue.",
      taskType: "owner_direction",
      executor: "planner",
      idempotencyKey: `steer:${key}`,
      expectedImpact: "Advance the owner's stated business priority.",
      confidence: 90,
      riskLevel: "medium",
      requiredAuthority: "prepare",
      input: { instruction: message, source: "owner_steering" },
    });
    return {
      intent,
      outcome: "task_created",
      title: "Task created",
      summary: "I added this to the current plan with owner-directed provenance.",
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
