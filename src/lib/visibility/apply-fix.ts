import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditFindings } from "@/lib/db/schema/visibility";
import { buildFixArtifact, type FixArtifact } from "@/lib/visibility/fix-artifact";

/**
 * V7.2 — resolve a finding after its fix is installed (or claimed installed).
 *
 * Reality check: we cannot write robots.txt / llms.txt / JSON-LD / meta onto the
 * customer's origin without a host or CMS channel. Until that exists:
 * - The agent standing loop **proposes** ready-to-install artifacts (see
 *   `canLiveApply` in visibility-agent) — it does not call this for site fixes.
 * - Owner "apply" means "I installed this on my site; mark the finding done"
 *   (`user_applied`). Next re-audit verifies; re-detection reopens the finding.
 *
 * The artifact builder lives in `fix-artifact.ts` (client-safe) so the fix
 * queue shows the same payload the owner copies/downloads.
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

/**
 * Mark a finding resolved after the fix is installed. `source`:
 * - `"user"` → owner confirmed they installed the artifact (`user_applied`)
 * - `"agent"` → live channel pushed the fix (`auto_applied`, counts against
 *   monthly autoFixCap). Callers must only use `"agent"` when
 *   `canLiveApply` is true — otherwise the standing loop proposes instead.
 *
 * Verified on the next scheduled re-audit; re-detection reopens the row.
 */
export async function applyFix(
  findingId: string,
  workspaceId: string,
  source: "agent" | "user" = "user",
): Promise<ApplyResult> {
  const finding = await loadOwnedFinding(findingId, workspaceId);
  const artifact = buildFixArtifact(finding.fixPayload);
  const db = getDb();
  await db
    .update(auditFindings)
    .set({
      isResolved: true,
      resolvedAt: new Date(),
      resolution: source === "agent" ? "auto_applied" : "user_applied",
      verifiedAt: null,
    })
    .where(eq(auditFindings.id, findingId));
  return { findingId, artifact, resolved: true };
}

/** Revert a previously-applied fix (restores the unresolved before-state). */
export async function revertFix(findingId: string, workspaceId: string): Promise<{ findingId: string; resolved: boolean }> {
  await loadOwnedFinding(findingId, workspaceId);
  const db = getDb();
  await db
    .update(auditFindings)
    .set({ isResolved: false, resolvedAt: null, resolution: null })
    .where(eq(auditFindings.id, findingId));
  return { findingId, resolved: false };
}
