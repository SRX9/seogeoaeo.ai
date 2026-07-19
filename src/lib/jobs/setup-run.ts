import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { generateArticleFromTopic } from "@/lib/articles/generate";
import {
  beginSetupAgentTask,
  completeSetupAgentTask,
  progressSetupAgentTask,
} from "@/lib/agent/planner";
import { getAgentControlState } from "@/lib/agent/memory";
import { assertAgentOperationAllowed } from "@/lib/agent/safety";
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
import { auditFindings, audits, setupRuns, subscriptions, trackedPrompts } from "@/lib/db/schema";
import { createAgentJob, finishAgentJob } from "@/lib/jobs/repository";
import { createWorkflowInstance } from "@/lib/jobs/workflow";
import { generateJson, getLlmConfig } from "@/lib/llm/client";
import { day0BriefPrompt, seedTrackedPromptsPrompt } from "@/lib/llm/prompts";
import { logError, logInfo, logWarn } from "@/lib/logging/logger";
import {
  assertHasCredits,
  InsufficientCreditsError,
  spendCredits,
} from "@/lib/usage/credits";
import { CREDIT_COSTS, type BillableAction } from "@/lib/billing/credits";
import { runResearch } from "@/lib/research/run";
import { recentAnswerExcerpts, runAnswerCheck } from "@/lib/visibility/answers";
import { setupRunOutcome } from "@/lib/jobs/setup-run-outcome";
import type { SetupStep, SetupStepKey } from "@/lib/jobs/setup-run-types";
import { monthlyFixBudgetUsed, stampProposedFindings } from "@/lib/visibility/fix-dispatch";
import { isInstallReady } from "@/lib/visibility/fix-policy";
import { createAudit, executeAudit } from "@/server/visibility/run-audit";

export type { SetupStep, SetupStepKey, SetupStepStatus } from "@/lib/jobs/setup-run-types";
export { MATERIAL_SETUP_STEPS, setupRunOutcome } from "@/lib/jobs/setup-run-outcome";

/**
 * AP2: Claudia's Setup Run: the one-time ignition pipeline that onboards a new
 * brand with zero user steps. Everything derives from the brand profile; steps
 * that lack their input are *skipped with a note*, never blocked on the user.
 *
 * Execution model: the pipeline is durable, not a single background promise.
 * `triggerSetupRun` creates a `SetupRunWorkflow` instance (Cloudflare Workflows,
 * same pattern as the daily content agent); the Workflow calls back into
 * `/api/agent/setup-step` once per step, and each step persists its status the
 * moment it settles. An isolate eviction mid-step costs at most that step's
 * retry: never the run. A failed step (after retries) is recorded and the
 * pipeline moves on, so one broken step can't wedge setup in `running` forever.
 *
 * Idempotency: one `setup_runs` row per brand (unique index); a re-run of an
 * already-done/skipped step is a no-op.
 *
 * Metering: setup work spends credits like the same work triggered manually
 * (audit, answer check, benchmark, research, article). Each spend is idempotent
 * by refId so Workflow retries never double-charge; a step whose balance is
 * short is *skipped with a note*: never wedged, never free.
 *
 * Outside Cloudflare (plain `next dev`, no SETUP_WORKFLOW binding) the whole
 * pipeline falls back to running inline in the request's `waitUntil`.
 */

/**
 * Owner-facing step labels. Deliberately warm-but-vague: they describe what
 * Claudia is doing for the owner without documenting the pipeline itself
 * (these labels are served to the browser, so precise names would hand the
 * workflow to anyone who opens devtools).
 */
export const SETUP_STEPS = [
  { key: "first_audit", label: "Getting to know your site" },
  { key: "seed_prompts", label: "Learning how your buyers ask" },
  { key: "answer_check", label: "Checking your AI presence" },
  { key: "competitor_baseline", label: "Sizing up the landscape" },
  { key: "topic_research", label: "Picking the first opportunities" },
  { key: "quick_win_fixes", label: "Lining up quick wins" },
  { key: "first_article", label: "Creating your first piece" },
  { key: "day0_brief", label: "Writing up her notes" },
] as const satisfies ReadonlyArray<{ key: SetupStepKey; label: string }>;

