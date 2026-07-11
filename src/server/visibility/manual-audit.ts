import { getCloudflareRequestContext } from "@/lib/cloudflare/context";
import { createWorkflowInstance } from "@/lib/jobs/workflow";
import { logError } from "@/lib/logging/logger";
import { spendForVisibilityJob } from "@/lib/usage/credits";
import { executeAudit } from "./run-audit";

/**
 * User-triggered (Toolbox) audit execution: run the audit, then charge credits
 * only on success: a failed audit must never burn credits. `refId = auditId`
 * keeps the spend idempotent across Workflow retries.
 */
export async function runManualAudit(
  workspaceId: string,
  auditId: string,
  siteUrl: string,
): Promise<boolean> {
  const ok = await executeAudit(auditId, siteUrl);
  if (ok) await spendForVisibilityJob(workspaceId, "visibility_audit", auditId);
  return ok;
}

/**
 * Kick off execution for a just-created audit row. On Cloudflare this creates a
 * durable `AuditRunWorkflow` instance (mode "manual"): checkpointed, retried,
 * immune to isolate eviction, so the row can't strand in `running`. Elsewhere
 * (plain `next dev`) it falls back to the old inline `waitUntil` promise.
 */
export async function triggerManualAudit(
  workspaceId: string,
  auditId: string,
  siteUrl: string,
): Promise<void> {
  const cf = getCloudflareRequestContext();
  const workflow = cf?.env?.AUDIT_WORKFLOW;
  if (workflow) {
    // Deterministic id: a double-submit for the same audit row is a no-op.
    await createWorkflowInstance(workflow, {
      id: `audit-${auditId}`,
      params: { mode: "manual", workspaceId, siteUrl, auditId },
    });
    return;
  }

  const work = runManualAudit(workspaceId, auditId, siteUrl).catch((error) => {
    logError("visibility.manual_audit_inline_failed", {
      workspaceId,
      auditId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  const ctx = cf?.ctx as { waitUntil?: (promise: Promise<unknown>) => void } | undefined;
  if (ctx?.waitUntil) ctx.waitUntil(work);
}
