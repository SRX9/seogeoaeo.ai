import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { logError, logInfo } from "@/lib/logging/logger";
import { sendWeeklyReports } from "@/server/reports/weekly";
import { getAgentSafetyDecision } from "@/lib/agent/safety";

/**
 * AP5: the weekly report. Cloudflare's scheduled handler POSTs here every
 * Monday; each owned site on an active subscription gets Claudia's full weekly
 * report (both halves of her job, one ask max) emailed to the workspace owner
 * and archived at /reports.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const safety = getAgentSafetyDecision("publishing", { actor: "agent" });
  if (!safety.allowed) {
    return NextResponse.json({ ok: true, disabled: true, reason: safety.reason });
  }

  try {
    const sent = await sendWeeklyReports();
    logInfo("cron.digest.completed", { sent });
    return NextResponse.json({ ok: true, sent });
  } catch (error) {
    logError("cron.digest.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
