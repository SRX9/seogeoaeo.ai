import { and, desc, eq, isNotNull, lt } from "drizzle-orm";
import type { AgentObjectiveMetricId } from "@/lib/agent/types";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import {
  answerRuns,
  articlePublications,
  auditFindings,
  audits,
  brands,
  creditLedger,
  publicationGateRuns,
  trackedPrompts,
} from "@/lib/db/schema";
import { MAX_FINITE_MONITORING_CADENCE_DAYS } from "@/lib/jobs/visibility-agent";
import { ENGINES } from "@/lib/visibility/answers";

const MAX_RECORD_REFS = 20;
const ANSWER_BATCH_MAX_AGE_MS =
  MAX_FINITE_MONITORING_CADENCE_DAYS * 24 * 60 * 60_000;

export type ObjectiveMetricMeasurement = {
  value: number;
  observedAt: string;
  recordRefs: string[];
};

type AnswerMeasurementRow = {
  id: string;
  promptId: string;
  engine: string;
  ranAt: Date;
  brandMentioned: boolean;
  brandCited: boolean;
};

type AnswerBatchEvidence = {
  auditId: string;
  monitorFinishedAt: Date;
  completionReceiptId: string;
  completionReceiptAt: Date;
  activePromptIds: string[];
  now: Date;
};

type CriticalCrawlerFindingRow = {
  id: string;
  createdAt: Date;
  regressedAt: Date | null;
  proposedAt: Date | null;
  verifiedAt: Date | null;
};

type PublishedGateRow = {
  publicationId: string;
  articleId: string;
  publishedAt: Date;
  gateId: string | null;
  gateCompletedAt: Date | null;
};

function newestDate(dates: Array<Date | null | undefined>): Date {
  return dates.reduce<Date>(
    (latest, date) => (date && date.getTime() > latest.getTime() ? date : latest),
    new Date(0),
  );
}

function boundedRefs(refs: string[]): string[] {
  return [...new Set(refs)].slice(0, MAX_RECORD_REFS);
}

export function summarizeAnswerBatch(
  rows: AnswerMeasurementRow[],
  evidence: AnswerBatchEvidence,
): ObjectiveMetricMeasurement | null {
  if (rows.length === 0 || evidence.activePromptIds.length === 0) return null;
  if (evidence.completionReceiptAt.getTime() < evidence.monitorFinishedAt.getTime()) {
    return null;
  }

  const expectedCells = new Set(
    evidence.activePromptIds.flatMap((promptId) =>
      ENGINES.map((engine) => `${promptId}:${engine}`),
    ),
  );
  if (rows.length !== expectedCells.size) return null;
  for (const row of rows) {
    if (
      row.ranAt.getTime() < evidence.monitorFinishedAt.getTime() ||
      row.ranAt.getTime() > evidence.completionReceiptAt.getTime() ||
      !expectedCells.delete(`${row.promptId}:${row.engine}`)
    ) {
      return null;
    }
  }
  if (expectedCells.size > 0) return null;

  const observedAt = newestDate([
    evidence.completionReceiptAt,
    ...rows.map((row) => row.ranAt),
  ]);
  const ageMs = evidence.now.getTime() - observedAt.getTime();
  // The longest finite visibility cadence configured by the product is 30
  // days. At that boundary the next cycle is due, so the old result is stale.
  if (ageMs < 0 || ageMs >= ANSWER_BATCH_MAX_AGE_MS) return null;

  const eligible = rows.filter((row) => row.brandMentioned || row.brandCited).length;
  return {
    value: Math.round((eligible / rows.length) * 10_000) / 100,
    observedAt: observedAt.toISOString(),
    recordRefs: boundedRefs([
      `audit:${evidence.auditId}`,
      `credit_ledger:${evidence.completionReceiptId}`,
      ...rows.map((row) => `answer_run:${row.id}`),
    ]),
  };
}

