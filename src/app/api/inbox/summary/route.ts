import { handleApi, jsonOk, requireApiBrand } from "@/lib/api/server";
import { getInboxSummaryCount } from "@/lib/inbox/summary";

/**
 * Cheap inbox badge count for the app shell — no article bodies or full series.
 */
export async function GET() {
  return handleApi(async () => {
    const { workspace, brand } = await requireApiBrand();
    const count = await getInboxSummaryCount({
      workspaceId: workspace.id,
      brandId: brand.id,
    });
    return jsonOk({ count });
  });
}
