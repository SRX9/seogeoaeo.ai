import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { researchForDaily } from "@/lib/jobs/daily";

type ResearchBody = {
  workspaceId: string;
  brandId: string;
  budget: number;
  /** Workflow instance id: keys research idempotency so a retry never duplicates. */
  idempotencyKey: string;
};

/** Workflow step: one quality-safe research run to top up the topic queue. */
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as ResearchBody;
  const result = await researchForDaily(
    { workspaceId: body.workspaceId, brandId: body.brandId },
    body.budget,
    body.idempotencyKey,
  );
  return NextResponse.json(result);
}
