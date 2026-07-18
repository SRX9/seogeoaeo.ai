import { handleApi, HttpError, jsonOk, requireApiBrand } from "@/lib/api/server";
import { getAutonomyReadiness } from "@/lib/agent/canary-validation";
import { z } from "zod";

export async function GET(request: Request) {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const rolloutId = new URL(request.url).searchParams.get("rolloutId");
    if (!rolloutId) throw new HttpError(400, "Missing rolloutId");
    if (!z.string().uuid().safeParse(rolloutId).success) {
      throw new HttpError(400, "Invalid rolloutId");
    }
    const readiness = await getAutonomyReadiness(scope, rolloutId);
    if (!readiness) throw new HttpError(404, "Autonomy rollout not found");
    return jsonOk(readiness);
  });
}
