import { NextResponse } from "next/server";
import { getCloudflareRequestContext } from "@/lib/cloudflare/context";
import { listBrands } from "@/lib/brand/repository";
import { isCronAuthorized } from "@/lib/cron/auth";
import { listActiveWorkspaceIds } from "@/lib/jobs/enumerate";
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
        } catch {
          skipped += 1; // already enqueued for today, or transient — safe to drop.
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
  });
  return NextResponse.json({ ok: true, runDate, brands: instances.length, created, skipped });
}

export async function POST(request: Request) {
  return GET(request);
}
