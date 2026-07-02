import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getApiContext, handleApi, HttpError, jsonOk, parseBody, readJson } from "@/lib/api/server";
import { getDb } from "@/lib/db";
import { brandProfiles, brands } from "@/lib/db/schema/brand";
import { answerRuns, trackedPrompts } from "@/lib/db/schema/visibility";
import {
  assertVisibilityCredits,
  InsufficientCreditsError,
  spendForVisibilityJob,
} from "@/lib/usage/credits";
import { computeShare, type EngineName, runAnswerCheck } from "@/lib/visibility/answers";
import { suggestPrompts } from "@/lib/visibility/prompt-suggestions";

/** Resolve the workspace's default brand. */
async function getBrandId(workspaceId: string): Promise<string> {
  const db = getDb();
  const brand = await db.query.brands.findFirst({ where: eq(brands.workspaceId, workspaceId) });
  if (!brand) throw new HttpError(404, "No brand configured for this workspace");
  return brand.id;
}

/** GET share per engine + tracked prompts + recent runs (the prompt × engine grid). */
export async function GET() {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const brandId = await getBrandId(workspace.id);
    const db = getDb();

    const prompts = await db.select().from(trackedPrompts).where(eq(trackedPrompts.brandId, brandId));
    const runs = await db
      .select()
      .from(answerRuns)
      .where(eq(answerRuns.brandId, brandId))
      .orderBy(desc(answerRuns.ranAt))
      .limit(200);

    const share = computeShare(
      runs.map((r) => ({ engine: r.engine as EngineName, brandMentioned: r.brandMentioned, brandCited: r.brandCited })),
    );
    return jsonOk({ brandId, prompts, runs, share });
  });
}

const postSchema = z.object({
  action: z.enum(["run", "seed"]).default("run"),
  prompts: z.array(z.string().min(3)).optional(),
});

/** POST { action:"run" } to query the engines; { action:"seed" } to add prompts. */
export async function POST(request: Request) {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const brandId = await getBrandId(workspace.id);
    const db = getDb();
    const { action, prompts } = parseBody(postSchema, await readJson(request));

    if (action === "seed") {
      const profile = await db.query.brandProfiles.findFirst({ where: eq(brandProfiles.brandId, brandId) });
      const seeds =
        prompts ??
        suggestPrompts({
          category: profile?.productDescription ?? undefined,
          audience: profile?.audience ?? undefined,
        });
      if (seeds.length === 0) throw new HttpError(400, "No prompts to seed");
      const rows = await db
        .insert(trackedPrompts)
        .values(seeds.map((prompt) => ({ brandId, prompt, source: prompts ? "user" : "suggested" })))
        .returning();
      return jsonOk({ prompts: rows }, { status: 201 });
    }

    // action === "run" — pre-check (402) without charging, then charge only if the
    // run produced results (at least one engine answered), so empty runs (no engine
    // keys, or no active prompts) are never billed.
    try {
      await assertVisibilityCredits(workspace.id, "answer_run");
    } catch (error) {
      if (error instanceof InsufficientCreditsError) throw new HttpError(402, error.message);
      throw error;
    }
    const result = await runAnswerCheck(brandId);
    if (result.cells.length > 0) {
      await spendForVisibilityJob(workspace.id, "answer_run", crypto.randomUUID(), brandId);
    }
    return jsonOk(result);
  });
}
