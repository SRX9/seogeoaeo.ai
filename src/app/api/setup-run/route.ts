import { handleApi, HttpError, jsonOk, requireApiBrand } from "@/lib/api/server";
import { isActiveSubscription } from "@/lib/billing/plans";
import {
  getSetupRun,
  isSetupRunStale,
  resumeStaleSetupRun,
  startSetupRun,
  triggerSetupRun,
  SETUP_STEPS,
} from "@/lib/jobs/setup-run";

/**
 * Ignition (AP2): start Claudia's one-time Setup Run for the active brand.
 * Paid-first — requires an active subscription (Stripe `trialing` counts).
 * Idempotent: an existing run is returned as-is; a failed run — or one stranded
 * in `running` by a killed executor — is resumed. Execution happens in a
 * durable `SetupRunWorkflow` instance (see `triggerSetupRun`), so this request
 * returns immediately and the client polls GET.
 */
export async function POST() {
  return handleApi(async () => {
    const { subscription, scope } = await requireApiBrand();
    if (!isActiveSubscription(subscription?.status)) {
      throw new HttpError(402, "Pick a plan to start Claudia's Setup Run.", { code: "NO_SUBSCRIPTION" });
    }

    const { run, created } = await startSetupRun(scope);
    if (created || run.status === "failed" || isSetupRunStale(run)) {
      await triggerSetupRun(scope, subscription?.planId, run, { resume: !created });
    }

    return jsonOk({ run: { id: run.id, status: run.status, steps: run.steps } }, { status: 202 });
  });
}

/**
 * Setup Run status for the active brand — powers the live progress card. Also
 * self-heals: a run stranded in `running` (executor killed before any step
 * persisted) is resumed here, so the poller itself un-wedges the run instead
 * of showing an eternal spinner.
 */
export async function GET() {
  return handleApi(async () => {
    const { scope, subscription } = await requireApiBrand();
    const run = await getSetupRun(scope.brandId);
    if (run && isActiveSubscription(subscription?.status)) {
      await resumeStaleSetupRun(scope, subscription?.planId, run);
    }
    return jsonOk({
      run: run
        ? { id: run.id, status: run.status, steps: run.steps, briefText: run.briefText }
        : null,
      labels: Object.fromEntries(SETUP_STEPS.map((s) => [s.key, s.label])),
    });
  });
}
