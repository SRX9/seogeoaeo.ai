import { z } from "zod";
import {
  correctMemoryRecord,
  listMemoryPropagationIssues,
  MemoryCorrectionError,
  reconcileMemoryCorrectionPropagation,
  resolveMemoryContradiction,
  scanMemoryContradictions,
} from "@/lib/agent/memory-corrections";
import {
  handleApi,
  HttpError,
  jsonOk,
  parseBody,
  readJson,
  requireApiBrand,
} from "@/lib/api/server";

const expectedRecordSchema = z
  .object({
    id: z.string().uuid(),
    lifecycleVersion: z.number().int().positive(),
  })
  .strict();

const correctionTextShape = {
  correctedStatement: z.string().trim().min(1).max(2_000),
  reason: z.string().trim().min(3).max(1_000),
  effectiveAt: z.string().datetime({ offset: true }).optional(),
};

const correctionRequestSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("resolve_conflict"),
    contradictionGroup: z.string().trim().min(1).max(200),
    subjectKey: z.string().trim().min(1).max(200),
    targetRecordId: z.string().uuid(),
    expectedRecords: z.array(expectedRecordSchema).min(2).max(2_000),
    ...correctionTextShape,
  }).strict(),
  z.object({
    operation: z.literal("correct_record"),
    targetRecordId: z.string().uuid(),
    expectedLifecycleVersion: z.number().int().positive(),
    ...correctionTextShape,
  }).strict(),
]);

export async function GET() {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const [scan, propagationIssues] = await Promise.all([
      scanMemoryContradictions(scope),
      listMemoryPropagationIssues(scope),
    ]);
    return jsonOk({
      contradictions: scan.contradictions,
      contradictionOverflow: scan.overflow,
      propagationIssues,
    });
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const body = parseBody(correctionRequestSchema, await readJson(request));
    try {
      const resolution =
        body.operation === "resolve_conflict"
          ? await resolveMemoryContradiction(scope, {
              ...body,
              effectiveAt: body.effectiveAt ? new Date(body.effectiveAt) : undefined,
            })
          : await correctMemoryRecord(scope, {
              ...body,
              effectiveAt: body.effectiveAt ? new Date(body.effectiveAt) : undefined,
            });
      let propagation;
      try {
        propagation = await reconcileMemoryCorrectionPropagation(
          scope,
          resolution.correction.id,
        );
      } catch {
        // The correction and durable marker already committed atomically. The
        // bounded daily drain owns recovery if immediate reconciliation fails.
        propagation = {
          status: "pending" as const,
          correctionId: resolution.correction.id,
          planDiff: null,
          error: null,
        };
      }
      return jsonOk(
        {
          correctionId: resolution.correction.id,
          supersededRecordIds: resolution.supersededRecordIds,
          invalidatedSummaryIds: resolution.invalidatedSummaryIds,
          propagation,
        },
        { status: propagation.status === "applied" ? 200 : 202 },
      );
    } catch (error) {
      if (error instanceof MemoryCorrectionError) {
        throw new HttpError(error.status, error.message, error.details);
      }
      throw error;
    }
  });
}
