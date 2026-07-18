import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import { agentMemory, agentOwnerPolicies } from "@/lib/db/schema";
import {
  canonicalOwnerPolicySchema,
  canonicalPolicyApplies,
  type CanonicalOwnerPolicy,
  type PolicyCapability,
} from "@/lib/agent/policy-model";
import { computeActionProposalHash } from "@/lib/agent/proposal";

export type ActiveOwnerPolicy = CanonicalOwnerPolicy & {
  id: string;
  policyKey: string;
  status: string;
  confirmedAt: Date | null;
};

async function policyKey(policy: CanonicalOwnerPolicy): Promise<string> {
  return computeActionProposalHash({
    actionType: `owner_policy:${policy.effect}`,
    capability: [...policy.capabilities].sort().join(","),
    resourceRef: JSON.stringify(policy.resources),
    afterState: {
      conditions: policy.conditions,
      expiresAt: policy.expiresAt,
      originalText: policy.originalText,
    },
    policyVersion: policy.policyVersion,
  });
}

function fromRow(row: typeof agentOwnerPolicies.$inferSelect): ActiveOwnerPolicy {
  const canonical = canonicalOwnerPolicySchema.parse({
    effect: row.effect,
    capabilities: row.capabilities,
    resources: row.resources,
    conditions: row.conditions,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    source: row.source,
    originalText: row.originalText,
    parserVersion: row.parserVersion,
    policyVersion: row.policyVersion,
  });
  return {
    ...canonical,
    id: row.id,
    policyKey: row.policyKey,
    status: row.status,
    confirmedAt: row.confirmedAt,
  };
}

/** Insert canonical policies without overwriting history; identical active rows dedupe. */
export async function persistOwnerPolicies(
  scope: BrandScope,
  policies: readonly CanonicalOwnerPolicy[],
  options: { confirmed?: boolean; supersedesId?: string | null } = {},
): Promise<ActiveOwnerPolicy[]> {
  const stored: ActiveOwnerPolicy[] = [];
  for (const policy of policies) {
    const parsed = canonicalOwnerPolicySchema.parse(policy);
    const key = await policyKey(parsed);
    const [inserted] = await getDb()
      .insert(agentOwnerPolicies)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        policyKey: key,
        effect: parsed.effect,
        capabilities: parsed.capabilities,
        resources: parsed.resources,
        conditions: parsed.conditions,
        originalText: parsed.originalText,
        source: parsed.source,
        parserVersion: parsed.parserVersion,
        policyVersion: parsed.policyVersion,
        expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
        confirmedAt: options.confirmed ? new Date() : null,
        supersedesId: options.supersedesId ?? null,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) {
      stored.push(fromRow(inserted));
      continue;
    }
    const [existing] = await getDb()
      .select()
      .from(agentOwnerPolicies)
      .where(
        and(
          eq(agentOwnerPolicies.brandId, scope.brandId),
          eq(agentOwnerPolicies.policyKey, key),
          eq(agentOwnerPolicies.status, "active"),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("Owner policy could not be saved");
    stored.push(fromRow(existing));
  }
  return stored;
}

export async function listActiveOwnerPolicies(
  brandId: string,
  now = new Date(),
): Promise<ActiveOwnerPolicy[]> {
  const rows = await getDb()
    .select()
    .from(agentOwnerPolicies)
    .where(
      and(
        eq(agentOwnerPolicies.brandId, brandId),
        eq(agentOwnerPolicies.status, "active"),
        or(isNull(agentOwnerPolicies.expiresAt), gt(agentOwnerPolicies.expiresAt, now)),
      ),
    )
    .orderBy(asc(agentOwnerPolicies.createdAt));
  return rows.map(fromRow);
}

export async function revokeOwnerPolicy(
  scope: BrandScope,
  policyId: string,
): Promise<boolean> {
  const now = new Date();
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(agentOwnerPolicies)
      .set({ status: "revoked", revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(agentOwnerPolicies.id, policyId),
          eq(agentOwnerPolicies.workspaceId, scope.workspaceId),
          eq(agentOwnerPolicies.brandId, scope.brandId),
          eq(agentOwnerPolicies.status, "active"),
        ),
      )
      .returning({
        id: agentOwnerPolicies.id,
        effect: agentOwnerPolicies.effect,
        capabilities: agentOwnerPolicies.capabilities,
        originalText: agentOwnerPolicies.originalText,
      });
    if (!row) return false;
    if (row.effect === "allow" && row.capabilities.length > 0) {
      await tx
        .update(agentMemory)
        .set({ status: "revoked", updatedAt: now })
        .where(
          and(
            eq(agentMemory.brandId, scope.brandId),
            eq(agentMemory.kind, "permission"),
            inArray(agentMemory.key, row.capabilities),
            eq(agentMemory.status, "active"),
          ),
        );
    }
    if (row.effect === "deny") {
      await tx
        .update(agentMemory)
        .set({ status: "revoked", updatedAt: now })
        .where(
          and(
            eq(agentMemory.brandId, scope.brandId),
            eq(agentMemory.kind, "constraint"),
            eq(agentMemory.status, "active"),
            sql`${agentMemory.value}->>'instruction' = ${row.originalText}`,
          ),
        );
    }
    return true;
  });
}

