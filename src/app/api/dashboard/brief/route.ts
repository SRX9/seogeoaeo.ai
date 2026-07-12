import { handleApi, jsonOk, requireApiBrand } from "@/lib/api/server";
import { getStoredAgentBrief, refreshAgentBrief } from "@/lib/agent/brief";

/**
 * AP3: Claudia's standing Overview brief. Normally a KV read (the daily job
 * refreshes it after each run); a cold cache regenerates once and re-primes.
 * Unmetered: the brief is proof, and proof is never metered.
 */
export async function GET() {
  return handleApi(async () => {
    const { workspace, brand } = await requireApiBrand();
    const scope = { workspaceId: workspace.id, brandId: brand.id };

    const stored = await getStoredAgentBrief(brand.id);
    const brief = stored ?? (await refreshAgentBrief(scope, brand.name));
    return jsonOk({ brief });
  });
}