const setupPromptsResponseSchema = z.object({
  prompts: z.array(z.string().min(1).max(300)).optional(),
});
const setupBriefResponseSchema = z.object({
  brief: z.string().min(1).max(2_000).optional(),
});

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
  // Lost a concurrent-insert race: the other caller owns execution.
  if (!row) {
    const winner = await getSetupRun(scope.brandId);
    return { run: winner!, created: false };
  }
  return { run: { ...row, steps: parseSteps(row.stepsJson) }, created: true };
}

async function saveRun(
  runId: string,
  steps: SetupStep[],
  patch: {
    status?: string;
    briefText?: string;
    recoveryOwner?: string | null;
    recoveryAttempts?: number;
  } = {},
) {
  await getDb()
    .update(setupRuns)
    .set({ stepsJson: JSON.stringify(steps), updatedAt: new Date(), ...patch })
    .where(eq(setupRuns.id, runId));
}

/**
 * A run that failed terminally must never be silent: the owner gets a calm
 * Claudia email (work is safe, team alerted, retry available) and the operator
 * gets paged with enough context to debug without touching the customer.
 * Best-effort by design: notification failure must not break run settlement.
 */
async function notifySetupRunFailure(
  scope: BrandScope,
  run: { id: string; status: string; steps: SetupStep[] },
  reason: string,
) {
  const [{ sendToWorkspaceOwner, sendOperatorAlert }, { setupRunStalledEmail }] =
    await Promise.all([import("@/lib/email/notify"), import("@/lib/email/templates")]);
  const brand = await getBrand(scope.workspaceId, scope.brandId).catch(() => null);
  const origin = process.env.BETTER_AUTH_URL?.replace(/\/$/, "") || "https://seogeoaeo.ai";
  await sendToWorkspaceOwner(
    scope.workspaceId,
    setupRunStalledEmail({
      brandName: brand?.name ?? "your brand",
      dashboardUrl: `${origin}/dashboard`,
    }),
  );
  await sendOperatorAlert(`Setup Run ${run.status} for ${brand?.name ?? scope.brandId}`, [
    `reason: ${reason}`,
    `workspaceId: ${scope.workspaceId}`,
    `brandId: ${scope.brandId}`,
    `setupRunId: ${run.id}`,
    `status: ${run.status}`,
    "steps:",
    ...run.steps.map((s) => `  - ${s.key}: ${s.status}${s.note ? ` (${s.note.slice(0, 200)})` : ""}`),
  ]);
}

/** Latest completed audit for the workspace's own site: feeds the fix step. */
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

/** Skip note for steps the balance can't cover: the run keeps moving. */
const NO_CREDITS_SKIP = "Not enough credits: top up and this runs on the next audit cycle.";

/** Pre-flight: turns a short balance into a skip note instead of a failed step. */
async function hasCreditsFor(scope: BrandScope, action: BillableAction): Promise<boolean> {
  try {
    const controls = await getAgentControlState(scope.brandId);
    assertAgentOperationAllowed("billable", { actor: "agent", controls });
    await assertHasCredits(scope.workspaceId, CREDIT_COSTS[action]);
    return true;
  } catch (error) {
    if (error instanceof InsufficientCreditsError) return false;
    throw error;
  }
}

/**
 * Charge one setup step after its work succeeded, keyed on the work's own id so
 * a retried Workflow step never double-charges. A balance drained between the
 * pre-check and here is logged, not thrown: finished work is never orphaned
 * (mirrors article generation's post-work charge).
 */
async function chargeSetupWork(scope: BrandScope, action: BillableAction, refId: string) {
  try {
    await spendCredits(scope.workspaceId, CREDIT_COSTS[action], {
      reason: action,
      brandId: scope.brandId,
      refType: action === "research_run" ? "research_run" : "visibility",
      refId,
      actor: "agent",
    });
    return true;
  } catch (error) {
    if (!(error instanceof InsufficientCreditsError)) throw error;
    logWarn("setup_run.credit_charge_skipped", {
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      action,
      refId,
    });
    return false;
  }
}

/** Everything a step runner needs; loaded fresh per step so runners are self-contained. */
type SetupCheckpointHandle = {
  billingWorkId: string;
  outputRef: string | null;
  recordOutputRef: (outputRef: string) => Promise<void>;
};

