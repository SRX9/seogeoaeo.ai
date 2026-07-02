import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditFindings } from "@/lib/db/schema/visibility";
import type { FixCapability, Pillar, Severity } from "./types";

/**
 * V8.2 — the fix queue's data layer. ONE severity-ranked queue merging every
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
  createdAt: Date;
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

export interface FindingFilters {
  pillar?: Pillar;
  severity?: Severity;
  capability?: FixCapability;
}

/** All open findings for a workspace, deduped and severity-ranked. */
export async function getOpenFindings(workspaceId: string, filters: FindingFilters = {}): Promise<OpenFinding[]> {
  const db = getDb();
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
      createdAt: auditFindings.createdAt,
    })
    .from(auditFindings)
    .where(and(eq(auditFindings.workspaceId, workspaceId), eq(auditFindings.isResolved, false)))
    .orderBy(desc(auditFindings.createdAt));

  let findings = dedupeFindings(
    rows.map((r) => ({ ...r, auditId: r.auditId ?? "", pillar: r.pillar as Pillar, severity: r.severity as Severity, fixCapability: r.fixCapability as FixCapability | null })),
  );
  if (filters.pillar) findings = findings.filter((f) => f.pillar === filters.pillar);
  if (filters.severity) findings = findings.filter((f) => f.severity === filters.severity);
  if (filters.capability) findings = findings.filter((f) => f.fixCapability === filters.capability);
  return findings;
}

/** Mark a finding resolved (manual complete) or dismissed (won't fix). */
export async function setFindingResolved(id: string, workspaceId: string, resolved: boolean): Promise<void> {
  const db = getDb();
  const finding = await db.query.auditFindings.findFirst({ where: eq(auditFindings.id, id) });
  if (!finding || finding.workspaceId !== workspaceId) throw new Error("Finding not found");
  await db.update(auditFindings).set({ isResolved: resolved }).where(eq(auditFindings.id, id));
}
