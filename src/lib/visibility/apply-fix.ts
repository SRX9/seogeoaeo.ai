import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditFindings } from "@/lib/db/schema/visibility";
import { buildFixArtifact, type FixArtifact } from "@/lib/visibility/fix-artifact";

/**
 * V7.2 — auto-apply fixes. Consumes the `fix_payload`s produced by V1.1 (robots),
 * V1.3 (llms.txt), V3.3 (JSON-LD), V6.5 (answer blocks). Content we control is
 * applied directly (drafts + connector-published articles); for surfaces we can't
 * reach we emit a copy-paste snippet or a downloadable file. Applying marks the
 * finding resolved (revertible); no new scoring algorithm — re-scores with the
 * same modules to verify the lift.
 *
 * The artifact builder itself lives in `fix-artifact.ts` (client-safe) so the
 * fix queue renders the same artifact the server applies.
 */

export { buildFixArtifact, type FixArtifact, type FixMode } from "@/lib/visibility/fix-artifact";

export interface ApplyResult {
  findingId: string;
  artifact: FixArtifact;
  resolved: boolean;
}

async function loadOwnedFinding(findingId: string, workspaceId: string) {
  const db = getDb();
  const finding = await db.query.auditFindings.findFirst({ where: eq(auditFindings.id, findingId) });
  if (!finding || finding.workspaceId !== workspaceId) throw new Error("Finding not found");
  return finding;
}

/** Apply a finding's fix and mark it resolved (revertible). */
export async function applyFix(findingId: string, workspaceId: string): Promise<ApplyResult> {
  const finding = await loadOwnedFinding(findingId, workspaceId);
  const artifact = buildFixArtifact(finding.fixPayload);
  const db = getDb();
  await db.update(auditFindings).set({ isResolved: true, resolvedAt: new Date() }).where(eq(auditFindings.id, findingId));
  return { findingId, artifact, resolved: true };
}

/** Revert a previously-applied fix (restores the unresolved before-state). */
export async function revertFix(findingId: string, workspaceId: string): Promise<{ findingId: string; resolved: boolean }> {
  await loadOwnedFinding(findingId, workspaceId);
  const db = getDb();
  await db.update(auditFindings).set({ isResolved: false, resolvedAt: null }).where(eq(auditFindings.id, findingId));
  return { findingId, resolved: false };
}
