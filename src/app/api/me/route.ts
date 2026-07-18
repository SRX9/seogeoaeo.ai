import { getApiContext, handleApi, jsonOk } from "@/lib/api/server";
import { getMeData } from "@/lib/account/read-model";

/** Current session: user, workspace, subscription, brands, and active brand. */
export async function GET() {
  return handleApi(async () => {
    const ctx = await getApiContext();
    return jsonOk(await getMeData(ctx));
  });
}
