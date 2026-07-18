import { z } from "zod";
import {
  decideAgentApproval,
  listPendingAgentApprovals,
} from "@/lib/agent/events";
import {
  handleApi,
  HttpError,
  jsonOk,
  parseBody,
  readJson,
  requireApiBrand,
} from "@/lib/api/server";
import { rememberAgentInstruction } from "@/lib/agent/memory";
import { persistOwnerPolicies } from "@/lib/agent/policies";
import { canonicalOwnerPolicySchema } from "@/lib/agent/policy-model";
import { replanAgentWork } from "@/lib/agent/planner";
import { isConnectorCapability } from "@/lib/integrations/capabilities";

export async function GET() {
  return handleApi(async () => {
    const { brand } = await requireApiBrand();
    const approvals = await listPendingAgentApprovals(brand.id);
    return jsonOk({
      approvals: approvals.map((approval) => ({
        id: approval.id,
        taskId: approval.taskId,
        actionType: approval.actionType,
        resourceRef: approval.resourceRef,
        capability: approval.capability,
        destination: approval.destination,
        proposalHash: approval.proposalHash,
        policyVersion: approval.policyVersion,
        beforeState: approval.beforeState,
        afterState: approval.afterState,
        riskLevel: approval.riskLevel,
        expectedBenefit: approval.expectedBenefit,
        expiresAt: approval.expiresAt?.toISOString() ?? null,
        createdAt: approval.createdAt.toISOString(),
      })),
    });
  });
}

const decisionSchema = z.object({
  approvalId: z.string().uuid(),
  decision: z.enum(["approved", "rejected", "deferred"]),
});

export async function PATCH(request: Request) {
  return handleApi(async () => {
    const { session, scope } = await requireApiBrand();
    const body = parseBody(decisionSchema, await readJson(request));
    const decision = await decideAgentApproval(
      scope,
      body.approvalId,
      body.decision,
      session.user.id,
    );
    if (!decision) throw new HttpError(404, "Approval not found");
    const { approval } = decision;
    if (decision.expired) throw new HttpError(409, "Approval has expired");
    if (!decision.changed && approval.status !== body.decision) {
      throw new HttpError(409, `Approval was already ${approval.status}`);
    }
    if (body.decision === "approved" && approval.actionType.startsWith("grant ")) {
      const after =
        typeof approval.afterState === "object" && approval.afterState !== null
          ? (approval.afterState as Record<string, unknown>)
          : {};
      const capability = after.capability;
      const instruction = after.instruction;
      const expiresAt =
        typeof after.expiresAt === "string" ? new Date(after.expiresAt) : null;
      if (isConnectorCapability(capability) && typeof instruction === "string") {
        const parsedPolicies = Array.isArray(after.policies)
          ? after.policies.flatMap((policy) => {
              const parsed = canonicalOwnerPolicySchema.safeParse(policy);
              return parsed.success ? [parsed.data] : [];
            })
          : [];
        if (parsedPolicies.length === 0) {
          throw new HttpError(409, "Permission proposal has no valid canonical policy");
        }
        await persistOwnerPolicies(scope, parsedPolicies, { confirmed: true });
        await rememberAgentInstruction(scope, {
          kind: "permission",
          key: capability,
          value: { capability, instruction, granted: true },
          provenance: `approval:${approval.id}`,
          expiresAt:
            expiresAt && Number.isFinite(expiresAt.getTime()) ? expiresAt : null,
        });
        if (decision.changed) {
          try {
            await replanAgentWork(scope, `Owner approved ${capability} authority.`, {
              source: "owner_approval",
              approvalId: approval.id,
              capability,
            });
          } catch (error) {
            // The permission itself is durable and retry-safe; a plan-history
            // annotation must not make the approved authority look unsaved.
            console.error("[agent] approval replan failed", error);
          }
        }
      }
    }
    return jsonOk({
      id: approval.id,
      status: approval.status,
      proposalHash: approval.proposalHash,
    });
  });
}
