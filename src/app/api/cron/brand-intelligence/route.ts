import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import {
  isBrandIntelligenceConfigured,
  listDueBrandIntelligence,
  refreshBrandIntelligence,
} from "@/lib/brand/intelligence";
import { logError, logInfo } from "@/lib/logging/logger";

const CONCURRENCY = 5;

/** Daily due-date sweep; each individual brand becomes eligible only every 30 days. */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isBrandIntelligenceConfigured()) {
    return NextResponse.json({ ok: true, skipped: "CONTEXT_DEV_API_KEY is not configured" });
  }

  try {
    const due = await listDueBrandIntelligence(25);
    let refreshed = 0;
    let failed = 0;

    for (let offset = 0; offset < due.length; offset += CONCURRENCY) {
      const batch = due.slice(offset, offset + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((item) =>
          refreshBrandIntelligence(
            { workspaceId: item.workspaceId, brandId: item.brandId },
            item.website!,
          ),
        ),
      );
      results.forEach((result, index) => {
        if (result.status === "fulfilled" && result.value) {
          refreshed += 1;
          return;
        }
        failed += 1;
        logError("cron.brand_intelligence.brand_failed", {
          brandId: batch[index]?.brandId,
          error: result.status === "rejected" ? String(result.reason) : "No brand data returned",
        });
      });
    }

    logInfo("cron.brand_intelligence.completed", { due: due.length, refreshed, failed });
    const partial = refreshed > 0 && failed > 0;
    const sweepFailed = failed > 0 && refreshed === 0;
    return NextResponse.json({
      ok: !sweepFailed,
      partial,
      due: due.length,
      refreshed,
      failed,
    }, { status: sweepFailed ? 500 : 200 });
  } catch (error) {
    logError("cron.brand_intelligence.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Brand intelligence refresh failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
