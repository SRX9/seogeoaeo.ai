import { and, desc, eq } from "drizzle-orm";
import { generateArticleFromTopic } from "@/lib/articles/generate";
import { listPendingTopicsForWriting } from "@/lib/articles/repository";
import { visibilityCapsForPlan, dailyArticleCapForPlan, isActiveSubscription } from "@/lib/billing/plans";
import { discoverCompetitors } from "@/lib/brand/enrich";
import {
  createCompetitor,
  getBrand,
  getBrandProfile,
  listCompetitors,
  type BrandScope,
} from "@/lib/brand/repository";
import { getCloudflareRequestContext } from "@/lib/cloudflare/context";
import { getDb } from "@/lib/db";
import { auditFindings, audits, setupRuns, trackedPrompts } from "@/lib/db/schema";
import { createAgentJob, finishAgentJob } from "@/lib/jobs/repository";
import { isWorkflowInstanceExistsError } from "@/lib/jobs/workflow";
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
 * Execution model: the pipeline is durable, not a single background promise.
 * `triggerSetupRun` creates a `SetupRunWorkflow` instance (Cloudflare Workflows,
 * same pattern as the daily content agent); the Workflow calls back into
 * `/api/agent/setup-step` once per step, and each step persists its status the
 * moment it settles. An isolate eviction mid-step costs at most that step's
 * retry — never the run. A failed step (after retries) is recorded and the
 * pipeline moves on, so one broken step can't wedge setup in `running` forever.
 *
 * Idempotency: one `setup_runs` row per brand (unique index); a re-run of an
 * already-done/skipped step is a no-op. Setup Run cost is plan-included: no
 * step spends credits.
 *
 * Outside Cloudflare (plain `next dev`, no SETUP_WORKFLOW binding) the whole
 * pipeline falls back to running inline in the request's `waitUntil`.
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

/**
 * A `running` run whose row hasn't been touched in this long is presumed dead.
 * Steps persist as they settle and the heaviest single step (a full audit) fits
 * well inside this window, so silence this long means the executor was killed.
 */
const STALE_RUNNING_MS = 15 * 60 * 1000;

/** Should a trigger take over a run that claims to still be running? */
export function isSetupRunStale(
  run: { status: string; updatedAt: Date },
  now: number = Date.now(),
): boolean {
  return run.status === "running" && now - run.updatedAt.getTime() >= STALE_RUNNING_MS;
}

export async function getSetupRun(brandId: string) {
  const [row] = await getDb().select().from(setupRuns).where(eq(setupRuns.brandId, brandId)).limit(1);
  if (!row) return null;
  return { ...row, steps: parseSteps(row.stepsJson) };
}

/**
 * Create the brand's setup-run row if it doesn't exist. Returns the run and
 * whether this call created it (only the creator should trigger the pipeline).
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

/** Everything a step runner needs; loaded fresh per step so runners are self-contained. */
type StepContext = {
  scope: BrandScope;
  runId: string;
  steps: SetupStep[];
  brand: NonNullable<Awaited<ReturnType<typeof getBrand>>>;
  profile: Awaited<ReturnType<typeof getBrandProfile>>;
  website: string | null;
  caps: ReturnType<typeof visibilityCapsForPlan>;
  planId: string | null | undefined;
};

/** Notes from settled steps — the raw material for the Day-0 brief. */
function factsFromSteps(steps: SetupStep[]): string[] {
  return steps
    .filter((s) => s.status === "done" && s.note)
    .map((s) => `${s.key}: ${s.note}`);
}

type StepResult = string | { skip: string };

