import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { planDailyForBrand } from "@/lib/jobs/daily";

type PlanBody = {
  workspaceId: string;
  brandId: string;
  planId?: string | null;
  runDate: string;
};

/** Workflow step: decide a brand's budget and initial write targets for the day. */
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as PlanBody;
  const plan = await planDailyForBrand(
    { workspaceId: body.workspaceId, brandId: body.brandId },
    body.planId ?? null,
    body.runDate,
  );
  return NextResponse.json(plan);
}
