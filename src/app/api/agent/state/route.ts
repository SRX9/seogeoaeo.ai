import { getAgentState } from "@/lib/agent/state";
import { handleApi, jsonOk, requireApiBrand } from "@/lib/api/server";

export async function GET() {
  return handleApi(async () => {
    const { brand, subscription, scope } = await requireApiBrand();
    const state = await getAgentState(scope, {
      brandName: brand.name,
      subscriptionStatus: subscription?.status ?? null,
    });
    return jsonOk(state);
  });
}
