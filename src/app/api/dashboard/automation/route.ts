import { handleApi, jsonOk, requireApiBrand } from "@/lib/api/server";
import { getDashboardAutomation } from "@/lib/dashboard/read-model";

/** Content-agent stats for pages that need this card outside the Overview bundle. */
export async function GET() {
  return handleApi(async () => {
    const context = await requireApiBrand();
    return jsonOk(await getDashboardAutomation(context));
  });
}
