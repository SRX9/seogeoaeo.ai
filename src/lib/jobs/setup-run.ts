import { and, desc, eq } from "drizzle-orm";
import { generateArticleFromTopic } from "@/lib/articles/generate";
import { listPendingTopicsForWriting } from "@/lib/articles/repository";
import { visibilityCapsForPlan, dailyArticleCapForPlan } from "@/lib/billing/plans";
import { discoverCompetitors } from "@/lib/brand/enrich";
import {
  createCompetitor,
  getBrand,
  getBrandProfile,
  listCompetitors,
  type BrandScope,
} from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import { auditFindings, audits, setupRuns, trackedPrompts } from "@/lib/db/schema";
import { createAgentJob, finishAgentJob } from "@/lib/jobs/repository";
import { generateJson, getLlmConfig } from "@/lib/llm/client";
import { day0BriefPrompt, seedTrackedPromptsPrompt } from "@/lib/llm/prompts";
import { logError, logInfo } from "@/lib/logging/logger";
import { runResearch } from "@/lib/research/run";
import { recentAnswerExcerpts, runAnswerCheck } from "@/lib/visibility/answers";
import { applyFix } from "@/lib/visibility/apply-fix";
import { runAudit } from "@/server/visibility/run-audit";

/**
 * AP2 — Claudia's Setup Run: the one-time ignition pipeline that onboards a new
 * brand with zero user steps. Everything derives from the brand profile; steps
 * that lack their input are *skipped with a note*, never blocked on the user.
 *
 * Idempotency: one `setup_runs` row per brand (unique index). Each step's status
 * is persisted after it settles, and a re-fired run resumes from the first step
 * that isn't done/skipped — so a retry never double-runs an expensive step.
 * Setup Run cost is plan-included: no step spends credits.
 */

export const SETUP_STEPS = [
  { key: "first_audit", label: "Auditing your site" },
  { key: "seed_prompts", label: "Writing the questions buyers ask AI" },
  { key: "answer_check", label: "Asking ChatGPT, Perplexity, and Gemini about your category" },
  { key: "competitor_baseline", label: "Sizing up your competitor" },
  { key: "topic_research", label: "Researching what to write first" },
  { key: "quick_win_fixes", label: "Applying quick-win fixes" },
  { key: "first_article", label: "Writing your first article" },
  { key: "day0_brief", label: "Writing your Day-0 brief" },
] as const;

export type SetupStepKey = (typeof SETUP_STEPS)[number]["key"];
export type SetupStepStatus = "pending" | "running" | "done" | "skipped" | "failed";
export type SetupStep = { key: SetupStepKey; status: SetupStepStatus; note?: string };

function initialSteps(): SetupStep[] {
  return SETUP_STEPS.map((s) => ({ key: s.key, status: "pending" }));
}

function parseSteps(json: string): SetupStep[] {
  try {
    const parsed = JSON.parse(json) as SetupStep[];
    // Tolerate step-list evolution: keep known steps' state, add new ones pending.
    return SETUP_STEPS.map(
      (s) => parsed.find((p) => p.key === s.key) ?? { key: s.key, status: "pending" as const },
    );
  } catch {
    return initialSteps();
  }
}

export async function getSetupRun(brandId: string) {
  const [row] = await getDb().select().from(setupRuns).where(eq(setupRuns.brandId, brandId)).limit(1);
  if (!row) return null;
  return { ...row, steps: parseSteps(row.stepsJson) };
}

/**
 * Create the brand's setup-run row if it doesn't exist. Returns the run and
 * whether this call created it (only the creator should execute the pipeline).
 */
export async function startSetupRun(scope: BrandScope) {
  const existing = await getSetupRun(scope.brandId);
  if (existing) return { run: existing, created: false };
  const [row] = await getDb()
    .insert(setupRuns)
    .values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      status: "running",
      stepsJson: JSON.stringify(initialSteps()),
    })
    .onConflictDoNothing({ target: setupRuns.brandId })
    .returning();
  // Lost a concurrent-insert race — the other caller owns execution.
  if (!row) {
    const winner = await getSetupRun(scope.brandId);
    return { run: winner!, created: false };
  }
  return { run: { ...row, steps: parseSteps(row.stepsJson) }, created: true };
}

