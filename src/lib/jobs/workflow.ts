import { logError } from "@/lib/logging/logger";

/**
 * Cloudflare Workflows throws when you `create()` an instance whose id already
 * exists. That collision is how we get same-day idempotency: the daily cron and
 * the smoke-test endpoint reuse a deterministic per-brand-day id, so a re-fire
 * is a *successful no-op*. Any *other* throw (binding down, rate limit, transient
 * 5xx) is a real error the caller must surface so the run is retried rather than
 * silently dropped.
 *
 * The binding gives no typed error, so we match the message. The platform phrases
 * the collision as "...already exists"; we match that case-insensitively.
 */
export function isWorkflowInstanceExistsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /already exists/i.test(message);
}

type WorkflowBinding = {
  create(options?: { id?: string; params?: unknown }): Promise<{ id: string }>;
  createBatch(batch: Array<{ id?: string; params?: unknown }>): Promise<Array<{ id: string }>>;
};

export type InstanceOptions = { id: string; params: Record<string, unknown> };
export type EnqueueCounts = { created: number; skipped: number; failed: number };

const BATCH_SIZE = 100; // Cloudflare Workflows `createBatch` ceiling.

const addCounts = (left: EnqueueCounts, right: EnqueueCounts): EnqueueCounts => ({
  created: left.created + right.created,
  skipped: left.skipped + right.skipped,
  failed: left.failed + right.failed,
});

/** Create one instance, treating an id collision as a successful no-op. */
export async function createWorkflowInstance(
  workflow: Pick<WorkflowBinding, "create">,
  instance: InstanceOptions,
): Promise<"created" | "exists"> {
  try {
    await workflow.create(instance);
    return "created";
  } catch (error) {
    if (isWorkflowInstanceExistsError(error)) return "exists";
    throw error;
  }
}

/**
 * Fan a list of instances out idempotently: batched creates, falling back to
 * parallel per-instance creation when a batch fails (a batch is atomic, so one
 * already-existing id — the common re-fire case — fails the whole chunk). The
 * batch error itself is logged only when the fallback also saw real failures;
 * otherwise it was just a collision. `logEvent` prefixes the error events.
 */
export async function enqueueWorkflowInstances(
  workflow: WorkflowBinding,
  instances: InstanceOptions[],
  logEvent: string,
): Promise<EnqueueCounts> {
  const chunks: InstanceOptions[][] = [];
  for (let i = 0; i < instances.length; i += BATCH_SIZE) {
    chunks.push(instances.slice(i, i + BATCH_SIZE));
  }

  const outcomes = await Promise.all(
    chunks.map(async (chunk): Promise<EnqueueCounts> => {
      try {
        await workflow.createBatch(chunk);
        return { created: chunk.length, skipped: 0, failed: 0 };
      } catch (batchError) {
        const perInstance = await Promise.all(
          chunk.map(async (instance): Promise<EnqueueCounts> => {
            try {
              const outcome = await createWorkflowInstance(workflow, instance);
              return outcome === "created"
                ? { created: 1, skipped: 0, failed: 0 }
                : { created: 0, skipped: 1, failed: 0 };
            } catch (error) {
              logError(`${logEvent}.create_failed`, {
                instanceId: instance.id,
                error: error instanceof Error ? error.message : String(error),
              });
              return { created: 0, skipped: 0, failed: 1 };
            }
          }),
        );
        const counts = perInstance.reduce(addCounts, { created: 0, skipped: 0, failed: 0 });
        if (counts.failed > 0) {
          logError(`${logEvent}.batch_failed`, {
            error: batchError instanceof Error ? batchError.message : String(batchError),
          });
        }
        return counts;
      }
    }),
  );
  return outcomes.reduce(addCounts, { created: 0, skipped: 0, failed: 0 });
}
