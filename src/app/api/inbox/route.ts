import { handleApi, jsonOk, requireApiBrand } from "@/lib/api/server";
import { getInboxData } from "@/lib/inbox/read-model";

/** Complete page payload so Inbox navigation needs one request, not a client fan-out. */
export async function GET() {
  return handleApi(async () => {
    const context = await requireApiBrand();
    return jsonOk(await getInboxData(context));
  });
}
