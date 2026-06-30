// Manual smoke-test endpoint for the daily content agent. Give it just a
// workspaceId + brandId (query string or JSON body) and it derives the rest
// (brand name, plan, today's runDate) and kicks off ONE DailyBrandWorkflow
// instance — the same thing the daily cron does per brand, on demand.
//
// Gated behind CRON_SECRET so it can't be hit publicly. Needs the AGENT_WORKFLOW
// binding, so it only works on the Cloudflare runtime (deployed worker or
// `pnpm preview:cf`), not plain `next dev`.
//
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     "https://seogeoaeo.ai/api/agent/test-run?workspaceId=<ws>&brandId=<brand>"
//
// Optional `?planId=scale` overrides the plan (handy if the workspace has no
// active subscription — otherwise the run resolves to cap 0 and writes nothing).
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCloudflareRequestContext } from "@/lib/cloudflare/context";
import { getBrand } from "@/lib/brand/repository";
import { isCronAuthorized } from "@/lib/cron/auth";
import { getDb } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { getUtcDayKey } from "@/lib/workspace/settings";

async function resolve(request: Request) {
  const url = new URL(request.url);
  let workspaceId = url.searchParams.get("workspaceId") ?? "";
  let brandId = url.searchParams.get("brandId") ?? "";
  let planId = url.searchParams.get("planId");

  if (request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as {
      workspaceId?: string;
      brandId?: string;
      planId?: string;
    };
    workspaceId = body.workspaceId ?? workspaceId;
    brandId = body.brandId ?? brandId;
    planId = body.planId ?? planId;
  }

  return { workspaceId, brandId, planId };
}

async function handle(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, brandId, planId: planOverride } = await resolve(request);
  if (!workspaceId || !brandId) {
    return NextResponse.json(
      { error: "Provide workspaceId and brandId (query string or JSON body)." },
      { status: 400 },
    );
  }

  const workflow = getCloudflareRequestContext()?.env?.AGENT_WORKFLOW;
  if (!workflow) {
    return NextResponse.json(
      { error: "AGENT_WORKFLOW binding not available — run on Cloudflare (deploy or `pnpm preview:cf`)." },
      { status: 503 },
    );
  }

  const brand = await getBrand(workspaceId, brandId);
  if (!brand) {
    return NextResponse.json({ error: "Brand not found in that workspace." }, { status: 404 });
  }

  // Derive the plan from the workspace's subscription unless overridden.
  let planId = planOverride ?? null;
  if (!planId) {
    const [sub] = await getDb()
      .select({ planId: subscriptions.planId })
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId))
      .limit(1);
    planId = sub?.planId ?? null;
  }

  const runDate = getUtcDayKey();
  const params = { workspaceId, brandId, brandName: brand.name, planId, runDate };

  // Fresh id each call so you can re-trigger freely (the real daily run uses the
  // idempotent `daily-<brandId>-<runDate>` id instead).
  const id = `test-${brandId}-${Date.now()}`;
  const instance = await workflow.create({ id, params });

  return NextResponse.json({ ok: true, instanceId: instance.id, params });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