const stepRunners: Record<SetupStepKey, (ctx: StepContext) => Promise<StepResult>> = {
  first_audit: async ({ scope, website }) => {
    if (!website) return { skip: "No website on the brand profile yet." };
    const auditId = await runAudit(scope.workspaceId, website);
    const [audit] = await getDb().select().from(audits).where(eq(audits.id, auditId)).limit(1);
    return audit?.overallScore != null
      ? `Visibility score ${Math.round(audit.overallScore)}/100.`
      : "First audit complete.";
  },

  seed_prompts: async ({ scope, brand, profile, website, caps }) => {
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
  },

  answer_check: async ({ scope }) => {
    const result = await runAnswerCheck(scope.brandId);
    if (result.cells.length === 0) return { skip: "No prompts or engines available yet." };
    const best = [...result.share].sort((a, b) => b.appeared - a.appeared)[0];
    return best
      ? `In ${best.appeared} of ${best.prompts} ${best.engine} answers today.`
      : "First answer check complete.";
  },

  competitor_baseline: async ({ scope, brand, profile, website, caps }) => {
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
    // "benchmark": scores a rival under our workspace — must never surface as
    // the owner's score (summary/badge/baseline) or write fix-queue findings.
    await runAudit(scope.workspaceId, rival.url, "benchmark");
    return `Benchmarked ${rival.name}.`;
  },

  topic_research: async ({ scope }) => {
    const research = await runResearch(scope, { idempotencyKey: `setup-${scope.brandId}` });
    return `Queued ${research.topicsCreated} article topics.`;
  },

  quick_win_fixes: async ({ scope, brand, website, caps }) => {
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
  },

  first_article: async ({ scope, planId }) => {
    if (dailyArticleCapForPlan(planId) <= 0) return { skip: "Plan has no article allowance." };
    const [topic] = await listPendingTopicsForWriting(scope.brandId, 1);
    if (!topic) return { skip: "No topics queued yet." };
    // Plan-included: the setup run's job is to show value on day 0, so it doesn't meter.
    await generateArticleFromTopic(scope, topic.id, { skipCreditCheck: true, origin: "setup_run" });
    return `Wrote "${topic.title}".`;
  },

  day0_brief: async ({ brand, runId, steps }) => {
    const facts = factsFromSteps(steps);
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
    await saveRun(runId, steps, { briefText: brief });
    return "Day-0 brief ready.";
  },
};

/**
 * Execute exactly one step of the brand's Setup Run and persist its outcome.
 * Idempotent: a step already done/skipped is returned as-is. A thrown step is
 * persisted as `failed` (with the error as its note) and rethrown so the caller
 * (the Workflow) can retry it; a later retry re-runs a failed step.
 */
export async function executeSetupStep(
  scope: BrandScope,
  planId: string | null | undefined,
  key: SetupStepKey,
): Promise<SetupStep> {
  const run = await getSetupRun(scope.brandId);
  if (!run) throw new Error("Setup run not found");
  const steps = run.steps;
  const step = steps.find((s) => s.key === key)!;
  if (run.status === "completed" || step.status === "done" || step.status === "skipped") {
    return step;
  }

  const brand = await getBrand(scope.workspaceId, scope.brandId);
  if (!brand) throw new Error("Brand not found");
  const profile = await getBrandProfile(scope.brandId);
  const ctx: StepContext = {
    scope,
    runId: run.id,
    steps,
    brand,
    profile,
    website: profile?.website?.trim() || null,
    caps: visibilityCapsForPlan(planId),
    planId,
  };

  step.status = "running";
  await saveRun(run.id, steps, { status: "running" });
  try {
    const result = await stepRunners[key](ctx);
    if (typeof result === "object") {
      step.status = "skipped";
      step.note = result.skip;
    } else {
      step.status = "done";
      step.note = result;
    }
    await saveRun(run.id, steps);
    return step;
  } catch (error) {
    step.status = "failed";
    step.note = error instanceof Error ? error.message : String(error);
    await saveRun(run.id, steps);
    logError("setup_run.step_failed", {
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      step: key,
      error: step.note,
    });
    throw error;
  }
}

/**
 * Settle the run once every step has been attempted. Failed steps don't block
 * completion (they're visible in the step list); only a run where *nothing*
 * succeeded is marked failed, which surfaces the Resume button in the hero.
 */
export async function finalizeSetupRun(scope: BrandScope) {
  const run = await getSetupRun(scope.brandId);
  if (!run) throw new Error("Setup run not found");
  if (run.status === "completed") return run;
  const steps = run.steps;
  const anySucceeded = steps.some((s) => s.status === "done" || s.status === "skipped");
  const status = anySucceeded ? "completed" : "failed";
  await saveRun(run.id, steps, { status });
  if (anySucceeded) {
    const job = await createAgentJob(scope, "setup_run", "Claudia's Setup Run");
    await finishAgentJob(job.id, "completed", "Setup Run complete — Claudia is on the job.", {
      steps: steps.map((s) => ({ key: s.key, status: s.status })),
    });
    logInfo("setup_run.completed", { workspaceId: scope.workspaceId, brandId: scope.brandId });
  } else {
    logError("setup_run.failed", {
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      error: "All setup steps failed",
    });
  }
  return getSetupRun(scope.brandId);
}

