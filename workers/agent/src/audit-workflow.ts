import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { appCaller, RETRIES, type AppEnv } from "./app-call";
import { createLogger } from "./logger";

/**
 * Instance params. `manual` = a user-triggered Toolbox audit (the audit row
 * already exists; charge credits on success). `monitor` = one due site from the
 * daily visibility cron (create the row here, then fixes + delta + alert).
 */
type Params =
  | { mode: "manual"; workspaceId: string; siteUrl: string; auditId: string }
  | {
      mode: "monitor";
      workspaceId: string;
      siteUrl: string;
      /** The previous complete audit: baseline for the delta report. */
      baselineAuditId: string;
      planId?: string | null;
    };

/** Full site audit: up to 50 gated page fetches + LLM judges: needs wall clock. */
const EXECUTE_TIMEOUT = "15 minutes";

type StepResponse = { ok?: boolean; auditId?: string; alerted?: boolean };

/**
 * One visibility audit, made durable. Replaces the old `waitUntil` (manual) and
 * inline-cron-loop (monitoring) execution: each phase is a checkpointed
 * `step.do` calling back into `/api/agent/audit-step`, so isolate eviction
 * costs at most one step's retry: never a stranded `running` audit row. The
 * app side is retry-safe: `executeAudit` short-circuits settled rows and
 * `create` reuses the row a lost response left behind. An audit that *ran* and
 * failed comes back `{ ok: false }` (200): terminal, persisted, never retried.
 */
export class AuditRunWorkflow extends WorkflowEntrypoint<AppEnv, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const p = event.payload;
    const log = createLogger({
      workflow: "audit-run",
      instanceId: event.instanceId,
      workspaceId: p.workspaceId,
      mode: p.mode,
      siteUrl: p.siteUrl,
    });
    log.info("workflow.audit.started");
    const post = appCaller<StepResponse>(this.env, "/api/agent/audit-step", event.instanceId);
    const call = (body: Record<string, unknown>) =>
      post({ workspaceId: p.workspaceId, siteUrl: p.siteUrl, ...body });

    if (p.mode === "manual") {
      const result = await step.do(
        "execute",
        { retries: RETRIES, timeout: EXECUTE_TIMEOUT },
        () => call({ step: "manual", auditId: p.auditId }),
      );
      const ok = result.ok === true;
      log.info("workflow.audit.completed", { mode: p.mode, auditId: p.auditId, ok });
      return { mode: p.mode, auditId: p.auditId, ok };
    }

    // monitor: create the new audit row (checkpointed, so a retry of a later
    // step never creates a second row), run it, then fixes + delta + alert.
    const created = await step.do("create", { retries: RETRIES, timeout: "2 minutes" }, () =>
      call({ step: "create" }),
    );
    const auditId = created.auditId;
    if (!auditId) throw new Error("audit-step create returned no auditId");

    const executed = await step.do(
      "execute",
      { retries: RETRIES, timeout: EXECUTE_TIMEOUT },
      () => call({ step: "execute", auditId }),
    );
    if (executed.ok !== true) {
      // The audit row is already `failed` app-side; nothing to compare or fix.
      log.info("workflow.audit.completed", { mode: p.mode, auditId, ok: false });
      return { mode: p.mode, auditId, ok: false };
    }

    const finished = await step.do("finish", { retries: RETRIES, timeout: "10 minutes" }, () =>
      call({
        step: "finish",
        auditId,
        baselineAuditId: p.baselineAuditId,
        planId: p.planId ?? null,
      }),
    );

    // AP4: the cadence answer check. Non-fatal: the audit, fixes, and delta
    // above already landed; a failed answer fan-out must not fail the cycle.
    try {
      await step.do("answers", { retries: RETRIES, timeout: "10 minutes" }, () =>
        call({ step: "answers", auditId }),
      );
    } catch (error) {
      log.error("workflow.audit.answers.failed", {
        auditId,
        error_message:
          error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      });
    }

    const alerted = finished.alerted === true;
    log.info("workflow.audit.completed", { mode: p.mode, auditId, ok: true, alerted });
    return { mode: p.mode, auditId, ok: true, alerted };
  }
}
