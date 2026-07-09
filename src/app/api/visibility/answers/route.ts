import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { assertNoSetupRunning, handleApi, HttpError, jsonOk, parseBody, readJson, requireApiBrand } from "@/lib/api/server";
import { effectiveVisibilityCaps } from "@/lib/billing/plans";
import { getDb } from "@/lib/db";
import { brandProfiles } from "@/lib/db/schema/brand";
import { answerRuns, trackedPrompts } from "@/lib/db/schema/visibility";
import { assertWorkspaceRateLimit, RateLimitError } from "@/lib/security/rate-limit";
import {
  assertVisibilityCredits,
  InsufficientCreditsError,
  spendForVisibilityJob,
} from "@/lib/usage/credits";
import { computeShare, type EngineName, runAnswerCheck } from "@/lib/visibility/answers";
import { persistNewFindings } from "@/lib/visibility/findings-repository";
import { suggestPrompts } from "@/lib/visibility/prompt-suggestions";

/** GET share per engine + tracked prompts + recent runs (the prompt × engine grid). */
export async function GET() {
  return handleApi(async () => {
    const { brand } = await requireApiBrand();
    const brandId = brand.id;
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
  prompts: z.array(z.string().min(3).max(300)).max(100).optional(),
});

/** POST { action:"run" } to query the engines; { action:"seed" } to add prompts. */
export async function POST(request: Request) {
  return handleApi(async () => {
    const { workspace, subscription, brand } = await requireApiBrand();
    const brandId = brand.id;
    await assertNoSetupRunning(brandId);
    const db = getDb();
    const { action, prompts } = parseBody(postSchema, await readJson(request));

    if (action === "seed") {
      // Plan cap: tracked prompts bound the answer-run fan-out (prompts × engines
      // external calls per run), so seeding must never exceed the plan allowance.
      const cap = effectiveVisibilityCaps(subscription).trackedPrompts;
      if (cap <= 0) throw new HttpError(402, "Your plan doesn't include tracked prompts.");
      const [{ activeCount }] = await db
        .select({ activeCount: count() })
        .from(trackedPrompts)
        .where(and(eq(trackedPrompts.brandId, brandId), eq(trackedPrompts.active, true)));
      const remaining = cap - activeCount;
      if (remaining <= 0) {
        throw new HttpError(400, `Tracked-prompt limit reached (${cap} on your plan).`);
      }
      const profile = await db.query.brandProfiles.findFirst({ where: eq(brandProfiles.brandId, brandId) });
      const seeds = (
        prompts ??
        suggestPrompts({
          category: profile?.productDescription ?? undefined,
          audience: profile?.audience ?? undefined,
        })
      ).slice(0, remaining);
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
    // Single-flight guard: the charge's refId is minted per request, so ledger
    // idempotency can't dedupe a double-click on its own. The workspace limiter
    // increments atomically in Postgres, so two concurrent "run" requests can't
    // both pass — the loser gets a 429 instead of a second fan-out + charge.
    try {
      await assertWorkspaceRateLimit(workspace.id, "answer_run", 1, 30_000);
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw new HttpError(429, "An answer check just ran — give it a moment before rerunning.");
      }
      throw error;
    }
    const result = await runAnswerCheck(brandId);
    if (result.cells.length > 0) {
      await spendForVisibilityJob(workspace.id, "answer_run", crypto.randomUUID(), brandId);
    }
    // Persist answer-gap findings into the shared fix queue (dedup lives in the
    // repository, shared with audits and Toolbox runs).
    await persistNewFindings(workspace.id, result.findings, { brandId });
    return jsonOk(result);
  });
}
