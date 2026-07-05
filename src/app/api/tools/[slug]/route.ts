import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { getApiContext, handleApi, HttpError, jsonOk, parseBody, readJson } from "@/lib/api/server";
import { getDb } from "@/lib/db";
import { toolRuns } from "@/lib/db/schema/visibility";
import {
  assertVisibilityCredits,
  InsufficientCreditsError,
  spendForVisibilityJob,
} from "@/lib/usage/credits";
import { persistNewFindings } from "@/lib/visibility/findings-repository";
import { getTool } from "@/lib/visibility/toolbox-registry";

/**
 * V8.3 — run one Toolbox tool: meter (refId = run id) → the analyzer's dual-mode
 * `run()` → persist the run + push its findings into the shared fix queue.
 */

/** Double-submit window: an identical run inside this window returns the stored result. */
const DEDUP_WINDOW_MS = 15_000;

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const { slug } = await params;
    const tool = getTool(slug);
    if (!tool) throw new HttpError(404, "Unknown tool");

    const { input } = parseBody(z.object({ input: z.string().min(1).max(200_000) }), await readJson(request));
    const db = getDb();

    // Double-click / retry guard: the credit ledger's refId idempotency can't help
    // here because each request mints a fresh run id — so dedupe at the run level.
    // An identical (workspace, tool, input) run within the window is the same
    // click: return it without re-running, re-charging, or re-inserting findings.
    const [recent] = await db
      .select()
      .from(toolRuns)
      .where(
        and(
          eq(toolRuns.workspaceId, workspace.id),
          eq(toolRuns.slug, slug),
          gt(toolRuns.createdAt, new Date(Date.now() - DEDUP_WINDOW_MS)),
        ),
      )
      .orderBy(desc(toolRuns.createdAt))
      .limit(1);
    if (recent && (recent.input as { input?: string } | null)?.input === input) {
      return jsonOk({ runId: recent.id, score: recent.score, findings: [], data: recent.result });
    }

    // Pre-check (402) without charging; charge only after tool.run() succeeds so a
    // failed run (e.g. an unreachable/invalid URL) never burns credits.
    try {
      await assertVisibilityCredits(workspace.id, tool.costKey);
    } catch (error) {
      if (error instanceof InsufficientCreditsError) throw new HttpError(402, error.message);
      throw error;
    }

    const runId = crypto.randomUUID();
    const result = await tool.run(input);
    await db.insert(toolRuns).values({
      id: runId,
      workspaceId: workspace.id,
      slug,
      input: { input },
      result: result.data ?? null,
      score: result.score,
    });
    await persistNewFindings(workspace.id, result.findings, { toolRunId: runId });

    await spendForVisibilityJob(workspace.id, tool.costKey, runId);
    return jsonOk({ runId, score: result.score, findings: result.findings, data: result.data });
  });
}
