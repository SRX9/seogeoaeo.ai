import { DETERMINISTIC_POLICY_VERSION } from "@/lib/agent/policy-model";
import {
  AGENT_TOOLS,
  type AgentToolDefinition,
} from "@/lib/agent/tool-registry";

export type KernelPlanReceipt = {
  objectiveId: string;
  objectiveDefinitionVersion: number;
  policyRevision: string;
  registryRevision: string;
};

export type KernelPolicyMaterial = {
  mode: string;
  ownerConstraints?: readonly string[];
  grantedCapabilities?: readonly string[];
  canonicalPolicies?: readonly unknown[];
};

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

function revision(prefix: string, material: unknown): string {
  const serialized = JSON.stringify(stableValue(material));
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${prefix}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Non-secret deterministic revision used only to detect that authority inputs
 * changed between planning and execution. Current policy is still evaluated
 * again at the execution boundary; this receipt never grants authority.
 */
export function getKernelPolicyRevision(material: KernelPolicyMaterial): string {
  return revision(DETERMINISTIC_POLICY_VERSION, {
    mode: material.mode,
    ownerConstraints: [...(material.ownerConstraints ?? [])].sort(),
    grantedCapabilities: [...(material.grantedCapabilities ?? [])].sort(),
    canonicalPolicies: [...(material.canonicalPolicies ?? [])]
      .map(stableValue)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  });
}

function registryMaterial(tool: AgentToolDefinition) {
  return {
    name: tool.name,
    version: tool.version,
    effect: tool.effect,
    riskClass: tool.riskClass,
    capability: tool.capability,
    tenantScope: tool.tenantScope,
    estimatedCost: tool.estimatedCost,
    idempotency: tool.idempotency,
    verification: tool.verification,
    rollback: tool.rollback,
    rateLimits: tool.rateLimits,
    dataSensitivity: tool.dataSensitivity,
    allowedCallers: [...tool.allowedCallers].sort(),
    plannerEligible: tool.plannerEligible,
  };
}

/** Tool schemas are versioned by each tool; all other authority metadata is fingerprinted here. */
export function getKernelRegistryRevision(
  tools: readonly AgentToolDefinition[] = AGENT_TOOLS,
): string {
  return revision(
    "agent-tool-registry-v1",
    tools
      .map(registryMaterial)
      .sort((left, right) =>
        `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
      ),
  );
}

export function buildKernelPlanReceipt(input: {
  objectiveId: string;
  objectiveDefinitionVersion: number;
  authority: KernelPolicyMaterial;
}): KernelPlanReceipt {
  return {
    objectiveId: input.objectiveId,
    objectiveDefinitionVersion: input.objectiveDefinitionVersion,
    policyRevision: getKernelPolicyRevision(input.authority),
    registryRevision: getKernelRegistryRevision(),
  };
}
