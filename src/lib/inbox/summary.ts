import { and, count, eq, gt, isNull, or } from "drizzle-orm";
import type { requireApiBrand } from "@/lib/api/server";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { isActiveSubscription } from "@/lib/billing/plans";
import { getDb } from "@/lib/db";
import { articles } from "@/lib/db/schema/content";
import { agentApprovals } from "@/lib/db/schema";
import { listIntegrations } from "@/lib/integrations/repository";
import { isIntegrationOperational } from "@/lib/integrations/providers";
import { countOwnerRequestsFromParts } from "@/lib/inbox/owner-request";
import { getCreditBalance } from "@/lib/usage/credits";

type InboxSummaryContext = Awaited<ReturnType<typeof requireApiBrand>>;

/**
 * Cheap server-side inbox badge count: no article bodies, no full traffic series.
 * Semantics match the customer-ready owner request model without loading article bodies.
 */
export async function getInboxSummaryCount(context: InboxSummaryContext): Promise<number> {
  const { workspace, subscription, brand } = context;
  const db = getDb();
  const [draftRow, integrations, approvalRow, credits] = await Promise.all([
    db
      .select({ n: count() })
      .from(articles)
      .where(and(eq(articles.brandId, brand.id), eq(articles.status, "draft"))),
    listIntegrations(brand.id),
    db
      .select({ n: count() })
      .from(agentApprovals)
      .where(
        and(
          eq(agentApprovals.brandId, brand.id),
          eq(agentApprovals.status, "pending"),
          or(isNull(agentApprovals.expiresAt), gt(agentApprovals.expiresAt, new Date())),
        ),
      ),
    getCreditBalance(workspace.id),
  ]);

  const draftCount = Number(draftRow[0]?.n ?? 0);
  return countOwnerRequestsFromParts({
    approvalCount: Number(approvalRow[0]?.n ?? 0),
    draftCount,
    reviewBeforePublishing: brand.autonomyMode !== "FULL_AUTO",
    publishingConnected: integrations.some(isIntegrationOperational),
    billingPaused:
      !isActiveSubscription(subscription?.status) ||
      credits.total < CREDIT_COSTS.article_generation,
  });
}