async function saveRun(
  runId: string,
  steps: SetupStep[],
  patch: { status?: string; briefText?: string } = {},
) {
  await getDb()
    .update(setupRuns)
    .set({ stepsJson: JSON.stringify(steps), updatedAt: new Date(), ...patch })
    .where(eq(setupRuns.id, runId));
}

/** Latest completed audit for the workspace's own site — feeds the fix step. */
async function latestOwnAuditId(workspaceId: string, siteUrl: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ id: audits.id })
    .from(audits)
    .where(and(eq(audits.workspaceId, workspaceId), eq(audits.siteUrl, siteUrl), eq(audits.status, "complete")))
    .orderBy(desc(audits.createdAt))
    .limit(1);
  return row?.id ?? null;
}

const MAX_SETUP_FIXES = 10;

/**
 * Execute (or resume) the brand's Setup Run. Steps run in order; a skipped
 * input-less step is fine, a thrown step marks the run failed so a later
 * re-trigger resumes from it. Returns the final run state.
 */
export async function executeSetupRun(scope: BrandScope, planId: string | null | undefined) {
  const run = await getSetupRun(scope.brandId);
  if (!run || run.status === "completed") return run;

  const brand = await getBrand(scope.workspaceId, scope.brandId);
  if (!brand) throw new Error("Brand not found");
  const profile = await getBrandProfile(scope.brandId);
  const website = profile?.website?.trim() || null;
  const caps = visibilityCapsForPlan(planId);
  const steps = run.steps;
  const facts: string[] = [];

  const runStep = async (key: SetupStepKey, fn: () => Promise<string | { skip: string }>) => {
    const step = steps.find((s) => s.key === key)!;
    if (step.status === "done" || step.status === "skipped") {
      if (step.note) facts.push(`${key}: ${step.note}`);
      return;
    }
    step.status = "running";
    await saveRun(run.id, steps, { status: "running" });
    const result = await fn();
    if (typeof result === "object") {
      step.status = "skipped";
      step.note = result.skip;
    } else {
      step.status = "done";
      step.note = result;
      facts.push(`${key}: ${result}`);
    }
    await saveRun(run.id, steps);
  };

  try {
    await runStep("first_audit", async () => {
      if (!website) return { skip: "No website on the brand profile yet." };
      const auditId = await runAudit(scope.workspaceId, website);
      const [audit] = await getDb().select().from(audits).where(eq(audits.id, auditId)).limit(1);
      return audit?.overallScore != null
        ? `Visibility score ${Math.round(audit.overallScore)}/100.`
        : "First audit complete.";
    });

    await runStep("seed_prompts", async () => {
      if (caps.trackedPrompts <= 0) return { skip: "Plan has no tracked prompts." };
      const db = getDb();
      const existing = await db
        .select({ id: trackedPrompts.id })
        .from(trackedPrompts)
        .where(eq(trackedPrompts.brandId, scope.brandId))
        .limit(1);
      if (existing.length > 0) return { skip: "Prompts already exist." };
      if (!getLlmConfig()) return { skip: "LLM not configured." };
      const prompt = seedTrackedPromptsPrompt(
        {
          name: brand.name,
          website,
          productDescription: profile?.productDescription,
          audience: profile?.audience,
          seedKeywords: profile?.seedKeywords,
        },
        caps.trackedPrompts,
      );
      const { data } = await generateJson<{ prompts?: unknown }>("light", [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ]);
      const list = (Array.isArray(data?.prompts) ? data.prompts : [])
        .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
        .map((p) => p.trim().slice(0, 300))
        .slice(0, caps.trackedPrompts);
      if (list.length === 0) return { skip: "Could not generate prompts." };
      await db
        .insert(trackedPrompts)
        .values(list.map((p) => ({ brandId: scope.brandId, prompt: p, source: "suggested" })));
      return `Seeded ${list.length} buyer questions to track.`;
    });

    await runStep("answer_check", async () => {
      const result = await runAnswerCheck(scope.brandId);
      if (result.cells.length === 0) return { skip: "No prompts or engines available yet." };
      const best = [...result.share].sort((a, b) => b.appeared - a.appeared)[0];
      return best
        ? `In ${best.appeared} of ${best.prompts} ${best.engine} answers today.`
        : "First answer check complete.";
    });

    await runStep("competitor_baseline", async () => {
      let comps = await listCompetitors(scope.brandId);
      if (comps.length === 0 && caps.competitors > 0) {
        // answer_check already ran, so real AI answers exist as discovery
        // evidence — brands the engines name are the truest rivals.
        const answerExcerpts = await recentAnswerExcerpts(scope.brandId);
        const suggestions = await discoverCompetitors(
          {
            name: brand.name,
            website,
            productDescription: profile?.productDescription,
            seedKeywords: profile?.seedKeywords,
            answerExcerpts,
          },
          1,
        );
        if (suggestions[0]) {
          await createCompetitor(scope, { ...suggestions[0], rssUrl: "", sitemapUrl: "" });
          comps = await listCompetitors(scope.brandId);
        }
      }
      const rival = comps[0];
      if (!rival) return { skip: "No competitor found yet." };
      await runAudit(scope.workspaceId, rival.url);
      return `Benchmarked ${rival.name}.`;
    });

    await runStep("topic_research", async () => {
      const research = await runResearch(scope, { idempotencyKey: `setup-${scope.brandId}` });
      return `Queued ${research.topicsCreated} article topics.`;
    });

    await runStep("quick_win_fixes", async () => {
      if (!website) return { skip: "No website to fix." };
      if (brand.autonomyMode !== "FULL_AUTO") return { skip: "Copilot mode — fixes queued for your approval." };
      const auditId = await latestOwnAuditId(scope.workspaceId, website);
      if (!auditId) return { skip: "No completed audit to fix from." };
      const findings = await getDb()
        .select({ id: auditFindings.id })
        .from(auditFindings)
        .where(
          and(
            eq(auditFindings.auditId, auditId),
            eq(auditFindings.fixCapability, "auto"),
            eq(auditFindings.isResolved, false),
          ),
        )
        .limit(Math.min(caps.autoFixCap || 0, MAX_SETUP_FIXES));
      if (findings.length === 0) return { skip: "No auto-applicable fixes found." };
      for (const finding of findings) {
        await applyFix(finding.id, scope.workspaceId);
      }
      return `Applied ${findings.length} quick-win fix${findings.length === 1 ? "" : "es"}.`;
    });

    await runStep("first_article", async () => {
      if (dailyArticleCapForPlan(planId) <= 0) return { skip: "Plan has no article allowance." };
      const [topic] = await listPendingTopicsForWriting(scope.brandId, 1);
      if (!topic) return { skip: "No topics queued yet." };
      // Plan-included: the setup run's job is to show value on day 0, so it doesn't meter.
      await generateArticleFromTopic(scope, topic.id, { skipCreditCheck: true, origin: "setup_run" });
      return `Wrote "${topic.title}".`;
    });

    await runStep("day0_brief", async () => {
      let brief =
        `I've set myself up on ${brand.name}. ` +
        "I'll keep auditing, fixing, and writing on your plan's cadence — your weekly report will show exactly what moved.";
      if (getLlmConfig() && facts.length > 0) {
        try {
          const prompt = day0BriefPrompt(brand.name, facts.join("\n"));
          const { data } = await generateJson<{ brief?: unknown }>("light", [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ]);
          if (typeof data?.brief === "string" && data.brief.trim()) brief = data.brief.trim().slice(0, 2000);
        } catch {
          // Fall back to the deterministic brief — the run must still complete.
        }
      }
      await saveRun(run.id, steps, { briefText: brief });
      return "Day-0 brief ready.";
    });

    await saveRun(run.id, steps, { status: "completed" });
    const job = await createAgentJob(scope, "setup_run", "Claudia's Setup Run");
    await finishAgentJob(job.id, "completed", "Setup Run complete — Claudia is on the job.", {
      steps: steps.map((s) => ({ key: s.key, status: s.status })),
    });
    logInfo("setup_run.completed", { workspaceId: scope.workspaceId, brandId: scope.brandId });
  } catch (error) {
    const failing = steps.find((s) => s.status === "running");
    if (failing) {
      failing.status = "failed";
      failing.note = error instanceof Error ? error.message : String(error);
    }
    await saveRun(run.id, steps, { status: "failed" });
    logError("setup_run.failed", {
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return getSetupRun(scope.brandId);
}
