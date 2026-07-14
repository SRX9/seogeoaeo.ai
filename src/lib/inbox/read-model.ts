import { getAgentState } from "@/lib/agent/state";
import { listPendingAgentApprovals } from "@/lib/agent/events";
import { listArticles } from "@/lib/articles/repository";
import type { requireApiBrand } from "@/lib/api/server";
import type {
  AgentApprovalView,
  Article,
  InboxData,
  VisibilityFinding,
  VisibilityTraffic,
} from "@/lib/api/queries";
import { getDashboardAutomation } from "@/lib/dashboard/read-model";
import { buildInboxRows } from "@/lib/inbox/rows";
import { listTrafficConnections } from "@/lib/integrations/google-traffic";
import { listIntegrations } from "@/lib/integrations/repository";
import { getSetupRun } from "@/lib/jobs/setup-run";
import { getWeeklyPipelineStats } from "@/lib/jobs/repository";
import { getCreditBalance } from "@/lib/usage/credits";
import { getOpenFindings } from "@/lib/visibility/findings-repository";

type InboxContext = Awaited<ReturnType<typeof requireApiBrand>>;

function toArticleViews(rows: Awaited<ReturnType<typeof listArticles>>): Article[] {
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

function toFindingViews(
  rows: Awaited<ReturnType<typeof getOpenFindings>>,
): VisibilityFinding[] {
  return rows.map((finding) => ({
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
}

export function toApprovalViews(
  approvals: Awaited<ReturnType<typeof listPendingAgentApprovals>>,
): AgentApprovalView[] {
  return approvals.map((approval) => ({
    id: approval.id,
    taskId: approval.taskId,
    actionType: approval.actionType,
    resourceRef: approval.resourceRef,
    beforeState: approval.beforeState,
    afterState: approval.afterState,
    riskLevel: approval.riskLevel,
    expectedBenefit: approval.expectedBenefit,
    expiresAt: approval.expiresAt?.toISOString() ?? null,
    createdAt: approval.createdAt.toISOString(),
  }));
}

/** One auth boundary and one parallel read graph for the complete Inbox route. */
export async function getInboxData(context: InboxContext): Promise<InboxData> {
  const { workspace, subscription, brand, scope } = context;

  const setupPromise = getSetupRun(brand.id);
  const creditsPromise = getCreditBalance(workspace.id);
  const weeklyPromise = getWeeklyPipelineStats(brand.id);
  const articlesPromise = listArticles(brand.id);
  const findingsPromise = getOpenFindings(workspace.id, { brandId: brand.id });
  const connectionsPromise = listTrafficConnections(brand.id);
  const integrationsPromise = listIntegrations(brand.id);
  const approvalsPromise = listPendingAgentApprovals(brand.id);

  const automationPromise = getDashboardAutomation(context, {
    credits: creditsPromise,
    weekly: weeklyPromise,
  });
  const agentPromise = getAgentState(scope, {
    brandName: brand.name,
    subscriptionStatus: subscription?.status ?? null,
    preload: {
      setup: setupPromise,
      credits: creditsPromise,
      weekly: weeklyPromise,
      draftRows: articlesPromise.then((rows) =>
        rows
          .filter((article) => article.status === "draft")
          .slice(0, 1)
          .map(({ id, title }) => ({ id, title }))),
      findings: findingsPromise,
      gscRows: connectionsPromise,
      integrations: integrationsPromise,
      approvals: approvalsPromise,
    },
  });

  const [agent, approvalRows, articleRows, findingRows, connections, integrations, automation] =
    await Promise.all([
      agentPromise,
      approvalsPromise,
      articlesPromise,
      findingsPromise,
      connectionsPromise,
      integrationsPromise,
      automationPromise,
    ]);

  const articles = toArticleViews(articleRows);
  const findings = toFindingViews(findingRows);
  const approvals = toApprovalViews(approvalRows);
  const traffic: VisibilityTraffic = {
    connected: {
      gsc: connections.some((connection) => connection.source === "gsc"),
      ga4: connections.some((connection) => connection.source === "ga4"),
    },
    engines: [],
    gsc: [],
    aiReferrals: [],
    auditMarkers: [],
  };

  return {
    agent,
    approvals,
    articles,
    findings,
    traffic,
    integrations,
    automation,
    inboxCount:
      approvals.length + buildInboxRows({ articles, findings, traffic, integrations, automation }).length,
  };
}