/**
 * Inline fallback executor for runtimes without the SETUP_WORKFLOW binding
 * (plain `next dev`). Same per-step persistence as the Workflow path; a failed
 * step is recorded and the pipeline moves on.
 */
export async function executeSetupRun(scope: BrandScope, planId: string | null | undefined) {
  const run = await getSetupRun(scope.brandId);
  if (!run || run.status === "completed") return run;
  for (const { key } of SETUP_STEPS) {
    try {
      await executeSetupStep(scope, planId, key);
    } catch {
      // Already persisted + logged by executeSetupStep; keep going.
    }
  }
  return finalizeSetupRun(scope);
}

/**
 * Kick off (or resume) execution for an existing run row. On Cloudflare this
 * creates a durable `SetupRunWorkflow` instance — checkpointed per step,
 * retried on transient failures, immune to isolate eviction. Elsewhere it falls
 * back to the inline executor in `waitUntil`.
 */
export async function triggerSetupRun(
  scope: BrandScope,
  planId: string | null | undefined,
  run: { id: string },
  opts: { resume?: boolean } = {},
): Promise<"workflow" | "inline"> {
  const cf = getCloudflareRequestContext();
  const workflow = cf?.env?.SETUP_WORKFLOW;
  if (workflow) {
    // Fresh runs use a deterministic id so double-triggers collide into a no-op;
    // resumes need a new id because the original instance has already settled.
    const id = opts.resume ? `setup-${run.id}-r${Date.now()}` : `setup-${run.id}`;
    try {
      await workflow.create({
        id,
        params: { workspaceId: scope.workspaceId, brandId: scope.brandId, planId: planId ?? null },
      });
    } catch (error) {
      if (!isWorkflowInstanceExistsError(error)) throw error;
    }
    return "workflow";
  }

  const work = executeSetupRun(scope, planId).catch((error) => {
    logError("setup_run.inline_failed", {
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  const ctx = cf?.ctx as { waitUntil?: (promise: Promise<unknown>) => void } | undefined;
  if (ctx?.waitUntil) ctx.waitUntil(work);
  return "inline";
}

/**
 * Self-heal for the status poller: when GET finds a run stranded in `running`
 * (executor killed without reaching any persistence), resume it. The
 * compare-and-swap on `updatedAt` makes concurrent pollers race safely — only
 * the claimant triggers, everyone else sees a freshly-touched row.
 */
export async function resumeStaleSetupRun(
  scope: BrandScope,
  planId: string | null | undefined,
  run: NonNullable<Awaited<ReturnType<typeof getSetupRun>>>,
): Promise<boolean> {
  if (!isSetupRunStale(run)) return false;
  const claimed = await getDb()
    .update(setupRuns)
    .set({ updatedAt: new Date() })
    .where(and(eq(setupRuns.id, run.id), eq(setupRuns.updatedAt, run.updatedAt)))
    .returning({ id: setupRuns.id });
  if (claimed.length === 0) return false;
  logInfo("setup_run.stale_resumed", { workspaceId: scope.workspaceId, brandId: scope.brandId });
  await triggerSetupRun(scope, planId, run, { resume: true });
  return true;
}

/**
 * Server-side ignition: start (or resume) the Setup Run for every brand in a
 * workspace. Called from the Stripe webhook on first checkout so ignition never
 * depends on the client's fire-and-forget POST surviving a closed tab. Brands
 * whose run already completed are untouched.
 */
export async function igniteWorkspaceSetupRuns(workspaceId: string): Promise<void> {
  const { listBrands } = await import("@/lib/brand/repository");
  const { subscriptions } = await import("@/lib/db/schema");
  // A workspace can carry stale subscription rows (e.g. a canceled plan beside
  // the new one) — caps must come from the active row, not an arbitrary one.
  const subRows = await getDb()
    .select({ planId: subscriptions.planId, status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId));
  const planId =
    subRows.find((sub) => isActiveSubscription(sub.status))?.planId ??
    subRows[0]?.planId ??
    null;
  const allBrands = await listBrands(workspaceId);
  for (const brand of allBrands) {
    const scope: BrandScope = { workspaceId, brandId: brand.id };
    try {
      const { run, created } = await startSetupRun(scope);
      if (created || run.status === "failed" || isSetupRunStale(run)) {
        await triggerSetupRun(scope, planId, run, { resume: !created });
      }
    } catch (error) {
      logError("setup_run.ignite_failed", {
        workspaceId,
        brandId: brand.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
