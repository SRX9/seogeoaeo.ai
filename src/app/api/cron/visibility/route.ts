import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { sendToWorkspaceOwner } from "@/lib/email/notify";
import { visibilityAlertEmail } from "@/lib/email/templates";
import { getServerEnv } from "@/lib/env";
import { logError, logInfo } from "@/lib/logging/logger";
import { reauditActiveSites } from "@/server/visibility/cron";

/**
 * V7.3/V8.5 — scheduled visibility monitoring. Cloudflare's scheduled handler
 * POSTs here daily; `reauditActiveSites` gates each site on its plan's cadence
 * (weekly/monthly), so most days most sites are a no-op. Alerts (score drop /
 * new critical) are emailed to the workspace owner and logged.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const alerts = await reauditActiveSites();
    const origin = getServerEnv().BETTER_AUTH_URL ?? "https://seogeoaeo.ai";
    for (const alert of alerts) {
      // Deliver immediately — a drop/critical shouldn't wait for the weekly digest.
      await sendToWorkspaceOwner(
        alert.workspaceId,
        visibilityAlertEmail({
          siteUrl: alert.siteUrl,
          reasons: alert.reasons,
          dashboardUrl: `${origin}/dashboard`,
        }),
      );
      logInfo("cron.visibility.alert", {
        workspaceId: alert.workspaceId,
        siteUrl: alert.siteUrl,
        auditId: alert.auditId,
        reasons: alert.reasons,
      });
    }
    logInfo("cron.visibility.completed", { alerts: alerts.length });
    return NextResponse.json({ ok: true, alerts: alerts.length });
  } catch (error) {
    logError("cron.visibility.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
