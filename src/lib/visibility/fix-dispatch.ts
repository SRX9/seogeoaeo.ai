import { and, count, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditFindings } from "@/lib/db/schema/visibility";
import {
  dispatchDecision,
  type AutonomyLevel,
  type AutonomyMode,
  type DispatchAction,
} from "@/lib/jobs/visibility-agent";
import { applyFix } from "@/lib/visibility/apply-fix";

/**
 * Server-only standing-loop / setup prepare+apply. Monthly `autoFixCap` covers
 * new prepares and live-applies. See pure helpers in `fix-policy.ts`.
 */

export type FixDispatchFinding = {
  id: string;
  category: string;
  fixCapability: string | null;
  proposedAt: Date | null;
};

export type FixDispatchSummary = {
  applied: number;
  proposed: number;
  queued: number;
};

/**
 * Monthly budget used against `autoFixCap`: distinct findings either prepared
 * (`proposedAt`) or live-applied (`auto_applied`) in the calendar month.
 * User-installed fixes do not consume the agent budget.
 */
export async function monthlyFixBudgetUsed(
  workspaceId: string,
  brandId: string,
  now: Date = new Date(),
): Promise<number> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(auditFindings)
    .where(
      and(
        eq(auditFindings.workspaceId, workspaceId),
        eq(auditFindings.brandId, brandId),
        or(
          gte(auditFindings.proposedAt, monthStart),
          and(
            eq(auditFindings.resolution, "auto_applied"),
            gte(auditFindings.resolvedAt, monthStart),
          ),
        ),
      ),
    );
  return row?.n ?? 0;
}

/** Stamp `proposedAt` only where still null (retry-safe). Returns rows updated. */
export async function stampProposedFindings(
  findingIds: string[],
  now: Date = new Date(),
): Promise<number> {
  if (findingIds.length === 0) return 0;
  const result = await getDb()
    .update(auditFindings)
    .set({ proposedAt: now })
    .where(and(inArray(auditFindings.id, findingIds), isNull(auditFindings.proposedAt)))
    .returning({ id: auditFindings.id });
  return result.length;
}

/**
 * Decide + execute for open findings. Cap covers **new prepares and live
 * applies** this month. Exhausted budget → queue (do not stamp more proposes).
 */
export async function dispatchOpenFindings(args: {
  workspaceId: string;
  brandId: string;
  autonomyMode: AutonomyMode;
  overrides: Record<string, AutonomyLevel>;
  autoFixCap: number;
  findings: FixDispatchFinding[];
  now?: Date;
}): Promise<FixDispatchSummary> {
  const now = args.now ?? new Date();
  const summary: FixDispatchSummary = { applied: 0, proposed: 0, queued: 0 };
  const used = await monthlyFixBudgetUsed(args.workspaceId, args.brandId, now);
  let remaining = Math.max(0, args.autoFixCap - used);

  const toPropose: string[] = [];

  for (const finding of args.findings) {
    let action: DispatchAction = dispatchDecision(
      finding,
      args.autonomyMode,
      args.overrides,
    );

    if (action === "apply") {
      if (remaining <= 0) {
        action = finding.proposedAt ? "queue" : "propose";
      } else {
        try {
          await applyFix(finding.id, args.workspaceId, "agent");
          summary.applied += 1;
          remaining -= 1;
          continue;
        } catch (error) {
          console.error(`[visibility] live-apply failed for finding ${finding.id}`, error);
          action = finding.proposedAt ? "queue" : "propose";
        }
      }
    }

    if (action === "propose") {
      if (finding.proposedAt) {
        continue;
      }
      if (remaining <= 0) {
        summary.queued += 1;
        continue;
      }
      toPropose.push(finding.id);
      remaining -= 1;
      continue;
    }

    summary.queued += 1;
  }

  summary.proposed = await stampProposedFindings(toPropose, now);
  return summary;
}
