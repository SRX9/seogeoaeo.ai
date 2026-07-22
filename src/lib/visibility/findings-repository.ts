import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditFindings } from "@/lib/db/schema/visibility";
import type { Finding, FixCapability, Pillar, Severity } from "./types";

/** How a finding left the queue. `dismissed` rows are never resurrected. */
export type FindingResolution = "auto_applied" | "user_applied" | "completed" | "dismissed";

/**
 * V8.2: the fix queue's data layer. ONE severity-ranked queue merging every
 * finding from every analyzer (audits, Toolbox runs, agent runs), deduped across
 * runs so the same issue found twice is one row. Shared with V7.3.
 */

export interface OpenFinding {
  id: string;
  auditId: string;
  pillar: Pillar;
  category: string;
  severity: Severity;
  title: string;
  recommendation: string;
  fixCapability: FixCapability | null;
  fixPayload: unknown;
  proposedAt: Date | null;
  createdAt: Date;
}

export interface CompletedFinding extends OpenFinding {
  resolution: FindingResolution | null;
  resolvedAt: Date | null;
  verifiedAt: Date | null;
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Dedupe by (category, title) keeping the most-severe (then newest) instance. */
export function dedupeFindings(rows: OpenFinding[]): OpenFinding[] {
  const sorted = [...rows].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const seen = new Set<string>();
  const out: OpenFinding[] = [];
  for (const f of sorted) {
    const key = `${f.category}::${f.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

/**
 * Persist analyzer findings into the shared fix queue. Deduped by
 * (category, title) per workspace: repeat audits/tool runs/answer runs never
 * pile up duplicates: with resolution-aware semantics:
 * - already OPEN → skip (one row per issue);
 * - DISMISSED → skip (never resurrect a finding the owner said won't-fix);
 * - resolved any other way (applied/completed) → the fix REGRESSED: reopen the
 *   row and stamp `regressedAt` so the monitor cycle can report it.
 * Single owner of the column mapping for every producer (audits, Toolbox runs,
 * answer runs). Returns the insert count.
 */
export async function persistNewFindings(
  workspaceId: string,
  findings: Finding[],
  ref: { auditId?: string; toolRunId?: string; brandId?: string | null } = {},
): Promise<number> {
  if (findings.length === 0) return 0;
  const db = getDb();
  // Dedupe within the brand when known so multi-brand workspaces don't collide;
  // fall back to workspace-wide for legacy rows without brandId.
  const existingWhere = ref.brandId
    ? and(eq(auditFindings.workspaceId, workspaceId), eq(auditFindings.brandId, ref.brandId))
    : eq(auditFindings.workspaceId, workspaceId);
  const existing = await db
    .select({
      id: auditFindings.id,
      category: auditFindings.category,
      title: auditFindings.title,
      isResolved: auditFindings.isResolved,
      resolution: auditFindings.resolution,
    })
    .from(auditFindings)
    .where(existingWhere);
  const byKey = new Map(existing.map((f) => [`${f.category}::${f.title.toLowerCase()}`, f]));

  const fresh: Finding[] = [];
  const regressed: Array<{ id: string; finding: Finding }> = [];
  const seen = new Set<string>(); // dedupe within this batch
  for (const f of findings) {
    const key = `${f.category}::${f.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const row = byKey.get(key);
    if (!row) {
      fresh.push(f);
    } else if (row.isResolved && row.resolution !== "dismissed") {
      regressed.push({ id: row.id, finding: f });
    }
    // open or dismissed → skip
  }

  if (regressed.length > 0) {
    const regressedAt = new Date();
    await db.transaction(async (tx) => {
      for (const { id, finding } of regressed) {
        await tx
          .update(auditFindings)
          .set({
            auditId: ref.auditId,
            toolRunId: ref.toolRunId,
            brandId: ref.brandId,
            pillar: finding.pillar,
            severity: finding.severity,
            recommendation: finding.recommendation,
            fixCapability: finding.fix_capability ?? null,
            fixPayload: finding.fix_payload ?? null,
            isResolved: false,
            resolvedAt: null,
            resolution: null,
            regressedAt,
            proposedAt: null,
            verifiedAt: null,
          })
          .where(eq(auditFindings.id, id));
      }
    });
  }

  if (fresh.length === 0) return 0;
  await db.insert(auditFindings).values(
    fresh.map((f) => ({
      workspaceId,
      brandId: ref.brandId ?? null,
      auditId: ref.auditId ?? null,
      toolRunId: ref.toolRunId ?? null,
      pillar: f.pillar,
      category: f.category,
      severity: f.severity,
      title: f.title,
      recommendation: f.recommendation,
      fixCapability: f.fix_capability ?? null,
      fixPayload: f.fix_payload ?? null,
    })),
  );
  return fresh.length;
}

export interface FindingFilters {
  pillar?: Pillar;
  severity?: Severity;
  capability?: FixCapability;
  brandId?: string;
}

/** All open findings for a workspace (optionally brand), deduped and severity-ranked. */
export async function getOpenFindings(workspaceId: string, filters: FindingFilters = {}): Promise<OpenFinding[]> {
  const db = getDb();
  const conditions = [eq(auditFindings.workspaceId, workspaceId), eq(auditFindings.isResolved, false)];
  if (filters.brandId) conditions.push(eq(auditFindings.brandId, filters.brandId));
  const rows = await db
    .select({
      id: auditFindings.id,
      auditId: auditFindings.auditId,
      pillar: auditFindings.pillar,
      category: auditFindings.category,
      severity: auditFindings.severity,
      title: auditFindings.title,
      recommendation: auditFindings.recommendation,
      fixCapability: auditFindings.fixCapability,
      fixPayload: auditFindings.fixPayload,
      proposedAt: auditFindings.proposedAt,
      createdAt: auditFindings.createdAt,
    })
    .from(auditFindings)
    .where(and(...conditions))
    .orderBy(desc(auditFindings.createdAt));

  let findings = dedupeFindings(
    rows.map((r) => ({ ...r, auditId: r.auditId ?? "", pillar: r.pillar as Pillar, severity: r.severity as Severity, fixCapability: r.fixCapability as FixCapability | null })),
  );
  if (filters.pillar) findings = findings.filter((f) => f.pillar === filters.pillar);
  if (filters.severity) findings = findings.filter((f) => f.severity === filters.severity);
  if (filters.capability) findings = findings.filter((f) => f.fixCapability === filters.capability);
  return findings;
}

/** Completed customer work, excluding dismissed findings, newest first. */
export async function getCompletedFindings(
  workspaceId: string,
  filters: Pick<FindingFilters, "brandId"> = {},
): Promise<CompletedFinding[]> {
  const conditions = [
    eq(auditFindings.workspaceId, workspaceId),
    eq(auditFindings.isResolved, true),
  ];
  if (filters.brandId) conditions.push(eq(auditFindings.brandId, filters.brandId));

  const rows = await getDb()
    .select({
      id: auditFindings.id,
      auditId: auditFindings.auditId,
      pillar: auditFindings.pillar,
      category: auditFindings.category,
      severity: auditFindings.severity,
      title: auditFindings.title,
      recommendation: auditFindings.recommendation,
      fixCapability: auditFindings.fixCapability,
      fixPayload: auditFindings.fixPayload,
      proposedAt: auditFindings.proposedAt,
      createdAt: auditFindings.createdAt,
      resolution: auditFindings.resolution,
      resolvedAt: auditFindings.resolvedAt,
      verifiedAt: auditFindings.verifiedAt,
    })
    .from(auditFindings)
    .where(and(...conditions))
    .orderBy(desc(auditFindings.resolvedAt), desc(auditFindings.createdAt));

  const completed: CompletedFinding[] = [];
  for (const row of rows) {
    if (row.resolution === "dismissed") continue;
    completed.push({
      ...row,
      auditId: row.auditId ?? "",
      pillar: row.pillar as Pillar,
      severity: row.severity as Severity,
      fixCapability: row.fixCapability as FixCapability | null,
      resolution: row.resolution as FindingResolution | null,
    });
  }
  return completed;
}

/** Mark a finding resolved (manual complete / won't-fix dismissal) or reopen it. */
export async function setFindingResolved(
  id: string,
  workspaceId: string,
  resolved: boolean,
  resolution: Extract<FindingResolution, "completed" | "dismissed"> = "completed",
): Promise<void> {
  const db = getDb();
  const finding = await db.query.auditFindings.findFirst({ where: eq(auditFindings.id, id) });
  if (!finding || finding.workspaceId !== workspaceId) throw new Error("Finding not found");
  await db
    .update(auditFindings)
    .set(
      resolved
        ? { isResolved: true, resolvedAt: new Date(), resolution }
        : {
            isResolved: false,
            resolvedAt: null,
            resolution: null,
            proposedAt: null,
            verifiedAt: null,
          },
    )
    .where(eq(auditFindings.id, id));
}
