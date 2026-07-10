import { z } from "zod";
import { steerAgent } from "@/lib/agent/steer";
import {
  handleApi,
  jsonOk,
  parseBody,
  readJson,
  requireApiBrand,
} from "@/lib/api/server";

const bodySchema = z.object({
  message: z.string().trim().min(2).max(1_000),
});

export async function POST(request: Request) {
  return handleApi(async () => {
    const { brand, subscription, scope } = await requireApiBrand();
    const body = parseBody(bodySchema, await readJson(request));
    const result = await steerAgent(scope, {
      brandName: brand.name,
      subscriptionStatus: subscription?.status ?? null,
      message: body.message,
    });
    return jsonOk(result);
  });
}
