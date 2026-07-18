import {
  listAutonomyDecisions,
} from "@/lib/agent/autonomy-rollout";
import { handleApi, HttpError, jsonOk, requireApiBrand } from "@/lib/api/server";
import { z } from "zod";

export async function GET(request: Request) {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const params = new URL(request.url).searchParams;
    const rawRolloutId = params.get("rolloutId") ?? undefined;
    const parsedRolloutId = z.string().uuid().optional().safeParse(rawRolloutId);
    if (!parsedRolloutId.success) throw new HttpError(400, "Invalid rolloutId");
    const rolloutId = parsedRolloutId.data;
    const rawLimit = Number(params.get("limit") ?? 50);
    const limit = Number.isInteger(rawLimit) ? rawLimit : 50;
    return jsonOk({
      decisions: await listAutonomyDecisions(scope, { rolloutId, limit }),
    });
  });
}
