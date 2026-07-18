import { NextResponse } from "next/server";
import { getCloudflareRequestContext } from "@/lib/cloudflare/context";
import { isCronAuthorized } from "@/lib/cron/auth";
import { enqueueWorkflowInstances, type InstanceOptions } from "@/lib/jobs/workflow";
import { logError, logInfo } from "@/lib/logging/logger";
import { getUtcDayKey } from "@/lib/workspace/settings";
import { listDueSites, reauditSite, settleStaleAudits, type DueSite } from "@/server/visibility/cron";
import { getAgentSafetyDecision } from "@/lib/agent/safety";

/**
 * V7.3/V8.5: scheduled visibility monitoring. Cloudflare's scheduled handler
 * POSTs here daily; this route does no audit work itself. It lists the sites
 * due on their plan's cadence (weekly/monthly: most days most sites are a
 * no-op) and fans each out into one durable `AuditRunWorkflow` instance
 * (mode "monitor"): create → execute → fixes/delta/alert, checkpointed and
 * retried per step. The id `reaudit-<dayKey>-<baselineAuditId>` makes a
 * same-day re-fire collide and skip; a failed run gets a fresh id (and a fresh
 * try) the next day because its baseline is unchanged. Also sweeps audits
 * stranded in `running`: the only daily hook shared by every audit producer.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const safety = getAgentSafetyDecision("observation", { actor: "agent" });
  if (!safety.allowed) {
    return NextResponse.json({ ok: true, disabled: true, reason: safety.reason });
  }

  try {
    const stale = await settleStaleAudits();
    if (stale > 0) logInfo("cron.visibility.stale_settled", { count: stale });

    const sites = await listDueSites();
    const workflow = getCloudflareRequestContext()?.env?.AUDIT_WORKFLOW;

    if (!workflow) {
      // Inline fallback (plain `next dev`): sequential, no durability.
      let alerts = 0;
      for (const site of sites) {
        try {
          if (await reauditSite(site)) alerts += 1;
        } catch (error) {
          logError("cron.visibility.reaudit_failed", {
            siteUrl: site.siteUrl,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      logInfo("cron.visibility.completed", { mode: "inline", sites: sites.length, alerts });
      return NextResponse.json({ ok: true, mode: "inline", sites: sites.length, alerts });
    }

    const dayKey = getUtcDayKey();
    const instances: InstanceOptions[] = sites.map((site: DueSite) => ({
      id: `reaudit-${dayKey}-${site.id}`,
      params: {
        mode: "monitor",
        workspaceId: site.workspaceId,
        siteUrl: site.siteUrl,
        baselineAuditId: site.id,
        planId: site.planId,
      },
    }));

    const { created, skipped, failed } = await enqueueWorkflowInstances(
      workflow,
      instances,
      "cron.visibility",
    );

    logInfo("cron.visibility.enqueued", { dayKey, sites: sites.length, created, skipped, failed });
    // Real failures must not look like success: re-firing is safe (created
    // instances collide on their id), so only the dropped sites re-enqueue.
    if (failed > 0) {
      return NextResponse.json(
        { ok: false, sites: sites.length, created, skipped, failed },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, sites: sites.length, created, skipped, failed });
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
