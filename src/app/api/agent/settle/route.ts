import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { settleDailyForBrand } from "@/lib/jobs/daily";

type SettleBody = {
  workspaceId: string;
  brandId: string;
  runDate: string;
  cap: number;
  writtenToday: number;
  priorResearched: number;
  generated: number;
  researchTopics: number;
  hadTargets: boolean;
  outOfCredits: boolean;
  brandName?: string;
};

/** Workflow step: record the day's final state and (if paused) email the owner. */
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as SettleBody;
  const status = await settleDailyForBrand(
    { workspaceId: body.workspaceId, brandId: body.brandId },
    body.runDate,
    {
      cap: body.cap,
      writtenToday: body.writtenToday,
      priorResearched: body.priorResearched,
      generated: body.generated,
      researchTopics: body.researchTopics,
      hadTargets: body.hadTargets,
      outOfCredits: body.outOfCredits,
      brandName: body.brandName,
    },
  );
  return NextResponse.json({ ok: true, status });
}
