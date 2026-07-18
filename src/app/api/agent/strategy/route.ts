import { z } from "zod";
import {
  approveStrategy,
  getStrategyReview,
  removeStrategyTask,
  reorderStrategyTasks,
  StrategyReviewError,
} from "@/lib/agent/strategy";
import {
  handleApi,
  HttpError,
  jsonOk,
  parseBody,
  readJson,
  requireApiBrand,
} from "@/lib/api/server";

const reasonSchema = z.string().trim().min(3).max(500);
const evidenceRefsSchema = z.array(z.string().trim().min(1).max(300)).max(20).default([]);
const reviewSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("reorder"),
    expectedPlanId: z.string().uuid(),
    taskIds: z.array(z.string().uuid()).min(1).max(50),
    reason: reasonSchema,
    evidenceRefs: evidenceRefsSchema,
  }).strict(),
  z.object({
    operation: z.literal("remove"),
    expectedPlanId: z.string().uuid(),
    taskId: z.string().uuid(),
    reason: reasonSchema,
    evidenceRefs: evidenceRefsSchema,
  }).strict(),
  z.object({
    operation: z.literal("approve"),
    planId: z.string().uuid(),
    reason: reasonSchema,
    evidenceRefs: evidenceRefsSchema,
  }).strict(),
]);

export async function GET() {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    return jsonOk(await getStrategyReview(scope));
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const body = parseBody(reviewSchema, await readJson(request));
    try {
      if (body.operation === "reorder") {
        return jsonOk(await reorderStrategyTasks(scope, body));
      }
      if (body.operation === "remove") {
        return jsonOk(await removeStrategyTask(scope, body));
      }
      return jsonOk(await approveStrategy(scope, body));
    } catch (error) {
      if (error instanceof StrategyReviewError) {
        throw new HttpError(error.status, error.message);
      }
      throw error;
    }
  });
}
