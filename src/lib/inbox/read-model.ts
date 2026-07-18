import { getAgentState } from "@/lib/agent/state";
import { listPendingAgentApprovals } from "@/lib/agent/events";
import { listArticles } from "@/lib/articles/repository";
import type { requireApiBrand } from "@/lib/api/server";
import type { AgentApprovalView, InboxData } from "@/lib/api/queries";
import { getDashboardAutomation } from "@/lib/dashboard/read-model";
import { buildOwnerRequests } from "@/lib/inbox/owner-request";
import { listTrafficConnections } from "@/lib/integrations/google-traffic";
import { isIntegrationOperational } from "@/lib/integrations/providers";
import { listIntegrations } from "@/lib/integrations/repository";
import { getSetupRun } from "@/lib/jobs/setup-run";
import { getWeeklyPipelineStats } from "@/lib/jobs/repository";
import { getCreditBalance } from "@/lib/usage/credits";
import { getOpenFindings } from "@/lib/visibility/findings-repository";

type InboxContext = Awaited<ReturnType<typeof requireApiBrand>>;

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

  const [agent, approvalRows, articleRows, integrations, automation] = await Promise.all([
    agentPromise,
    approvalsPromise,
    articlesPromise,
    integrationsPromise,
    automationPromise,
  ]);

  const approvals = toApprovalViews(approvalRows);
  const requests = buildOwnerRequests({
    agent,
    approvals,
    articles: articleRows.map((article) => ({
      id: article.id,
      title: article.title,
      status: article.status,
      metaDescription: article.metaDescription,
    })),
    reviewBeforePublishing: !automation.autoPublish,
    publishingConnected: integrations.some(isIntegrationOperational),
  });

  return {
    requests,
    inboxCount: requests.length,
  };
}