export function summarizeCriticalCrawlerFindings(
  latestOwnedAudit: { id: string; completedAt: Date },
  rows: CriticalCrawlerFindingRow[],
): ObjectiveMetricMeasurement {
  const byActivity = [...rows].sort(
    (left, right) =>
      newestDate([
        right.createdAt,
        right.regressedAt,
        right.proposedAt,
        right.verifiedAt,
      ]).getTime() -
      newestDate([
        left.createdAt,
        left.regressedAt,
        left.proposedAt,
        left.verifiedAt,
      ]).getTime(),
  );
  return {
    value: rows.length,
    observedAt: newestDate([
      latestOwnedAudit.completedAt,
      ...rows.flatMap((row) => [
        row.createdAt,
        row.regressedAt,
        row.proposedAt,
        row.verifiedAt,
      ]),
    ]).toISOString(),
    recordRefs: boundedRefs([
      `audit:${latestOwnedAudit.id}`,
      ...byActivity.map((row) => `audit_finding:${row.id}`),
    ]),
  };
}

export function summarizeGroundedPublications(
  rows: PublishedGateRow[],
): ObjectiveMetricMeasurement | null {
  if (rows.length === 0) return null;
  const groundedArticleIds = new Set(
    rows.filter((row) => row.gateId !== null).map((row) => row.articleId),
  );
  const byObservation = [...rows].sort(
    (left, right) =>
      newestDate([right.publishedAt, right.gateCompletedAt]).getTime() -
      newestDate([left.publishedAt, left.gateCompletedAt]).getTime(),
  );
  return {
    value: groundedArticleIds.size,
    observedAt: newestDate(
      rows.flatMap((row) => [row.publishedAt, row.gateCompletedAt]),
    ).toISOString(),
    recordRefs: boundedRefs(
      byObservation.flatMap((row) => [
        `article_publication:${row.publicationId}`,
        ...(row.gateId ? [`publication_gate_run:${row.gateId}`] : []),
      ]),
    ),
  };
}

async function ownedBrandExists(scope: BrandScope): Promise<boolean> {
  const [owned] = await getDb()
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.id, scope.brandId), eq(brands.workspaceId, scope.workspaceId)))
    .limit(1);
  return Boolean(owned);
}

async function measureAnswerShare(
  scope: BrandScope,
): Promise<ObjectiveMetricMeasurement | null> {
  const db = getDb();
  const [latestCycle] = await db
    .select({
      id: audits.id,
      status: audits.status,
      completeness: audits.completeness,
      monitorFinishedAt: audits.monitorFinishedAt,
    })
    .from(audits)
    .where(
      and(
        eq(audits.workspaceId, scope.workspaceId),
        eq(audits.brandId, scope.brandId),
        eq(audits.kind, "owned"),
        isNotNull(audits.monitorFinishedAt),
      ),
    )
    .orderBy(desc(audits.monitorFinishedAt), desc(audits.id))
    .limit(1);
  if (
    !latestCycle?.monitorFinishedAt ||
    latestCycle.status !== "complete" ||
    latestCycle.completeness !== "complete"
  ) {
    return null;
  }

  const [receipt, activePrompts, rows] = await Promise.all([
    db
      .select({ id: creditLedger.id, createdAt: creditLedger.createdAt })
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.workspaceId, scope.workspaceId),
          eq(creditLedger.brandId, scope.brandId),
          eq(creditLedger.reason, "answer_run"),
          eq(creditLedger.refType, "visibility"),
          eq(creditLedger.refId, latestCycle.id),
          lt(creditLedger.delta, 0),
        ),
      )
      .orderBy(desc(creditLedger.createdAt), desc(creditLedger.id))
      .limit(1),
    db
      .select({ id: trackedPrompts.id })
      .from(trackedPrompts)
      .where(
        and(
          eq(trackedPrompts.brandId, scope.brandId),
          eq(trackedPrompts.active, true),
        ),
      )
      .orderBy(trackedPrompts.id),
    db
      .select({
        id: answerRuns.id,
        promptId: answerRuns.promptId,
        engine: answerRuns.engine,
        ranAt: answerRuns.ranAt,
        brandMentioned: answerRuns.brandMentioned,
        brandCited: answerRuns.brandCited,
      })
      .from(answerRuns)
      .where(
        and(
          eq(answerRuns.brandId, scope.brandId),
          eq(answerRuns.refId, latestCycle.id),
        ),
      )
      .orderBy(answerRuns.id),
  ]);
  const completionReceipt = receipt[0];
  if (!completionReceipt) return null;
  return summarizeAnswerBatch(rows, {
    auditId: latestCycle.id,
    monitorFinishedAt: latestCycle.monitorFinishedAt,
    completionReceiptId: completionReceipt.id,
    completionReceiptAt: completionReceipt.createdAt,
    activePromptIds: activePrompts.map((prompt) => prompt.id),
    now: new Date(),
  });
}

