import { z } from "zod";
import { handleApi, HttpError, jsonOk, requireApiBrand } from "@/lib/api/server";
import { listTraceSpans } from "@/lib/observability/trace";

const querySchema = z
  .object({
    traceId: z.string().min(1).max(500).optional(),
    actionId: z.string().uuid().optional(),
  })
  .refine((value) => Boolean(value.traceId || value.actionId), {
    message: "traceId or actionId is required",
  });

/** Tenant-scoped operational trace projection; payloads are already redacted. */
export async function GET(request: Request) {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      traceId: url.searchParams.get("traceId") ?? undefined,
      actionId: url.searchParams.get("actionId") ?? undefined,
    });
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid trace query");
    }
    const spans = await listTraceSpans(scope, parsed.data);
    if (spans.length === 0) throw new HttpError(404, "Trace not found");
    return jsonOk({
      traceId: spans[0]?.traceId,
      spans: spans.map((span) => ({
        ...span,
        // Retention is operational metadata; clients do not need the database
        // projection timestamps in duplicate.
        createdAt: span.createdAt.toISOString(),
        updatedAt: span.updatedAt.toISOString(),
        startedAt: span.startedAt.toISOString(),
        endedAt: span.endedAt?.toISOString() ?? null,
        retentionUntil: span.retentionUntil.toISOString(),
      })),
    });
  });
}

