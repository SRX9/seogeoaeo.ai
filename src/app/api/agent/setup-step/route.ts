import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import {
  executeSetupStep,
  finalizeSetupRun,
  SETUP_STEPS,
  type SetupStepKey,
} from "@/lib/jobs/setup-run";

type SetupStepBody = {
  workspaceId: string;
  brandId: string;
  planId?: string | null;
  /** One of SETUP_STEPS' keys, or "finalize" to settle the run. */
  step: string;
};

const STEP_KEYS = new Set<string>(SETUP_STEPS.map((s) => s.key));

/**
 * Workflow step callback: run exactly one Setup Run step (or finalize) for a
 * brand. Called by the `SetupRunWorkflow` Worker; each call persists the step's
 * outcome before returning, so the Workflow's checkpoint and the DB agree. A
 * thrown step returns 500: persisted as `failed`: and the Workflow retries.
 */
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as SetupStepBody;
  const scope = { workspaceId: body.workspaceId, brandId: body.brandId };

  if (body.step === "finalize") {
    const run = await finalizeSetupRun(scope);
    return NextResponse.json({ status: run?.status ?? "failed" });
  }

  if (!STEP_KEYS.has(body.step)) {
    return NextResponse.json({ error: `Unknown step "${body.step}"` }, { status: 400 });
  }

  try {
    const step = await executeSetupStep(scope, body.planId ?? null, body.step as SetupStepKey);
    return NextResponse.json({ status: step.status, note: step.note ?? null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
