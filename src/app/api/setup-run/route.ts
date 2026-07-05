import { handleApi, HttpError, jsonOk, requireApiBrand } from "@/lib/api/server";
import { isActiveSubscription } from "@/lib/billing/plans";
import { getCloudflareRequestContext } from "@/lib/cloudflare/context";
import { executeSetupRun, getSetupRun, startSetupRun, SETUP_STEPS } from "@/lib/jobs/setup-run";

/**
 * Ignition (AP2): start Claudia's one-time Setup Run for the active brand.
 * Paid-first — requires an active subscription (Stripe `trialing` counts).
 * Idempotent: an existing run is returned as-is; a failed run is resumed.
 */
export async function POST() {
  return handleApi(async () => {
    const { subscription, scope } = await requireApiBrand();
    if (!isActiveSubscription(subscription?.status)) {
      throw new HttpError(402, "Pick a plan to start Claudia's Setup Run.", { code: "NO_SUBSCRIPTION" });
    }

    const { run, created } = await startSetupRun(scope);
    // Execute (or resume a failed run) in the background; the client polls GET.
    if (created || run.status === "failed") {
      const work = executeSetupRun(scope, subscription?.planId).catch((error) => {
        console.error("[setup-run] execution failed", error);
      });
      const ctx = getCloudflareRequestContext()?.ctx as
        | { waitUntil?: (promise: Promise<unknown>) => void }
        | undefined;
      if (ctx?.waitUntil) ctx.waitUntil(work);
    }

    return jsonOk({ run: { id: run.id, status: run.status, steps: run.steps } }, { status: 202 });
  });
}

/** Setup Run status for the active brand — powers the live progress card. */
export async function GET() {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const run = await getSetupRun(scope.brandId);
    return jsonOk({
      run: run
        ? { id: run.id, status: run.status, steps: run.steps, briefText: run.briefText }
        : null,
      labels: Object.fromEntries(SETUP_STEPS.map((s) => [s.key, s.label])),
    });
  });
}
