import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { appCaller, type AppEnv } from "./app-call";
import { createLogger } from "./logger";

/** Instance params, set by the daily enumerator (POST /api/cron/daily). */
type Params = {
  workspaceId: string;
  brandId: string;
  brandName?: string;
  planId?: string | null;
  runDate: string;
};

type PlanResult = {
  skip: boolean;
  skipStatus: string | null;
  cap: number;
  budget: number;
  writtenToday: number;
  priorResearched: number;
  topicIds: string[];
  needsResearch: boolean;
};

type ResearchResult = { researchTopics: number; topicIds: string[] };

type WriteResult = {
  status:
    | "written"
    | "insufficient_credits"
    | "blocked"
    | "transient_failure"
    | "permanent_failure";
  articleId?: string;
  error?: string;
  errorClass?: string;
};

type WriteFailure = {
  topicId: string;
  outcome: "blocked" | "transient_failure" | "permanent_failure";
  errorClass: string;
};

// Per-step retry/backoff. Steps are HTTP calls into the app; transient failures
// (LLM hiccup, brief 5xx) retry, exhaustion surfaces as a thrown step.
const RETRIES = { limit: 3, delay: "10 seconds", backoff: "exponential" } as const;
const RESEARCH_STEP_TIMEOUT = "5 minutes";
const ARTICLE_STEP_TIMEOUT = "20 minutes";

/**
 * One UTC day of the content agent for a single brand. Durable + checkpointed:
 * plan → (optional) research → write up to the day's budget → settle. Each step
 * is a thin HTTP call to the app, where the real DB/LLM/Hyperdrive logic lives;
 * this class only orchestrates and checkpoints, so its own state stays tiny
 * (arrays of ids + counts, well under the 1 MiB per-step limit).
 */
