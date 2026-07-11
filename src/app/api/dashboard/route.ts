import { handleApi, jsonOk, requireApiBrand } from "@/lib/api/server";
import { getDashboardData } from "@/lib/dashboard/read-model";

/** Page-scoped Overview payload: one auth boundary and one parallel read graph. */
export async function GET() {
  return handleApi(async () => {
    const context = await requireApiBrand();
    return jsonOk(await getDashboardData(context));
  });
}
