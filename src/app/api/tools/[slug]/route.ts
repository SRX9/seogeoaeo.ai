import { z } from "zod";
import { getApiContext, handleApi, HttpError, jsonOk, parseBody, readJson } from "@/lib/api/server";
import { getDb } from "@/lib/db";
import { auditFindings, toolRuns } from "@/lib/db/schema/visibility";
import { InsufficientCreditsError, spendForVisibilityJob } from "@/lib/usage/credits";
import { getTool } from "@/lib/visibility/toolbox-registry";

/**
 * V8.3 — run one Toolbox tool: meter (refId = run id) → the analyzer's dual-mode
 * `run()` → persist the run + push its findings into the shared fix queue.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const { slug } = await params;
    const tool = getTool(slug);
    if (!tool) throw new HttpError(404, "Unknown tool");

    const { input } = parseBody(z.object({ input: z.string().min(1).max(200_000) }), await readJson(request));
    const runId = crypto.randomUUID();
    try {
      await spendForVisibilityJob(workspace.id, tool.costKey, runId);
    } catch (error) {
      if (error instanceof InsufficientCreditsError) throw new HttpError(402, error.message);
      throw error;
    }

    const result = await tool.run(input);
    const db = getDb();
    await db.insert(toolRuns).values({
      id: runId,
      workspaceId: workspace.id,
      slug,
      input: { input },
      result: result.data ?? null,
      score: result.score,
    });
    if (result.findings.length > 0) {
      await db.insert(auditFindings).values(
        result.findings.map((f) => ({
          workspaceId: workspace.id,
          toolRunId: runId,
          pillar: f.pillar,
          category: f.category,
          severity: f.severity,
          title: f.title,
          recommendation: f.recommendation,
          fixCapability: f.fix_capability ?? null,
          fixPayload: f.fix_payload ?? null,
        })),
      );
    }

    return jsonOk({ runId, score: result.score, findings: result.findings, data: result.data });
  });
}
