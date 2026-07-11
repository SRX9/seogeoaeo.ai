import { and, asc, desc, eq } from "drizzle-orm";
import { getAgentState } from "@/lib/agent/state";
import { getBrandIdentitySummary } from "@/lib/brand/intelligence";
import { listArticles, listTopics } from "@/lib/articles/repository";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { dailyArticleCapForPlan, isActiveSubscription } from "@/lib/billing/plans";
import type { requireApiBrand } from "@/lib/api/server";
import type {
  Article,
  AutomationStats,
  DashboardData,
  VisibilityAnswers,
  VisibilitySummary,
  VisibilityTraffic,
} from "@/lib/api/queries";
import { getDb } from "@/lib/db";
import { answerRuns, audits, trafficSnapshots } from "@/lib/db/schema/visibility";
import { buildInboxRows } from "@/lib/inbox/rows";
import { listTrafficConnections } from "@/lib/integrations/google-traffic";
import { listIntegrations } from "@/lib/integrations/repository";
import { getDailyRun } from "@/lib/jobs/daily-repository";
import { getUsageTotals, getWeeklyPipelineStats } from "@/lib/jobs/repository";
import {
  getSetupRun,
  isSetupRunStale,
  resumeStaleSetupRun,
  SETUP_STEPS,
} from "@/lib/jobs/setup-run";
import { getCreditBalance } from "@/lib/usage/credits";
import { computeShare, type EngineName } from "@/lib/visibility/answers";
import { getOpenFindings } from "@/lib/visibility/findings-repository";
import {
  DAILY_RUN_SCHEDULE_LABEL,
  getNextDailyRun,
  getUtcDayKey,
} from "@/lib/workspace/settings";

type DashboardContext = Awaited<ReturnType<typeof requireApiBrand>>;
type MaybePromise<T> = T | Promise<T>;

type AutomationPreload = {
  credits?: MaybePromise<Awaited<ReturnType<typeof getCreditBalance>>>;
  weekly?: MaybePromise<Awaited<ReturnType<typeof getWeeklyPipelineStats>>>;
};

/** Shared automation read used by both the overview bundle and its standalone endpoint. */
export async function getDashboardAutomation(
  context: DashboardContext,
  preload: AutomationPreload = {},
): Promise<AutomationStats> {
  const { workspace, subscription, brand } = context;
  const active = isActiveSubscription(subscription?.status);
  const [credits, topics, weeklyStats, usageTotals, todayRun] = await Promise.all([
    preload.credits ?? getCreditBalance(workspace.id),
    listTopics(brand.id),
    preload.weekly ?? getWeeklyPipelineStats(brand.id),
    getUsageTotals(brand.id),
    getDailyRun(brand.id, getUtcDayKey()),
  ]);

  const writable = topics
    .filter((topic) => topic.status === "pending" && topic.score != null)
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0));
  const nextUp = writable[0];
  const pendingTopics = writable.length;
  const dailyCap = active ? dailyArticleCapForPlan(subscription?.planId) : 0;

  let agentState: AutomationStats["agentState"];
  if (!active) agentState = "paused_no_subscription";
  else if (credits.total < CREDIT_COSTS.article_generation) agentState = "paused_no_credits";
  else if (pendingTopics === 0) agentState = "idle_caught_up";
  else agentState = "active";

  return {
    enabled: active,
    autoPublish: brand.autonomyMode === "FULL_AUTO",
    schedule: DAILY_RUN_SCHEDULE_LABEL,
    nextRunAt: active ? getNextDailyRun().toISOString() : null,
    agentState,
    dailyCap,
    writtenToday: todayRun?.articlesWritten ?? 0,
    pendingTopics,
    nextTopic: nextUp ? { title: nextUp.title, thesis: nextUp.thesis ?? null } : null,
    workingSince: workspace.createdAt.toISOString(),
    totalRuns: weeklyStats.totalRuns,
    articlesWritten: usageTotals.articlesWritten,
    articlesPublished: usageTotals.articlesPublished,
    thisWeek: usageTotals.thisWeek,
    lastRun: weeklyStats.lastRun
      ? {
          status: weeklyStats.lastRun.status,
          createdAt: weeklyStats.lastRun.createdAt.toISOString(),
          articlesGenerated: weeklyStats.lastRun.articlesGenerated,
          topicsResearched: weeklyStats.lastRun.topicsResearched,
        }
      : null,
  };
}

async function getVisibilitySummary(
  workspaceId: string,
  brandId: string,
): Promise<VisibilitySummary> {
  const conditions = [
    eq(audits.workspaceId, workspaceId),
    eq(audits.brandId, brandId),
    eq(audits.status, "complete"),
    eq(audits.kind, "owned"),
  ];
  const recent = await getDb()
    .select({ id: audits.id, overall: audits.overallScore })
    .from(audits)
    .where(and(...conditions))
    .orderBy(desc(audits.createdAt))
    .limit(2);
  const latest = recent[0] ?? null;
  const previous = recent[1] ?? null;

  return {
    hasAudit: Boolean(latest),
    latest: latest
      ? {
          id: latest.id,
          overall: latest.overall,
          band: null,
          aiVisibility: null,
          businessType: null,
          completedAt: null,
          subScores: {
            citability: null,
            brand: null,
            eeat: null,
            technical: null,
            schema: null,
            platform: null,
          },
        }
      : null,
    previousOverall: previous?.overall ?? null,
    baseline: { baseline: null, sample: 0, scope: "dashboard" },
  };
}

