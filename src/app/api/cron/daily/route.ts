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
type CreateCounts = { created: number; skipped: number; failed: number };

const addCounts = (left: CreateCounts, right: CreateCounts): CreateCounts => ({
  created: left.created + right.created,
  skipped: left.skipped + right.skipped,
  failed: left.failed + right.failed,
});

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

  const chunks: InstanceOptions[][] = [];
  for (let i = 0; i < instances.length; i += BATCH_SIZE) {
    chunks.push(instances.slice(i, i + BATCH_SIZE));
  }

  const createOne = async (instance: InstanceOptions): Promise<CreateCounts> => {
    try {
      await workflow.create(instance);
      return { created: 1, skipped: 0, failed: 0 };
    } catch (error) {
      if (isWorkflowInstanceExistsError(error)) {
        return { created: 0, skipped: 1, failed: 0 };
      }
      logError("cron.daily.create_failed", {
        instanceId: instance.id,
        brandId: instance.params.brandId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { created: 0, skipped: 0, failed: 1 };
    }
  };

  const outcomes = await Promise.all(
    chunks.map(async (chunk): Promise<CreateCounts> => {
      try {
        await workflow.createBatch(chunk);
        return { created: chunk.length, skipped: 0, failed: 0 };
      } catch {
        // A batch fails if any id already exists. Fall back to per-instance
        // creation so the brands that have not run yet still enqueue.
        const perInstance = await Promise.all(chunk.map(createOne));
        return perInstance.reduce(addCounts, { created: 0, skipped: 0, failed: 0 });
      }
    }),
  );

  const { created, skipped, failed } = outcomes.reduce(addCounts, {
    created: 0,
    skipped: 0,
    failed: 0,
  });

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