export type SetupCheckpoint = <T extends Record<string, unknown>>(
  key: string,
  work: (handle: SetupCheckpointHandle) => Promise<T>,
) => Promise<T>;

type StepContext = {
  scope: BrandScope;
  runId: string;
  steps: SetupStep[];
  brand: NonNullable<Awaited<ReturnType<typeof getBrand>>>;
  profile: Awaited<ReturnType<typeof getBrandProfile>>;
  website: string | null;
  caps: ReturnType<typeof visibilityCapsForPlan>;
  planId: string | null | undefined;
  billingWorkId: string;
  outputRef: string | null;
  recordOutputRef: (outputRef: string) => Promise<void>;
  checkpoint: SetupCheckpoint;
};

/** Notes from settled steps: the raw material for the Day-0 brief. */
function factsFromSteps(steps: SetupStep[]): string[] {
  return steps
    .filter((s) => s.status === "done" && s.note)
    .map((s) => `${s.key}: ${s.note}`);
}

type StepResult = string | { skip: string } | { degraded: string };

const stepRunners: Record<SetupStepKey, (ctx: StepContext) => Promise<StepResult>> = {
  first_audit: async ({ scope, website, checkpoint }) => {
    if (!website) return { skip: "No website on the brand profile yet." };
    if (!(await hasCreditsFor(scope, "visibility_audit"))) return { skip: NO_CREDITS_SKIP };
    const created = await checkpoint("create_audit_record", async (handle) => {
      const auditId = handle.outputRef ?? crypto.randomUUID();
      if (!handle.outputRef) await handle.recordOutputRef(auditId);
      await createAudit(scope.workspaceId, website, "owned", scope.brandId, auditId);
      return { auditId };
    });
    const auditId = String(created.auditId);
    await checkpoint("execute_audit", async () => ({
      ok: await executeAudit(auditId, website, { throwOnTransient: true }),
    }));
    const audit = await checkpoint("verify_audit_result", async () => {
      const [row] = await getDb().select().from(audits).where(eq(audits.id, auditId)).limit(1);
      return {
        status: row?.status ?? "missing",
        error: row?.error ?? null,
        overallScore: row?.overallScore ?? null,
      };
    });
    // Charge only on success: mirror manual audits so a dead site never burns credits.
    if (audit?.status === "partial") {
      return { degraded: String(audit.error ?? "First audit completed with partial analyzer coverage.") };
    }
    if (audit?.status !== "complete") {
      return { skip: String(audit?.error ?? "The site could not be audited yet. We'll try again later.") };
    }
    const charge = await checkpoint("charge_audit_work", async ({ billingWorkId }) => {
      const charged = await chargeSetupWork(scope, "visibility_audit", billingWorkId);
      return { charged };
    });
    if (!charge.charged) return { degraded: "First audit complete; credit settlement needs owner attention." };
    const summarized = await checkpoint("summarize_audit", async () => ({
      note: typeof audit.overallScore === "number"
        ? `Visibility score ${Math.round(audit.overallScore)}/100.`
        : "First audit complete.",
    }));
    return String(summarized.note);
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
    const { data } = await generateJson("light", [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ], { schema: setupPromptsResponseSchema });
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

  answer_check: async ({ scope, checkpoint }) => {
    if (!(await hasCreditsFor(scope, "answer_run"))) return { skip: NO_CREDITS_SKIP };
    const refId = `setup-answers-${scope.brandId}`;
    const checked = await checkpoint("execute_answer_check", async () => {
      const result = await runAnswerCheck(scope.brandId, { refId });
      const { persistNewFindings } = await import("@/lib/visibility/findings-repository");
      await persistNewFindings(scope.workspaceId, result.findings, {
        brandId: scope.brandId,
      });
      const best = [...result.share].sort((a, b) => b.appeared - a.appeared)[0];
      return {
        cellCount: result.cells.length,
        bestAppeared: best?.appeared ?? null,
        bestPrompts: best?.prompts ?? null,
        bestEngine: best?.engine ?? null,
      };
    });
    if (checked.cellCount === 0) return { skip: "No prompts or engines available yet." };
    const charge = await checkpoint("charge_answer_work", async ({ billingWorkId }) => {
      const charged = await chargeSetupWork(scope, "answer_run", billingWorkId);
      return { charged };
    });
    if (!charge.charged) return { degraded: "Answer check complete; credit settlement needs owner attention." };
    const summarized = await checkpoint("summarize_answer_check", async () => ({
      note: typeof checked.bestAppeared === "number" && typeof checked.bestPrompts === "number"
        ? `In ${checked.bestAppeared} of ${checked.bestPrompts} ${String(checked.bestEngine)} answers today.`
        : "First answer check complete.",
    }));
    return String(summarized.note);
  },

  competitor_baseline: async ({
    scope,
    brand,
    profile,
    website,
    caps,
    checkpoint,
  }) => {
    let comps = await listCompetitors(scope.brandId);
    if (comps.length === 0 && caps.competitors > 0) {
      // answer_check already ran, so real AI answers exist as discovery
      // evidence: brands the engines name are the truest rivals.
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
    if (!(await hasCreditsFor(scope, "competitor_benchmark"))) return { skip: NO_CREDITS_SKIP };
    // "benchmark": scores a rival under our workspace: must never surface as
    // the owner's score (summary/badge/baseline) or write fix-queue findings.
    const created = await checkpoint("create_benchmark_audit", async (handle) => {
      const auditId = handle.outputRef ?? crypto.randomUUID();
      if (!handle.outputRef) await handle.recordOutputRef(auditId);
      await createAudit(scope.workspaceId, rival.url, "benchmark", scope.brandId, auditId);
      return { auditId };
    });
    const benchmarkAuditId = String(created.auditId);
    await checkpoint("execute_benchmark_audit", async () => ({
      ok: await executeAudit(benchmarkAuditId, rival.url, { throwOnTransient: true }),
    }));
    const bench = await checkpoint("verify_benchmark_result", async () => {
      const [row] = await getDb()
        .select({ status: audits.status, error: audits.error })
        .from(audits)
        .where(eq(audits.id, benchmarkAuditId))
        .limit(1);
      return { status: row?.status ?? "missing", error: row?.error ?? null };
    });
    if (bench?.status !== "complete") {
      return { skip: bench?.error ?? `Couldn't reach ${rival.name} yet.` };
    }
    const charge = await checkpoint("charge_benchmark_work", async ({ billingWorkId }) => {
      const charged = await chargeSetupWork(scope, "competitor_benchmark", billingWorkId);
      return { charged };
    });
    if (!charge.charged) return { degraded: "Competitor benchmark complete; credit settlement needs owner attention." };
    const summarized = await checkpoint("summarize_benchmark", async () => ({
      note: `Benchmarked ${rival.name}.`,
    }));
    return String(summarized.note);
  },

  topic_research: async ({ scope, checkpoint }) => {
    if (!(await hasCreditsFor(scope, "research_run"))) return { skip: NO_CREDITS_SKIP };
    const research = await checkpoint("execute_topic_research", async () => {
      const result = await runResearch(scope, {
        idempotencyKey: `setup-${scope.brandId}`,
        actor: "agent",
      });
      return { runId: result.runId, topicsCreated: result.topicsCreated };
    });
    const charge = await checkpoint("charge_research_work", async ({ billingWorkId }) => {
      const charged = await chargeSetupWork(scope, "research_run", billingWorkId);
      return { charged };
    });
    if (!charge.charged) return { degraded: "Topic research complete; credit settlement needs owner attention." };
    const summarized = await checkpoint("summarize_topic_research", async () => ({
      note: `Queued ${Number(research.topicsCreated)} article topics.`,
    }));
    return String(summarized.note);
  },

  quick_win_fixes: async ({ scope, website, caps }) => {
    if (!website) return { skip: "No website to fix." };
    // Same prepare path as the standing loop: never auto_applied without canLiveApply.
    const auditId = await latestOwnAuditId(scope.workspaceId, website);
    if (!auditId) return { skip: "No completed audit to fix from." };
    const used = await monthlyFixBudgetUsed(scope.workspaceId, scope.brandId);
    const remaining = Math.max(0, (caps.autoFixCap || 0) - used);
    const limit = Math.min(remaining, MAX_SETUP_FIXES);
    if (limit <= 0) return { skip: "Plan has no remaining fix preparation allowance this month." };

    const findings = await getDb()
      .select({
        id: auditFindings.id,
        fixCapability: auditFindings.fixCapability,
      })
      .from(auditFindings)
      .where(
        and(
          eq(auditFindings.auditId, auditId),
          eq(auditFindings.isResolved, false),
          isNull(auditFindings.proposedAt),
        ),
      )
      .orderBy(
        sql`case ${auditFindings.severity}
          when 'critical' then 0
          when 'high' then 1
          when 'medium' then 2
          when 'low' then 3
          else 4
        end`,
      );

    const readyIds = findings
      .filter((f) => isInstallReady(f.fixCapability))
      .slice(0, limit)
      .map((f) => f.id);
    if (readyIds.length === 0) return { skip: "No ready-to-install fixes found." };

    const stamped = await stampProposedFindings(readyIds);
    return `Prepared ${stamped} ready-to-install fix${stamped === 1 ? "" : "es"} in your inbox.`;
  },

  first_article: async ({ scope, planId, checkpoint }) => {
    if (dailyArticleCapForPlan(planId) <= 0) return { skip: "Plan has no article allowance." };
    const selected = await checkpoint("select_first_article_topic", async () => {
      const [topic] = await listPendingTopicsForWriting(scope.brandId, 1);
      return { topicId: topic?.id ?? null, title: topic?.title ?? null };
    });
    if (typeof selected.topicId !== "string" || typeof selected.title !== "string") {
      return { skip: "No topics queued yet." };
    }
    try {
      // Metered like any agent-written article: asserts up front, charges on success.
      // Real app origin so markdown export / webhooks get a valid absolute URL.
      const origin = process.env.BETTER_AUTH_URL?.replace(/\/$/, "") || undefined;
      const generated = await checkpoint("execute_first_article", async ({ billingWorkId }) => {
        const generated = await generateArticleFromTopic(scope, selected.topicId as string, {
          actor: "agent",
          origin,
          billingWorkId,
        });
        return {
          articleId: generated.article.id,
          topicId: selected.topicId,
          creditCharged: generated.creditCharged,
        };
      });
      if (generated.creditCharged === false) {
        return { degraded: "First article written; credit settlement needs owner attention." };
      }
    } catch (error) {
      if (error instanceof InsufficientCreditsError) return { skip: NO_CREDITS_SKIP };
      throw error;
    }
    const summarized = await checkpoint("summarize_first_article", async () => ({
      note: `Wrote "${selected.title}".`,
    }));
    return String(summarized.note);
  },

  day0_brief: async ({ brand, runId, steps }) => {
    const facts = factsFromSteps(steps);
    let brief =
      `I've set myself up on ${brand.name}. ` +
      "I'll keep auditing, fixing, and writing on your plan's schedule. Your weekly report will show what changed.";
    if (getLlmConfig() && facts.length > 0) {
      try {
        const prompt = day0BriefPrompt(brand.name, facts.join("\n"));
        const { data } = await generateJson("light", [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ], { schema: setupBriefResponseSchema });
        if (typeof data?.brief === "string" && data.brief.trim()) brief = data.brief.trim().slice(0, 2000);
      } catch {
        // Fall back to the deterministic brief: the run must still complete.
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
  options: {
    billingWorkId?: string;
    outputRef?: string | null;
    recordOutputRef?: (outputRef: string) => Promise<void>;
    checkpoint?: SetupCheckpoint;
  } = {},
): Promise<SetupStep> {
  const run = await getSetupRun(scope.brandId);
  if (!run) throw new Error("Setup run not found");
  const steps = run.steps;
  const step = steps.find((s) => s.key === key)!;
  if (
    run.status === "completed" ||
    run.status === "completed_degraded" ||
    step.status === "done" ||
    step.status === "skipped"
  ) {
    return step;
  }

  const controls = await getAgentControlState(scope.brandId);
  const operation =
    key === "quick_win_fixes" || key === "first_article" || key === "day0_brief"
      ? "drafting"
      : "observation";
  assertAgentOperationAllowed(operation, { actor: "agent", controls });

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
    billingWorkId: options.billingWorkId ?? run.id,
    outputRef: options.outputRef ?? null,
    recordOutputRef: options.recordOutputRef ?? (async () => {}),
    checkpoint:
      options.checkpoint ??
      (async (_key, work) =>
        work({
          billingWorkId: options.billingWorkId ?? run.id,
          outputRef: options.outputRef ?? null,
          recordOutputRef: options.recordOutputRef ?? (async () => {}),
        })),
  };

  step.status = "running";
  await saveRun(run.id, steps, { status: "running" });
  try {
    const result = await stepRunners[key](ctx);
    if (typeof result === "object" && "skip" in result) {
      step.status = "skipped";
      step.note = result.skip;
      step.degraded = false;
    } else if (typeof result === "object") {
      step.status = "done";
      step.note = result.degraded;
      step.degraded = true;
    } else {
      step.status = "done";
      step.note = result;
      step.degraded = false;
    }
    await saveRun(run.id, steps);
    try {
      await progressSetupAgentTask(
        scope,
        SETUP_STEPS.find((item) => item.key === key)?.label ?? key,
        step.note,
      );
    } catch (error) {
      logError("setup_run.agent_task_progress_failed", {
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        step: key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
 * Settle the run once every step has been attempted. Failed/skipped steps don't
 * block completion when at least one material step is `done`. An all-skip /
 * all-fail run is `failed` so the owner can resume after fixing credits/site.
 */
export async function finalizeSetupRun(scope: BrandScope) {
  const run = await getSetupRun(scope.brandId);
  if (!run) throw new Error("Setup run not found");
  if (run.status === "completed" || run.status === "completed_degraded") return run;
  const steps = run.steps;
  const status = setupRunOutcome(steps);
  const materialDone = status === "completed" || status === "completed_degraded";
  // Settle side effects before the terminal run status. A retry can safely
  // repeat both operations, while a terminal row must mean finalization landed.
  await completeSetupAgentTask(scope, materialDone ? "completed" : "failed");
  if (materialDone) {
    const job = await createAgentJob(scope, "setup_run", "Claudia's Setup Run", {
      idempotencyKey: `setup:${run.id}:summary`,
    });
    await finishAgentJob(
      job.id,
      "completed",
      status === "completed_degraded"
        ? "Setup Run completed with recoverable gaps."
        : "Setup Run complete: Claudia is on the job.",
      { steps: steps.map((s) => ({ key: s.key, status: s.status })), status },
    );
    logInfo("setup_run.completed", { workspaceId: scope.workspaceId, brandId: scope.brandId });
  } else {
    logError("setup_run.failed", {
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      error: "No material setup steps completed",
    });
  }
  await saveRun(run.id, steps, {
    status,
    recoveryOwner: status === "blocked" ? "owner" : status === "failed" ? "operator" : null,
  });
  // Notify only on the transition into a terminal failure (run.status still
  // holds the pre-settlement value), so a retried finalize never double-sends.
  if (!materialDone && run.status === "running") {
    try {
      await notifySetupRunFailure(scope, { id: run.id, status, steps }, "Setup Run settled without a material step completing");
    } catch (error) {
      logError("setup_run.failure_notify_failed", {
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
  if (!run || run.status === "completed" || run.status === "completed_degraded") return run;
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
 * creates a durable `SetupRunWorkflow` instance: checkpointed per step,
 * retried on transient failures, immune to isolate eviction. Elsewhere it falls
 * back to the inline executor in `waitUntil`.
 */
export async function triggerSetupRun(
  scope: BrandScope,
  planId: string | null | undefined,
  run: { id: string },
  opts: { resume?: boolean } = {},
): Promise<"workflow" | "inline"> {
  if (opts.resume) {
    const current = await getSetupRun(scope.brandId);
    if (current && (current.status === "blocked" || current.status === "failed")) {
      const reset = current.steps.map((step) =>
        step.status === "skipped" ? { ...step, status: "pending" as const, note: undefined } : step,
      );
      // A deliberate resume re-arms the automatic-recovery budget.
      await saveRun(current.id, reset, { status: "running", recoveryOwner: null, recoveryAttempts: 0 });
    }
  }
  try {
    await beginSetupAgentTask(scope);
  } catch (error) {
    logError("setup_run.agent_task_start_failed", {
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const cf = getCloudflareRequestContext();
  const workflow = cf?.env?.SETUP_WORKFLOW;
  if (workflow) {
    // Fresh runs use a deterministic id so double-triggers collide into a no-op;
    // resumes need a new id because the original instance has already settled.
    const id = opts.resume ? `setup-${run.id}-r${Date.now()}` : `setup-${run.id}`;
    await createWorkflowInstance(workflow, {
      id,
      params: { workspaceId: scope.workspaceId, brandId: scope.brandId, planId: planId ?? null },
    });
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
 * Automatic resumes allowed before a stranded run is declared terminally
 * failed. Each resume launches a fresh Workflow instance, so an environment
 * that keeps breaking would otherwise re-trigger (and stay "running" in the
 * UI) forever, invisibly.
 */
const MAX_SETUP_RECOVERY_ATTEMPTS = 3;

/**
 * Self-heal for the status poller and the reconcile cron: when a run is found
 * stranded in `running` (executor killed without reaching any persistence),
 * resume it — up to MAX_SETUP_RECOVERY_ATTEMPTS times, after which the run is
 * settled as `failed` and the owner + operator are notified. The
 * compare-and-swap on `updatedAt` makes concurrent pollers race safely: only
 * the claimant acts, everyone else sees a freshly-touched row.
 */
export async function resumeStaleSetupRun(
  scope: BrandScope,
  planId: string | null | undefined,
  run: NonNullable<Awaited<ReturnType<typeof getSetupRun>>>,
): Promise<boolean> {
  if (!isSetupRunStale(run)) return false;
  const claimed = await getDb()
    .update(setupRuns)
    .set({ updatedAt: new Date(), recoveryAttempts: run.recoveryAttempts + 1 })
    .where(and(eq(setupRuns.id, run.id), eq(setupRuns.updatedAt, run.updatedAt)))
    .returning({ id: setupRuns.id });
  if (claimed.length === 0) return false;

  if (run.recoveryAttempts >= MAX_SETUP_RECOVERY_ATTEMPTS) {
    await saveRun(run.id, run.steps, { status: "failed", recoveryOwner: "operator" });
    logError("setup_run.recovery_exhausted", {
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      setupRunId: run.id,
      attempts: run.recoveryAttempts,
    });
    try {
      await notifySetupRunFailure(
        scope,
        { id: run.id, status: "failed", steps: run.steps },
        `Setup Run stayed stranded through ${run.recoveryAttempts} automatic resumes`,
      );
    } catch (error) {
      logError("setup_run.failure_notify_failed", {
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return false;
  }

  logInfo("setup_run.stale_resumed", {
    workspaceId: scope.workspaceId,
    brandId: scope.brandId,
    attempt: run.recoveryAttempts + 1,
  });
  await triggerSetupRun(scope, planId, run, { resume: true });
  return true;
}

/**
 * Reconcile-cron sweep: recover (or terminally settle) runs stranded in
 * `running` even when nobody is watching the dashboard. Without this, a user
 * who closes the tab after onboarding depends entirely on their own polling to
 * un-wedge the run.
 */
export async function sweepStaleSetupRuns(limit = 20): Promise<{ scanned: number; acted: number }> {
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MS);
  const rows = await getDb()
    .select()
    .from(setupRuns)
    .where(and(eq(setupRuns.status, "running"), lte(setupRuns.updatedAt, staleBefore)))
    .limit(limit);
  let acted = 0;
  for (const row of rows) {
    const scope: BrandScope = { workspaceId: row.workspaceId, brandId: row.brandId };
    try {
      const subRows = await getDb()
        .select({ planId: subscriptions.planId, status: subscriptions.status })
        .from(subscriptions)
        .where(eq(subscriptions.workspaceId, row.workspaceId));
      const planId =
        subRows.find((sub) => isActiveSubscription(sub.status))?.planId ??
        subRows[0]?.planId ??
        null;
      const resumed = await resumeStaleSetupRun(scope, planId, {
        ...row,
        steps: parseSteps(row.stepsJson),
      });
      if (resumed) acted += 1;
    } catch (error) {
      logError("setup_run.sweep_failed", {
        workspaceId: row.workspaceId,
        brandId: row.brandId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { scanned: rows.length, acted };
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
  // the new one): caps must come from the active row, not an arbitrary one.
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
      if (created || run.status === "failed" || run.status === "blocked" || isSetupRunStale(run)) {
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