export async function supersedeOwnerPolicy(
  scope: BrandScope,
  policyId: string,
  replacements: readonly CanonicalOwnerPolicy[],
): Promise<ActiveOwnerPolicy[]> {
  const now = new Date();
  if (!(await revokeOwnerPolicy(scope, policyId))) {
    throw new Error("Active owner policy not found");
  }
  const [previous] = await getDb()
    .update(agentOwnerPolicies)
    .set({ status: "superseded", revokedAt: null, updatedAt: now })
    .where(
      and(
        eq(agentOwnerPolicies.id, policyId),
        eq(agentOwnerPolicies.workspaceId, scope.workspaceId),
        eq(agentOwnerPolicies.brandId, scope.brandId),
        eq(agentOwnerPolicies.status, "revoked"),
      ),
    )
    .returning({ id: agentOwnerPolicies.id });
  if (!previous) throw new Error("Owner policy could not be superseded");
  return persistOwnerPolicies(scope, replacements, {
    confirmed: true,
    supersedesId: previous.id,
  });
}

export type PolicySimulationInput = {
  capability: PolicyCapability;
  resourceRef: string;
  destination?: string | null;
  categories?: readonly string[];
  approvalValidated?: boolean;
};

export function simulateOwnerPolicies(
  policies: readonly Pick<ActiveOwnerPolicy, "id" | "effect" | "capabilities" | "resources" | "conditions" | "originalText">[],
  input: PolicySimulationInput,
): { decision: "allow" | "deny" | "no_match"; matchingPolicyIds: string[]; reason: string } {
  const matching = policies.filter((policy) => canonicalPolicyApplies(policy, input));
  const denied = matching.filter((policy) => policy.effect === "deny");
  if (denied.length > 0) {
    return {
      decision: "deny",
      matchingPolicyIds: denied.map((policy) => policy.id),
      reason: `Blocked by owner policy: ${denied[0]?.originalText ?? "restriction"}`,
    };
  }
  const allowed = matching.filter((policy) => policy.effect === "allow");
  if (allowed.length > 0) {
    const requiresApproval = allowed.some((policy) =>
      policy.conditions.some((condition) => condition.type === "requires_approval"),
    );
    return {
      decision: requiresApproval && !input.approvalValidated ? "no_match" : "allow",
      matchingPolicyIds: allowed.map((policy) => policy.id),
      reason: requiresApproval
        ? "The matching owner policy requires a validated action approval."
        : "Allowed by an explicitly confirmed owner policy.",
    };
  }
  return { decision: "no_match", matchingPolicyIds: [], reason: "No canonical owner policy matched." };
}
