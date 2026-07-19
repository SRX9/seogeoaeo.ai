import { NextResponse } from "next/server";
import { getCloudflareRequestContext } from "@/lib/cloudflare/context";
import { listBrands } from "@/lib/brand/repository";
import { isCronAuthorized } from "@/lib/cron/auth";
import { listActiveWorkspaceIds } from "@/lib/jobs/enumerate";
import { enqueueWorkflowInstances, type InstanceOptions } from "@/lib/jobs/workflow";
import {
  countScheduledWorkPastSlo,
  assignScheduledReplayInstance,
  deadLetterExhaustedScheduledWork,
  listReplayableScheduledWork,
  recordExpectedScheduledWork,
  recordScheduledEnqueueOutcome,
  requestScheduledWorkReplay,
  type ScheduledWorkExpectation,
} from "@/lib/jobs/scheduled-work";
import { sendOperatorAlert } from "@/lib/email/notify";
import { sweepStaleSetupRuns } from "@/lib/jobs/setup-run";
import { deleteExpiredRateLimitBuckets } from "@/lib/security/rate-limit";
import { logError, logInfo, logWarn } from "@/lib/logging/logger";
import { getUtcDayKey } from "@/lib/workspace/settings";
import { getAgentSafetyDecision } from "@/lib/agent/safety";
import { drainObjectiveReplans } from "@/lib/agent/objective-replan";
import { drainMemoryCorrectionPropagation } from "@/lib/agent/memory-corrections";
import { scanConnectorHealthSignals } from "@/lib/connectors/service";
import { listRecoverableConnectorMutations } from "@/lib/connectors/repository";
import { triggerConnectorMutation } from "@/lib/connectors/trigger";
import {
  purgeExpiredEvidence,
  purgeExpiredGroundingAudit,
} from "@/lib/grounding/repository";
import { evaluateOperationalSlos } from "@/lib/observability/slos";
import { purgeExpiredTraceSpans } from "@/lib/observability/trace";