export class DailyBrandWorkflow extends WorkflowEntrypoint<AppEnv, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const p = event.payload;
    const log = createLogger(
      {
        workflow: "daily-content-agent",
        instanceId: event.instanceId,
        workspaceId: p.workspaceId,
        brandId: p.brandId,
        runDate: p.runDate,
      },
      this.env,
    );
    log.info("workflow.daily.started");

    const call = <T>(path: string, body: Record<string, unknown>) =>
      appCaller<T>(this.env, path, event.instanceId)(body);

    // A step in here that exhausts its retries kills the whole instance; log it
    // first so the failure reaches PostHog with step context instead of only
    // the Cloudflare dashboard. The scheduled-work reconciler owns the replay.
    const fatal = <T>(stepName: string, run: () => Promise<T>): Promise<T> =>
      run().catch((error: unknown) => {
        log.error("workflow.daily.step.exhausted", {
          step: stepName,
          error_message:
            error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        });
        throw error;
      });

    // 1. Plan: budget + initial write targets.
    const plan = await fatal("plan", () =>
      step.do("plan", { retries: RETRIES }, () =>
        call<PlanResult>("/api/agent/plan", {
          workspaceId: p.workspaceId,
          brandId: p.brandId,
          planId: p.planId,
          runDate: p.runDate,
        }),
      ),
    );

    if (plan.skip) {
      const status = plan.skipStatus ?? "idle";
      log.info("workflow.daily.completed", { status, generated: 0, researchTopics: 0 });
      return { generated: 0, researchTopics: 0, status };
    }

    // 2. Research (only when the queue can't cover the budget). Idempotent on the
    //    instance id, so a retried step never duplicates topics or re-charges.
    let targets = plan.topicIds;
    let researchTopics = 0;
    if (plan.needsResearch) {
      const research = await fatal("research", () =>
        step.do("research", { retries: RETRIES, timeout: RESEARCH_STEP_TIMEOUT }, () =>
          call<ResearchResult>("/api/agent/research", {
            workspaceId: p.workspaceId,
            brandId: p.brandId,
            budget: plan.budget,
            idempotencyKey: `daily-${p.brandId}-${p.runDate}`,
          }),
        ),
      );
      researchTopics = research.researchTopics;
      targets = research.topicIds;
    }

    const writeTargets = targets.slice(0, plan.budget);
    const hadTargets = writeTargets.length > 0;

    // 3. Write up to the day's budget, one article per step. A step that exhausts
    //    its retries is isolated (caught) so one bad article never sinks the day.
    const writeSummary = await writeTargets.reduce(
      async (previous, topicId): Promise<{
        generated: number;
        outOfCredits: boolean;
        failures: WriteFailure[];
      }> => {
        const summary = await previous;
        if (summary.outOfCredits) {
          return summary;
        }

        let result: WriteResult;
        try {
          result = await step.do(
            `write:${topicId}`,
            { retries: RETRIES, timeout: ARTICLE_STEP_TIMEOUT },
            () =>
              call<WriteResult>("/api/agent/write-article", {
                workspaceId: p.workspaceId,
                brandId: p.brandId,
                topicId,
                runDate: p.runDate,
              }),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message.slice(0, 500) : "Workflow step failed";
          log.error("workflow.daily.write.exhausted", { topicId, error_message: message });
          return {
            ...summary,
            failures: [
              ...summary.failures,
              { topicId, outcome: "transient_failure", errorClass: "workflow_retry_exhausted" },
            ],
          };
        }

        if (result.status === "insufficient_credits") {
          return { ...summary, outOfCredits: true };
        }
        if (result.status === "written") {
          return { ...summary, generated: summary.generated + 1 };
        }
        return {
          ...summary,
          failures: [
            ...summary.failures,
            {
              topicId,
              outcome: result.status,
              errorClass: result.errorClass ?? result.status,
            },
          ],
        };
      },
      Promise.resolve({ generated: 0, outOfCredits: false, failures: [] as WriteFailure[] }),
    );
    const { generated, outOfCredits, failures } = writeSummary;

    // 4. Settle as independently checkpointed operations. Core persistence is
    // required; optional enrichment failures are recorded and do not erase the
    // day's completed writing work.
    const settleBody = {
        workspaceId: p.workspaceId,
        brandId: p.brandId,
        runDate: p.runDate,
        cap: plan.cap,
        writtenToday: plan.writtenToday,
        priorResearched: plan.priorResearched,
        generated,
        researchTopics,
        hadTargets,
        outOfCredits,
        writeFailures: failures,
        brandName: p.brandName,
        planId: p.planId,
      };
    const requiredSettlement = [
      "settle_daily_run",
      "settle_agent_task",
      "record_summary_job",
    ] as const;
    let settledStatus = "completed";
    for (const operation of requiredSettlement) {
      const result = await fatal(`settle:${operation}`, () =>
        step.do(`settle:${operation}`, { retries: RETRIES }, () =>
          call<{ status: string }>("/api/agent/settle", { ...settleBody, operation }),
        ),
      );
      settledStatus = result.status;
    }

    const optionalSettlement = [
      "sync_traffic",
      "performance_checkpoints",
      "update_source_weights",
      "rediscover_competitors",
      "site_health",
      "refresh_brief",
      "send_notifications",
    ] as const;
    const settlementFailures: string[] = [];
    for (const operation of optionalSettlement) {
      try {
        await step.do(`settle:${operation}`, { retries: RETRIES }, () =>
          call<{ status: string }>("/api/agent/settle", { ...settleBody, operation }),
        );
      } catch (error) {
        settlementFailures.push(operation);
        log.error("workflow.daily.settlement.degraded", {
          operation,
          error_message:
            error instanceof Error ? error.message.slice(0, 500) : "Unknown failure",
        });
      }
    }

    const status =
      settlementFailures.length && settledStatus === "completed"
        ? "completed_degraded"
        : settledStatus;
    log.info("workflow.daily.completed", {
      status,
      generated,
      researchTopics,
      failures: failures.length,
      settlementFailures: settlementFailures.length,
      outOfCredits,
    });
    return {
      generated,
      researchTopics,
      failures: failures.length,
      settlementFailures,
      status,
    };
  }
}
