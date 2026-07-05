import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { logError, logInfo } from "@/lib/logging/logger";
import { sendWeeklyDigests } from "@/server/visibility/digest";

/**
 * AP5 — the weekly report. Cloudflare's scheduled handler POSTs here every
 * Monday; each owned site on an active subscription gets Claudia's proof-stack
 * digest emailed to the workspace owner.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sent = await sendWeeklyDigests();
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
