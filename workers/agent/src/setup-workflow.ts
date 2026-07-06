import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { appCaller, RETRIES, type AppEnv } from "./app-call";

/** Instance params, set by `triggerSetupRun` in the app. */
type Params = {
  workspaceId: string;
  brandId: string;
  planId?: string | null;
};

/**
 * Ordered step keys — must mirror SETUP_STEPS in `src/lib/jobs/setup-run.ts`.
 * The app tolerates unknown/extra keys (parseSteps), so a drift here degrades
 * to a 400 on that one step rather than corrupting the run.
 */
const STEP_KEYS = [
  "first_audit",
  "seed_prompts",
  "answer_check",
  "competitor_baseline",
  "topic_research",
  "quick_win_fixes",
  "first_article",
  "day0_brief",
] as const;

/**
 * Heavy steps run full site audits (up to 50 gated page fetches) or long LLM
 * generations — they need real wall clock. The rest settle in seconds.
 */
const HEAVY_STEPS = new Set<string>([
  "first_audit",
  "answer_check",
  "competitor_baseline",
  "topic_research",
  "first_article",
]);

type StepResult = { status: string; note?: string | null };

/**
 * Claudia's Setup Run (AP2), made durable. One instance per ignition; each
 * setup step is a checkpointed `step.do` calling back into the app, where the
 * real DB/LLM/audit logic lives and every outcome is persisted before the call
 * returns. Isolate death costs at most one step's retry — never the run. A step
 * that exhausts its retries is left `failed` (already persisted app-side) and
 * the pipeline continues, so one broken step can't strand setup in `running`.
 */
export class SetupRunWorkflow extends WorkflowEntrypoint<AppEnv, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const p = event.payload;
    const post = appCaller<StepResult>(this.env, "/api/agent/setup-step");
    const call = (stepKey: string) =>
      post({
        workspaceId: p.workspaceId,
        brandId: p.brandId,
        planId: p.planId ?? null,
        step: stepKey,
      });

    const outcomes: Record<string, string> = {};
    for (const key of STEP_KEYS) {
      try {
        const result = await step.do(
          `step:${key}`,
          { retries: RETRIES, timeout: HEAVY_STEPS.has(key) ? "10 minutes" : "5 minutes" },
          () => call(key),
        );
        outcomes[key] = result.status;
      } catch {
        // The app already persisted the step as failed; setup must keep moving.
        outcomes[key] = "failed";
      }
    }

    const settled = await step.do("finalize", { retries: RETRIES }, () => call("finalize"));
    return { run: settled.status, steps: outcomes };
  }
}
