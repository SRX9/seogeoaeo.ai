import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

/** Bindings/vars this Worker needs — it talks to the app over HTTP, no DB. */
type Env = {
  /** Shared bearer token the app's /api/agent/* routes check. */
  CRON_SECRET: string;
  /** Origin of the Next.js app, e.g. https://seogeoaeo.ai. */
  APP_ORIGIN: string;
};

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
  status: "written" | "insufficient_credits" | "skipped" | "failed";
  articleId?: string;
};

// Per-step retry/backoff. Steps are HTTP calls into the app; transient failures
// (LLM hiccup, brief 5xx) retry, exhaustion surfaces as a thrown step.
const RETRIES = { limit: 3, delay: "10 seconds", backoff: "exponential" } as const;
const STEP_TIMEOUT = "5 minutes";

/**
 * One UTC day of the content agent for a single brand. Durable + checkpointed:
 * plan → (optional) research → write up to the day's budget → settle. Each step
 * is a thin HTTP call to the app, where the real DB/LLM/Hyperdrive logic lives;
 * this class only orchestrates and checkpoints, so its own state stays tiny
 * (arrays of ids + counts, well under the 1 MiB per-step limit).
 */
export class DailyBrandWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const p = event.payload;

    const call = async <T>(path: string, body: unknown): Promise<T> => {
      const res = await fetch(new URL(path, this.env.APP_ORIGIN), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.env.CRON_SECRET}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${path} → ${res.status} ${text.slice(0, 300)}`);
      }
      return (await res.json()) as T;
    };

    // 1. Plan: budget + initial write targets.
    const plan = await step.do("plan", { retries: RETRIES }, () =>
      call<PlanResult>("/api/agent/plan", {
        workspaceId: p.workspaceId,
        brandId: p.brandId,
        planId: p.planId,
        runDate: p.runDate,
      }),
    );

    if (plan.skip) {
      return { generated: 0, researchTopics: 0, status: plan.skipStatus ?? "idle" };
    }

    // 2. Research (only when the queue can't cover the budget). Idempotent on the
    //    instance id, so a retried step never duplicates topics or re-charges.
    let targets = plan.topicIds;
    let researchTopics = 0;
    if (plan.needsResearch) {
      const research = await step.do("research", { retries: RETRIES, timeout: STEP_TIMEOUT }, () =>
        call<ResearchResult>("/api/agent/research", {
          workspaceId: p.workspaceId,
          brandId: p.brandId,
          budget: plan.budget,
          idempotencyKey: event.instanceId,
        }),
      );
      researchTopics = research.researchTopics;
      targets = research.topicIds;
    }

    const writeTargets = targets.slice(0, plan.budget);
    const hadTargets = writeTargets.length > 0;

    // 3. Write up to the day's budget, one article per step. A step that exhausts
    //    its retries is isolated (caught) so one bad article never sinks the day.
    const writeSummary = await writeTargets.reduce(
      async (previous, topicId): Promise<{ generated: number; outOfCredits: boolean }> => {
        const summary = await previous;
        if (summary.outOfCredits) {
          return summary;
        }

        let result: WriteResult;
        try {
          result = await step.do(
            `write:${topicId}`,
            { retries: RETRIES, timeout: STEP_TIMEOUT },
            () =>
              call<WriteResult>("/api/agent/write-article", {
                workspaceId: p.workspaceId,
                brandId: p.brandId,
                topicId,
                runDate: p.runDate,
              }),
          );
        } catch {
          return summary;
        }

        if (result.status === "insufficient_credits") {
          return { ...summary, outOfCredits: true };
        }
        if (result.status === "written") {
          return { ...summary, generated: summary.generated + 1 };
        }
        return summary;
      },
      Promise.resolve({ generated: 0, outOfCredits: false }),
    );
    const { generated, outOfCredits } = writeSummary;

    // 4. Settle: record final state + (if paused) email the owner.
    const settle = await step.do("settle", { retries: RETRIES }, () =>
      call<{ status: string }>("/api/agent/settle", {
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
        brandName: p.brandName,
        planId: p.planId,
      }),
    );

    return { generated, researchTopics, status: settle.status };
  }
}