async function measureCriticalCrawlerFindings(
  scope: BrandScope,
): Promise<ObjectiveMetricMeasurement | null> {
  const db = getDb();
  const [latestOwnedAudit] = await db
    .select({ id: audits.id, completedAt: audits.completedAt })
    .from(audits)
    .where(
      and(
        eq(audits.workspaceId, scope.workspaceId),
        eq(audits.brandId, scope.brandId),
        eq(audits.kind, "owned"),
        eq(audits.status, "complete"),
        eq(audits.completeness, "complete"),
        isNotNull(audits.completedAt),
      ),
    )
    .orderBy(desc(audits.completedAt), desc(audits.id))
    .limit(1);
  if (!latestOwnedAudit?.completedAt) return null;

  const rows = await db
    .select({
      id: auditFindings.id,
      createdAt: auditFindings.createdAt,
      regressedAt: auditFindings.regressedAt,
      proposedAt: auditFindings.proposedAt,
      verifiedAt: auditFindings.verifiedAt,
    })
    .from(auditFindings)
    .innerJoin(
      audits,
      and(
        eq(auditFindings.auditId, audits.id),
        eq(audits.workspaceId, scope.workspaceId),
        eq(audits.brandId, scope.brandId),
        eq(audits.kind, "owned"),
        eq(audits.status, "complete"),
        eq(audits.completeness, "complete"),
      ),
    )
    .where(
      and(
        eq(auditFindings.workspaceId, scope.workspaceId),
        eq(auditFindings.brandId, scope.brandId),
        eq(auditFindings.category, "crawler_access"),
        eq(auditFindings.severity, "critical"),
        eq(auditFindings.isResolved, false),
      ),
    );
  return summarizeCriticalCrawlerFindings(
    { id: latestOwnedAudit.id, completedAt: latestOwnedAudit.completedAt },
    rows,
  );
}

async function measureGroundedPublications(
  scope: BrandScope,
): Promise<ObjectiveMetricMeasurement | null> {
  const rows = await getDb()
    .select({
      publicationId: articlePublications.id,
      articleId: articlePublications.articleId,
      publishedAt: articlePublications.publishedAt,
      gateId: publicationGateRuns.id,
      gateCompletedAt: publicationGateRuns.completedAt,
    })
    .from(articlePublications)
    .leftJoin(
      publicationGateRuns,
      and(
        eq(publicationGateRuns.workspaceId, scope.workspaceId),
        eq(publicationGateRuns.brandId, scope.brandId),
        eq(publicationGateRuns.articleId, articlePublications.articleId),
        eq(publicationGateRuns.finalContentHash, articlePublications.publishedHash),
        eq(publicationGateRuns.status, "passed"),
        eq(publicationGateRuns.decision, "allow"),
        eq(publicationGateRuns.automaticPublicationAllowed, true),
      ),
    )
    .where(
      and(
        eq(articlePublications.workspaceId, scope.workspaceId),
        eq(articlePublications.brandId, scope.brandId),
        eq(articlePublications.status, "published"),
        isNotNull(articlePublications.publishedAt),
        isNotNull(articlePublications.publishedHash),
      ),
    )
    .orderBy(desc(articlePublications.publishedAt), desc(articlePublications.id));
  return summarizeGroundedPublications(
    rows.flatMap((row) =>
      row.publishedAt
        ? [{ ...row, publishedAt: row.publishedAt }]
        : [],
    ),
  );
}

/**
 * Read a metric only from persisted, tenant-owned evidence. A missing exact
 * signal returns null rather than substituting a nearby or inferred metric.
 */
export async function measureObjectiveMetric(
  scope: BrandScope,
  metric: AgentObjectiveMetricId,
): Promise<ObjectiveMetricMeasurement | null> {
  if (!(await ownedBrandExists(scope))) return null;
  switch (metric) {
    case "ai_answer_share_percent":
      return measureAnswerShare(scope);
    case "critical_crawler_findings":
      return measureCriticalCrawlerFindings(scope);
    case "grounded_pages_published":
      return measureGroundedPublications(scope);
    case "qualified_non_brand_clicks":
      // Search Console rows expose query-level clicks, but no durable
      // qualification/intent decision. Do not mislabel all non-brand traffic.
      return null;
  }
}