/**
 * Daily enumerator. Cloudflare's scheduled handler POSTs here once a day; this
 * route does no content work itself. It lists every active brand and fans them
 * out into one `DailyBrandWorkflow` instance each. The instance id
 * `daily-<brandId>-<runDate>` makes enqueue idempotent: a same-day re-fire
 * collides on the id and is skipped, so the durable Workflow (not this request)
 * owns retries and per-article checkpointing.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const replayId = searchParams.get("replay");
  const reconcileOnly = searchParams.get("reconcile") === "1" || Boolean(replayId);
  if (replayId && !(await requestScheduledWorkReplay(replayId))) {
    return NextResponse.json({ error: "Scheduled work item not found" }, { status: 404 });
  }

  let sloEvaluation: Awaited<ReturnType<typeof evaluateOperationalSlos>> | null = null;
  try {
    sloEvaluation = await evaluateOperationalSlos();
  } catch (error) {
    logError("cron.daily.slo_evaluation_failed", {
      error: error instanceof Error ? error.message.slice(0, 500) : String(error),
    });
  }

  let objectiveReplans: Awaited<ReturnType<typeof drainObjectiveReplans>> | null = null;
  try {
    objectiveReplans = await drainObjectiveReplans({ limit: 25 });
  } catch (error) {
    logError("cron.daily.objective_replan_drain_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  let memoryCorrections: Awaited<ReturnType<typeof drainMemoryCorrectionPropagation>> | null = null;
  try {
    memoryCorrections = await drainMemoryCorrectionPropagation({ limit: 25 });
  } catch (error) {
    logError("cron.daily.memory_correction_drain_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  let connectorHealth: Awaited<ReturnType<typeof scanConnectorHealthSignals>> | null = null;
  try {
    connectorHealth = await scanConnectorHealthSignals(100);
  } catch (error) {
    logError("cron.daily.connector_health_scan_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  // Setup Runs stranded in `running` (workflow died before persisting) are
  // resumed or terminally settled here, so recovery never depends on the
  // owner keeping the dashboard open. Best-effort like the other sweeps.
  let setupRunSweep: Awaited<ReturnType<typeof sweepStaleSetupRuns>> | null = null;
  try {
    setupRunSweep = await sweepStaleSetupRuns();
    if (setupRunSweep.scanned > 0) {
      logInfo("cron.daily.setup_runs_swept", setupRunSweep);
    }
  } catch (error) {
    logError("cron.daily.setup_run_sweep_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const connectorRecoveries = { checked: 0, restarted: 0, failed: 0 };
  try {
    const recoverable = await listRecoverableConnectorMutations(25);
    connectorRecoveries.checked = recoverable.length;
    for (const mutation of recoverable) {
      try {
        const recovery = await triggerConnectorMutation(
          { workspaceId: mutation.workspaceId, brandId: mutation.brandId },
          mutation,
        );
        if (
          recovery.enqueue === "created" ||
          recovery.enqueue === "restarted" ||
          recovery.mode === "inline"
        ) {
          connectorRecoveries.restarted += 1;
        }
      } catch (error) {
        connectorRecoveries.failed += 1;
        logError("cron.daily.connector_recovery_failed", {
          mutationId: mutation.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    logError("cron.daily.connector_recovery_scan_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const safety = getAgentSafetyDecision("drafting", { actor: "agent" });
  if (!safety.allowed) {
    return NextResponse.json({
      ok: true,
      disabled: true,
      reason: safety.reason,
      objectiveReplans,
      memoryCorrections,
      connectorHealth,
      connectorRecoveries,
      sloBreaches: sloEvaluation?.breached.map((item) => item.key) ?? null,
    });
  }

  const workflow = getCloudflareRequestContext()?.env?.AGENT_WORKFLOW;
  if (!workflow) {
    logError("cron.daily.no_workflow_binding", {});
    return NextResponse.json(
      { error: "AGENT_WORKFLOW binding is not available" },
      { status: 500 },
    );
  }

  // Housekeeping piggybacked on the daily fire: expired rate-limit buckets
  // (one row per IP/action) would otherwise accumulate forever. Best-effort.
  // a failed sweep must not block the content agent.
  if (!reconcileOnly) {
    const [rateBuckets, expiredEvidence, expiredTraces] = await Promise.allSettled([
      deleteExpiredRateLimitBuckets(),
      purgeExpiredEvidence(),
      purgeExpiredTraceSpans(),
    ]);
    // Evidence deletion updates retained citation/ledger references through
    // foreign keys, so audit deletion follows it instead of racing it.
    const [expiredGroundingAudit] = await Promise.allSettled([
      purgeExpiredGroundingAudit(),
    ]);
    if (rateBuckets.status === "fulfilled") {
      const swept = rateBuckets.value;
      if (swept > 0) logInfo("cron.daily.rate_buckets_swept", { swept });
    } else {
      logWarn("cron.daily.rate_bucket_sweep_failed", {
        error:
          rateBuckets.reason instanceof Error
            ? rateBuckets.reason.message
            : String(rateBuckets.reason),
      });
    }
    if (expiredEvidence.status === "fulfilled") {
      const { deletedBundles, deletedSources } = expiredEvidence.value;
      if (deletedBundles > 0 || deletedSources > 0) {
        logInfo("cron.daily.evidence_purged", { deletedBundles, deletedSources });
      }
    } else {
      logWarn("cron.daily.evidence_purge_failed", {
        error:
          expiredEvidence.reason instanceof Error
            ? expiredEvidence.reason.message
            : String(expiredEvidence.reason),
      });
    }
    if (expiredTraces.status === "fulfilled") {
      if (expiredTraces.value > 0) {
        logInfo("cron.daily.traces_purged", { deleted: expiredTraces.value });
      }
    } else {
      logWarn("cron.daily.trace_purge_failed", {
        error:
          expiredTraces.reason instanceof Error
            ? expiredTraces.reason.message
            : String(expiredTraces.reason),
      });
    }
    if (expiredGroundingAudit.status === "fulfilled") {
      const { deletedGateRuns, deletedClaimLedgers } = expiredGroundingAudit.value;
      if (deletedGateRuns > 0 || deletedClaimLedgers > 0) {
        logInfo("cron.daily.grounding_audit_purged", {
          deletedGateRuns,
          deletedClaimLedgers,
        });
      }
    } else {
      logWarn("cron.daily.grounding_audit_purge_failed", {
        error:
          expiredGroundingAudit.reason instanceof Error
            ? expiredGroundingAudit.reason.message
            : String(expiredGroundingAudit.reason),
      });
    }
  }

  const runDate = getUtcDayKey();
  // Work that kept dying through its replay budget is parked dead_letter (an
  // operator replay revives it); page once at the status transition so it
  // can't rot silently the way a forever-retrying row would. Best-effort.
  try {
    const deadLettered = await deadLetterExhaustedScheduledWork("daily_brand");
    if (deadLettered.length > 0) {
      logError("cron.daily.scheduled_work_dead_lettered", {
        count: deadLettered.length,
        instanceIds: deadLettered.slice(0, 20).map((row) => row.workflowInstanceId),
      });
      await sendOperatorAlert(`Daily agent work dead-lettered (${deadLettered.length})`, [
        ...deadLettered
          .slice(0, 20)
          .map(
            (row) =>
              `${row.scheduleKey} brand=${row.brandId} instance=${row.workflowInstanceId} id=${row.id}`,
          ),
        "replay: GET /api/cron/daily?replay=<id> (cron-authorized)",
      ]);
    }
  } catch (error) {
    logError("cron.daily.dead_letter_sweep_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const replayable = await listReplayableScheduledWork("daily_brand");
  let workspaceCount = 0;
  let expected: ScheduledWorkExpectation[] = [];
  if (!reconcileOnly) {
    const workspaces = await listActiveWorkspaceIds();
    workspaceCount = workspaces.length;
    const brandsByWorkspace = await Promise.all(
      workspaces.map(async (ws) => ({
        ws,
        brands: await listBrands(ws.workspaceId),
      })),
    );

    expected = brandsByWorkspace.flatMap(({ ws, brands }) =>
      brands.map((brand) => {
        const instance: InstanceOptions = {
          id: `daily-${brand.id}-${runDate}`,
          params: {
            workspaceId: ws.workspaceId,
            brandId: brand.id,
            brandName: brand.name,
            planId: ws.planId,
            runDate,
          },
        };
        return {
          workspaceId: ws.workspaceId,
          brandId: brand.id,
          scheduleKind: "daily_brand",
          scheduleKey: runDate,
          instance,
        };
      }),
    );
    // The replay ledger is written before fan-out, so a request crash cannot
    // make a dropped brand invisible to reconciliation.
    await recordExpectedScheduledWork(expected);
  }

  const byInstanceId = new Map<string, InstanceOptions>();
  const replayedLogicalWork = new Set<string>();
  for (const row of replayable) {
    const replayRunDate = String(row.payload.runDate);
    const logicalId = `daily-${row.brandId}-${replayRunDate}`;
    const replayInstanceId = `${logicalId}-replay-${row.attemptCount + 1}`;
    await assignScheduledReplayInstance(row.id, replayInstanceId);
    replayedLogicalWork.add(`${row.brandId}:${replayRunDate}`);
    byInstanceId.set(replayInstanceId, { id: replayInstanceId, params: row.payload });
  }
  for (const item of expected) {
    if (!replayedLogicalWork.has(`${item.brandId}:${item.scheduleKey}`)) {
      byInstanceId.set(item.instance.id, item.instance);
    }
  }
  const instances = [...byInstanceId.values()];

  const { created, skipped, failed } = await enqueueWorkflowInstances(
    workflow,
    instances,
    "cron.daily",
    (instance, outcome, error) => recordScheduledEnqueueOutcome(instance.id, outcome, error),
  );

  const pastSlo = await countScheduledWorkPastSlo("daily_brand");
  if (pastSlo > 0) {
    logError("cron.daily.incomplete_past_slo", { runDate, count: pastSlo });
  }

  logInfo("cron.daily.enqueued", {
    runDate,
    mode: reconcileOnly ? "reconcile" : "enumerate",
    workspaces: workspaceCount,
    brands: instances.length,
    created,
    skipped,
    failed,
    replayed: replayable.length,
    pastSlo,
    objectiveReplans,
    memoryCorrections,
    connectorHealth,
    connectorRecoveries,
    sloBreaches: sloEvaluation?.breached.map((item) => item.key) ?? null,
  });

  // Real failures must not look like success: return 5xx so the scheduled
  // handler logs the failure and the cron can be re-fired. Re-firing is safe:
  // created instances collide on their id and are skipped, so only the dropped
  // brands re-enqueue.
  if (failed > 0) {
    return NextResponse.json(
      {
        ok: false,
        runDate,
        brands: instances.length,
        created,
        skipped,
        failed,
        objectiveReplans,
        memoryCorrections,
        connectorHealth,
        connectorRecoveries,
      },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    runDate,
    brands: instances.length,
    created,
    skipped,
    failed,
    objectiveReplans,
    memoryCorrections,
    connectorHealth,
    connectorRecoveries,
  });
}

export async function POST(request: Request) {
  return GET(request);
}
