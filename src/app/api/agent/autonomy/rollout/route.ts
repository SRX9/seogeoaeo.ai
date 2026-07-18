import { z } from "zod";
import {
  listAutonomyRollouts,
  pauseAutonomyRollout,
} from "@/lib/agent/autonomy-rollout";
import {
  handleApi,
  HttpError,
  jsonOk,
  parseBody,
  readJson,
  requireApiBrand,
} from "@/lib/api/server";

const pauseSchema = z
  .object({
    rolloutId: z.string().uuid(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export async function GET() {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    return jsonOk({ rollouts: await listAutonomyRollouts(scope) });
  });
}

/** Owners can stop an active rollout, but this route cannot expand authority. */
export async function PATCH(request: Request) {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const body = parseBody(pauseSchema, await readJson(request));
    const rollout = await pauseAutonomyRollout(scope, body.rolloutId, body.reason);
    if (!rollout) {
      throw new HttpError(409, "The rollout is not active or no longer belongs to this brand.");
    }
    return jsonOk({ rollout });
  });
}
