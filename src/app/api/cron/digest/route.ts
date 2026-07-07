import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { logError, logInfo } from "@/lib/logging/logger";
import { sendWeeklyReports } from "@/server/reports/weekly";

/**
 * AP5 — the weekly report. Cloudflare's scheduled handler POSTs here every
 * Monday; each owned site on an active subscription gets Claudia's full weekly
 * report (both halves of her job, one ask max) emailed to the workspace owner
 * and archived at /reports.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
