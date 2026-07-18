import { z } from "zod";
import { handleApi, HttpError, jsonOk, requireApiBrand } from "@/lib/api/server";
import { buildOutcomeMeasurementReport } from "@/lib/observability/outcomes";

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(90),
});

export async function GET(request: Request) {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({ days: url.searchParams.get("days") ?? undefined });
    if (!parsed.success) throw new HttpError(400, "days must be between 1 and 365");
    const to = new Date();
    const from = new Date(to.getTime() - parsed.data.days * 24 * 60 * 60_000);
    return jsonOk(await buildOutcomeMeasurementReport(scope, { from, to }));
  });
}