async function getVisibilityAnswers(brandId: string): Promise<VisibilityAnswers> {
  const runs = await getDb()
    .select({
      engine: answerRuns.engine,
      brandMentioned: answerRuns.brandMentioned,
      brandCited: answerRuns.brandCited,
    })
    .from(answerRuns)
    .where(eq(answerRuns.brandId, brandId))
    .orderBy(desc(answerRuns.ranAt))
    .limit(200);
  const share = computeShare(
    runs.map((run) => ({
      engine: run.engine as EngineName,
      brandMentioned: run.brandMentioned,
      brandCited: run.brandCited,
    })),
  );

  return {
    // The Overview only renders the aggregate share; the full prompt x engine
    // grid remains scoped to /visibility/answers.
    prompts: [],
    runs: [],
    share,
  };
}

async function getVisibilityTraffic(
  brandId: string,
  connections: MaybePromise<Awaited<ReturnType<typeof listTrafficConnections>>>,
): Promise<VisibilityTraffic> {
  const db = getDb();
  const [snapshots, trafficConnections] = await Promise.all([
    db
      .select()
      .from(trafficSnapshots)
      .where(
        and(
          eq(trafficSnapshots.brandId, brandId),
          eq(trafficSnapshots.source, "gsc"),
        ),
      )
      .orderBy(asc(trafficSnapshots.date)),
    connections,
  ]);

  return {
    connected: {
      gsc: trafficConnections.some((connection) => connection.source === "gsc"),
      ga4: trafficConnections.some((connection) => connection.source === "ga4"),
    },
    engines: [],
    gsc: snapshots.map((snapshot) => ({
      date: snapshot.date,
      clicks: snapshot.clicks ?? 0,
      impressions: snapshot.impressions ?? 0,
      position: snapshot.avgPosition,
    })),
    // Overview does not render GA4 referral detail or audit markers.
    aiReferrals: [],
    auditMarkers: [],
  };
}

function toDashboardArticles(rows: Awaited<ReturnType<typeof listArticles>>): Article[] {
  return rows.map((article) => ({
    id: article.id,
    topicId: article.topicId,
    title: article.title,
    slug: article.slug,
    metaDescription: article.metaDescription,
    tags: article.tags,
    bodyMarkdown: "",
    bodyLength: article.bodyLength,
    status: article.status,
    version: article.version,
    shape: article.shape,
    gateResultsJson: article.gateResultsJson,
    updatedAt: article.updatedAt.toISOString(),
    createdAt: article.createdAt.toISOString(),
    performance: null,
  }));
}

/**
 * Page-scoped dashboard bundle. Every independent read starts immediately;
 * overlapping agent/inbox/proof dependencies share the same promises.
 */
export async function getDashboardData(context: DashboardContext): Promise<DashboardData> {
  const { workspace, subscription, brand, scope } = context;

  const setupPromise = getSetupRun(brand.id);
  const creditsPromise = getCreditBalance(workspace.id);
  const weeklyPromise = getWeeklyPipelineStats(brand.id);
  const articlesPromise = listArticles(brand.id);
  const findingsPromise = getOpenFindings(workspace.id, { brandId: brand.id });
  const connectionsPromise = listTrafficConnections(brand.id);
  const integrationsPromise = listIntegrations(brand.id);
  const identityPromise = getBrandIdentitySummary(brand.id);

  const setupDataPromise = setupPromise.then(async (run) => {
    if (run && isActiveSubscription(subscription?.status) && isSetupRunStale(run)) {
      await resumeStaleSetupRun(scope, subscription?.planId, run);
    }
    return {
      run: run
        ? { id: run.id, status: run.status, steps: run.steps, briefText: run.briefText }
        : null,
      labels: Object.fromEntries(SETUP_STEPS.map((step) => [step.key, step.label])),
    };
  });

  const agentPromise = getAgentState(scope, {
    brandName: brand.name,
    subscriptionStatus: subscription?.status ?? null,
    preload: {
      setup: setupPromise,
      credits: creditsPromise,
      weekly: weeklyPromise,
      draftRows: articlesPromise.then((articles) =>
        articles
          .filter((article) => article.status === "draft")
          .slice(0, 1)
          .map(({ id, title }) => ({ id, title })),
      ),
      findings: findingsPromise,
      gscRows: connectionsPromise,
      integrations: integrationsPromise,
    },
  });

  const automationPromise = getDashboardAutomation(context, {
    credits: creditsPromise,
    weekly: weeklyPromise,
  });
  const summaryPromise = getVisibilitySummary(workspace.id, brand.id);
  const answersPromise = getVisibilityAnswers(brand.id);
  const trafficPromise = getVisibilityTraffic(brand.id, connectionsPromise);

  const [setup, agent, automation, summary, answers, traffic, articleRows, rawFindings, integrations, identity] =
    await Promise.all([
      setupDataPromise,
      agentPromise,
      automationPromise,
      summaryPromise,
      answersPromise,
      trafficPromise,
      articlesPromise,
      findingsPromise,
      integrationsPromise,
      identityPromise,
    ]);

  const articles = toDashboardArticles(articleRows);
  const findings = rawFindings.map((finding) => ({
    id: finding.id,
    pillar: finding.pillar,
    category: finding.category,
    severity: finding.severity,
    title: finding.title,
    recommendation: finding.recommendation,
    fixCapability: finding.fixCapability,
    fixPayload: finding.fixPayload,
    proposedAt: finding.proposedAt?.toISOString() ?? null,
  }));
  const inboxCount = buildInboxRows({ articles, findings, traffic, integrations, automation }).length;

  return {
    brand: { id: brand.id, name: brand.name, identity },
    setup,
    agent,
    summary,
    answers,
    traffic,
    articles,
    findings,
    integrations,
    automation,
    inboxCount,
  };
}
