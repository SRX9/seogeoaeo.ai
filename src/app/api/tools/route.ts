import { desc, eq } from "drizzle-orm";
import { getApiContext, handleApi, jsonOk } from "@/lib/api/server";
import { getDb } from "@/lib/db";
import { toolRuns } from "@/lib/db/schema/visibility";

/**
 * V8.3 — latest run per tool, for the Toolbox grid. Lets each card show its
 * last score and run time so the grid reads as a results overview, not just a
 * launcher.
 */
export async function GET() {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const rows = await getDb()
      .select({ slug: toolRuns.slug, score: toolRuns.score, createdAt: toolRuns.createdAt })
      .from(toolRuns)
      .where(eq(toolRuns.workspaceId, workspace.id))
      .orderBy(desc(toolRuns.createdAt))
      .limit(200);

    const latest: Record<string, { score: number | null; createdAt: Date }> = {};
    for (const row of rows) {
      if (!latest[row.slug]) latest[row.slug] = { score: row.score, createdAt: row.createdAt };
    }
    return jsonOk({ latest });
  });
}
