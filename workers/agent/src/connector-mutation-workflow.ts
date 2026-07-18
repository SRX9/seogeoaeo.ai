import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { appCaller, RETRIES, type AppEnv } from "./app-call";
import { createLogger } from "./logger";

type Params = {
  workspaceId: string;
  brandId: string;
  mutationId: string;
};

type CallbackResult = {
  mutationId?: string;
  status?: string;
  ok?: boolean;
};

type StepResult = {
  mutationId: string;
  status: string | null;
  ok: boolean | null;
};

const APPLY_TIMEOUT = "5 minutes";
const VERIFY_TIMEOUT = "5 minutes";
const MONITOR_TIMEOUT = "10 minutes";

const ROLLBACK_CONFIG = {
  retries: { limit: 3, delay: "30 seconds", backoff: "linear" },
  timeout: "5 minutes",
} as const;

function serializableResult(result: CallbackResult, fallbackMutationId: string): StepResult {
  return {
    mutationId:
      typeof result.mutationId === "string" && result.mutationId.length > 0
        ? result.mutationId
        : fallbackMutationId,
    status: typeof result.status === "string" ? result.status : null,
    ok: typeof result.ok === "boolean" ? result.ok : null,
  };
}

/**
 * Executes one mutation saga through the app's tenant-scoped connector route.
 * The app owns mutation idempotency, remote read-back, and persisted state;
 * this Workflow owns durable ordering and Cloudflare-native compensation.
 */
export class ConnectorMutationWorkflow extends WorkflowEntrypoint<AppEnv, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const payload = event.payload;
    const log = createLogger({
      workflow: "connector-mutation",
      instanceId: event.instanceId,
      workspaceId: payload.workspaceId,
      brandId: payload.brandId,
      mutationId: payload.mutationId,
    });
    log.info("workflow.mutation.started");
    const post = appCaller<CallbackResult>(
      this.env,
      "/api/agent/connector-mutation",
      event.instanceId,
    );
    const call = async (
      phase: "apply" | "verify" | "monitor" | "rollback",
      mutationId: string,
    ): Promise<StepResult> => {
      const result = await post({
        workspaceId: payload.workspaceId,
        brandId: payload.brandId,
        mutationId,
        step: phase,
      });
      return serializableResult(result, mutationId);
    };

    try {
      const applied = await step.do(
        "apply",
        { retries: RETRIES, timeout: APPLY_TIMEOUT },
        () => call("apply", payload.mutationId),
        {
          rollback: async ({ output }) => {
            await call("rollback", output?.mutationId ?? payload.mutationId);
          },
          rollbackConfig: ROLLBACK_CONFIG,
        },
      );

      const verified = await step.do(
        "verify",
        { retries: RETRIES, timeout: VERIFY_TIMEOUT },
        () => call("verify", applied.mutationId),
      );

      await step.sleep("post-write-observation-window", "15 minutes");

      const monitored = await step.do(
        "monitor",
        { retries: RETRIES, timeout: MONITOR_TIMEOUT },
        () => call("monitor", verified.mutationId),
      );

      log.info("workflow.mutation.completed", {
        mutationId: monitored.mutationId,
        applyStatus: applied.status,
        verifyStatus: verified.status,
        monitorStatus: monitored.status,
        ok: monitored.ok === true,
      });
      return {
        mutationId: monitored.mutationId,
        applyStatus: applied.status,
        verifyStatus: verified.status,
        monitorStatus: monitored.status,
        ok: monitored.ok,
      };
    } catch (error) {
      // Rollback handlers are guaranteed for completed steps. This explicit
      // compensation also covers an apply callback whose remote POST succeeded
      // but whose response never completed the Workflow step.
      log.error("workflow.mutation.failed", {
        error_message:
          error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      });
      await step.do(
        "failure-compensation",
        ROLLBACK_CONFIG,
        () => call("rollback", payload.mutationId),
      );
      throw error;
    }
  }
}
