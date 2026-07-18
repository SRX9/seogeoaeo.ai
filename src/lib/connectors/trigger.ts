import type { BrandScope } from "@/lib/brand/repository";
import { getCloudflareRequestContext } from "@/lib/cloudflare/context";
import { runConnectorMutationInline } from "@/lib/connectors/service";
import { createWorkflowInstance } from "@/lib/jobs/workflow";

type TriggerableMutation = {
  id: string;
  status: string;
};

export type ConnectorMutationTriggerResult = {
  mutationId: string;
  status: string;
  ok: boolean;
  mode: "no_op" | "settled" | "workflow" | "inline";
  enqueue?: "created" | "exists" | "restarted";
};

export class ConnectorTriggerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ConnectorTriggerError";
  }
}

/**
 * Start the durable mutation saga. The deterministic Workflow id turns a lost
 * owner response or double-submit into the same instance instead of a second
 * remote write. Plain Next.js runtimes execute the same persisted protocol
 * inline so local development does not silently strand a prepared mutation.
 */
export async function triggerConnectorMutation(
  scope: BrandScope,
  mutation: TriggerableMutation,
): Promise<ConnectorMutationTriggerResult> {
  if (mutation.status === "no_op") {
    return {
      mutationId: mutation.id,
      status: mutation.status,
      ok: true,
      mode: "no_op",
    };
  }
  if (mutation.status === "verified") {
    return {
      mutationId: mutation.id,
      status: mutation.status,
      ok: true,
      mode: "settled",
    };
  }
  if (
    ![
      "prepared",
      "writing",
      "applied",
      "verification_failed",
      "rollback_pending",
      "rollback_failed",
    ].includes(mutation.status)
  ) {
    throw new ConnectorTriggerError(
      409,
      "mutation_not_triggerable",
      `Connector mutation cannot start from ${mutation.status}.`,
    );
  }

  const workflow = getCloudflareRequestContext()?.env?.MUTATION_WORKFLOW;
  if (workflow) {
    const instanceId = `connector-${mutation.id}`;
    let enqueue: "created" | "exists" | "restarted" = await createWorkflowInstance(workflow, {
      id: instanceId,
      params: {
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        mutationId: mutation.id,
      },
    });
    if (enqueue === "exists") {
      const instance = await workflow.get(instanceId);
      const state = await instance.status();
      if (["errored", "terminated", "complete"].includes(state.status)) {
        await instance.restart();
        enqueue = "restarted";
      } else if (state.status === "unknown") {
        throw new ConnectorTriggerError(
          503,
          "workflow_state_unknown",
          "The existing connector workflow state could not be verified.",
        );
      }
    }
    return {
      mutationId: mutation.id,
      status: mutation.status,
      ok: true,
      mode: "workflow",
      enqueue,
    };
  }

  if (process.env.NODE_ENV === "production") {
    throw new ConnectorTriggerError(
      503,
      "workflow_unavailable",
      "The durable connector workflow is unavailable; no live write was started.",
    );
  }

  const result = await runConnectorMutationInline(scope, mutation.id);
  return { ...result, mode: "inline" };
}
