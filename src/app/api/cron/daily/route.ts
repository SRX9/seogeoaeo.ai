import { NextResponse } from "next/server";
import { getCloudflareRequestContext } from "@/lib/cloudflare/context";
import { listBrands } from "@/lib/brand/repository";
import { isCronAuthorized } from "@/lib/cron/auth";
import { listActiveWorkspaceIds } from "@/lib/jobs/enumerate";
import { isWorkflowInstanceExistsError } from "@/lib/jobs/workflow";
import { logError, logInfo } from "@/lib/logging/logger";
import { getUtcDayKey } from "@/lib/workspace/settings";

const BATCH_SIZE = 100; // Cloudflare Workflows `createBatch` ceiling.

type InstanceOptions = { id: string; params: Record<string, unknown> };

/**
 * Daily enumerator. Cloudflare's scheduled handler POSTs here once a day; this
 * route does *no* content work itself — it lists every active brand and fans them
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

  const instances: InstanceOptions[] = [];
  for (const ws of workspaces) {
    const brands = await listBrands(ws.workspaceId);
    for (const brand of brands) {
      instances.push({
        id: `daily-${brand.id}-${runDate}`,
        params: {
          workspaceId: ws.workspaceId,
          brandId: brand.id,
          brandName: brand.name,
          planId: ws.planId,
          runDate,
        },
      });
    }
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;
  for (let i = 0; i < instances.length; i += BATCH_SIZE) {
    const chunk = instances.slice(i, i + BATCH_SIZE);
    try {
      await workflow.createBatch(chunk);
      created += chunk.length;
    } catch {
      // A batch fails if any id already exists (same-day re-fire). Fall back to
      // per-instance creation so the brands that haven't run yet still enqueue.
      for (const instance of chunk) {
        try {
          await workflow.create(instance);
          created += 1;
        } catch (error) {
          if (isWorkflowInstanceExistsError(error)) {
            skipped += 1; // already enqueued for today — idempotent, safe to drop.
            continue;
          }
          // Transient (rate limit, binding, API blip). Do NOT count as skipped:
          // this brand never enqueued, so the failure must be surfaced (below) to
          // get a retry instead of silently dropping the day's run.
          failed += 1;
          logError("cron.daily.create_failed", {
            instanceId: instance.id,
            brandId: instance.params.brandId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  logInfo("cron.daily.enqueued", {
    runDate,
    workspaces: workspaces.length,
    brands: instances.length,
    created,
    skipped,
    failed,
  });

  // Real failures must not look like success: return 5xx so the scheduled
  // handler logs the failure (and any alerting fires) and the cron can be
  // re-fired. Re-firing is safe — created instances collide on their id and are
  // skipped, so only the dropped brands re-enqueue.
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
