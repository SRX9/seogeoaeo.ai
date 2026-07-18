import { z } from "zod";
import {
  handleApi,
  HttpError,
  jsonOk,
  parseBody,
  readJson,
  requireApiBrand,
} from "@/lib/api/server";
import { requestScheduledWorkReplay } from "@/lib/jobs/scheduled-work";

const replaySchema = z
  .object({
    kind: z.literal("scheduled_work"),
    scheduledWorkId: z.string().uuid(),
  })
  .strict();

/** Owner-safe replay request. The cron reconciler creates a fresh executor. */
export async function POST(request: Request) {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const body = parseBody(replaySchema, await readJson(request));
    if (!(await requestScheduledWorkReplay(body.scheduledWorkId, scope))) {
      throw new HttpError(404, "Scheduled work item not found");
    }
    return jsonOk(
      {
        accepted: true,
        kind: body.kind,
        scheduledWorkId: body.scheduledWorkId,
        next: "The 15-minute reconciler will assign a fresh Workflow instance.",
      },
      { status: 202 },
    );
  });
}

