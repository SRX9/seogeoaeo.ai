import { z } from "zod";
import {
  answerAsk,
  ASK_INTENT_IDS,
  askIntentChips,
} from "@/lib/agent/ask";
import { handleApi, jsonOk, parseBody, readJson, requireApiBrand } from "@/lib/api/server";

/**
 * Phase 4: Ask Claudia. Intent chips or free-text mapped to grounded answers
 * from brand data only. Unmetered (like the brief): proof/comms, not a tool run.
 * Never triggers LLM brief refresh.
 */
const bodySchema = z.object({
  intent: z.enum(ASK_INTENT_IDS).optional().nullable(),
  message: z.string().max(500).optional().nullable(),
});

export async function GET() {
  return handleApi(async () => {
    await requireApiBrand();
    return jsonOk({
      intents: askIntentChips(),
    });
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const { workspace, brand, subscription } = await requireApiBrand();
    const body = parseBody(bodySchema, await readJson(request));
    const result = await answerAsk(
      { workspaceId: workspace.id, brandId: brand.id },
      brand.name,
      {
        intent: body.intent,
        message: body.message,
        subscriptionStatus: subscription?.status ?? null,
      },
    );
    return jsonOk(result);
  });
}
