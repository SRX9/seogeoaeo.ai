import { handleApi, jsonOk, requireApiBrand } from "@/lib/api/server";
import { listAgentJobs } from "@/lib/jobs/repository";
import { listResearchRuns } from "@/lib/research/repository";

/** Activity timeline: research runs + agent jobs for the active brand. */
export async function GET() {
  return handleApi(async () => {
    const { brand } = await requireApiBrand();
    const [jobs, runs] = await Promise.all([
      listAgentJobs(brand.id, 20),
      listResearchRuns(brand.id, 10),
    ]);
    return jsonOk({ jobs, runs });
  });
}
