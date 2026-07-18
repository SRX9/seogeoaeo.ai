import { handleApi, jsonOk, requireApiBrand } from "@/lib/api/server";
import { getInboxSummaryCount } from "@/lib/inbox/summary";

/**
 * Cheap inbox badge count for the app shell: no article bodies or full series.
 */
export async function GET() {
  return handleApi(async () => {
    const context = await requireApiBrand();
    const count = await getInboxSummaryCount(context);
    return jsonOk({ count });
  });
}
