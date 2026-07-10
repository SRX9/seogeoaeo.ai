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
import { replanAgentWork } from "@/lib/agent/planner";

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
    const approval = await decideAgentApproval(
      scope,
      body.approvalId,
      body.decision,
      session.user.id,
    );
    if (!approval) throw new HttpError(404, "Approval not found");
    if (body.decision === "approved" && approval.actionType.startsWith("grant ")) {
      const after =
        typeof approval.afterState === "object" && approval.afterState !== null
          ? (approval.afterState as Record<string, unknown>)
          : {};
      const capability = after.capability;
      const instruction = after.instruction;
      if (typeof capability === "string" && typeof instruction === "string") {
        await rememberAgentInstruction(scope, {
          kind: "permission",
          key: capability,
          value: { capability, instruction, granted: true },
          provenance: `approval:${approval.id}`,
        });
        await replanAgentWork(scope, `Owner approved ${capability} authority.`, {
          source: "owner_approval",
          approvalId: approval.id,
          capability,
        });
      }
    }
    return jsonOk({ id: approval.id, status: approval.status });
  });
}
