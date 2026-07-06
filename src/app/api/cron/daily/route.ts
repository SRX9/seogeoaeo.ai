import { NextResponse } from "next/server";
import { getCloudflareRequestContext } from "@/lib/cloudflare/context";
import { listBrands } from "@/lib/brand/repository";
import { isCronAuthorized } from "@/lib/cron/auth";
import { listActiveWorkspaceIds } from "@/lib/jobs/enumerate";
import { enqueueWorkflowInstances, type InstanceOptions } from "@/lib/jobs/workflow";
import { logError, logInfo } from "@/lib/logging/logger";
import { getUtcDayKey } from "@/lib/workspace/settings";

/**
 * Daily enumerator. Cloudflare's scheduled handler POSTs here once a day; this
 * route does no content work itself. It lists every active brand and fans them
 * out into one `DailyBrandWorkflow` instance each. The instance id
 * `daily-<brandId>-<runDate>` makes enqueue idempotent: a same-day re-fire
 * collides on the id and is skipped, so the durable Workflow (not this request)
 * owns retries and per-article checkpointing.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workflow = getCloudflareRequestContext()?.env?.AGENT_WORKFLOW;
  if (!workflow) {
    logError("cron.daily.no_workflow_binding", {});
    return NextResponse.json(
      { error: "AGENT_WORKFLOW binding is not available" },
      { status: 500 },
    );
  }

  const runDate = getUtcDayKey();
  const workspaces = await listActiveWorkspaceIds();

  const brandsByWorkspace = await Promise.all(
    workspaces.map(async (ws) => ({
      ws,
      brands: await listBrands(ws.workspaceId),
    })),
  );

  const instances: InstanceOptions[] = brandsByWorkspace.flatMap(({ ws, brands }) =>
    brands.map((brand) => ({
      id: `daily-${brand.id}-${runDate}`,
      params: {
        workspaceId: ws.workspaceId,
        brandId: brand.id,
        brandName: brand.name,
        planId: ws.planId,
        runDate,
      },
    })),
  );

  const { created, skipped, failed } = await enqueueWorkflowInstances(
    workflow,
    instances,
    "cron.daily",
  );

  logInfo("cron.daily.enqueued", {
    runDate,
    workspaces: workspaces.length,
    brands: instances.length,
    created,
    skipped,
    failed,
  });

  // Real failures must not look like success: return 5xx so the scheduled
  // handler logs the failure and the cron can be re-fired. Re-firing is safe:
  // created instances collide on their id and are skipped, so only the dropped
  // brands re-enqueue.
  if (failed > 0) {
    return NextResponse.json(
      { ok: false, runDate, brands: instances.length, created, skipped, failed },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, runDate, brands: instances.length, created, skipped, failed });
}

export async function POST(request: Request) {
  return GET(request);
}
