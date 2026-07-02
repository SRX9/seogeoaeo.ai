import { z } from "zod";
import { getApiContext, handleApi, jsonOk, parseBody, readJson } from "@/lib/api/server";
import { applyFix, revertFix } from "@/lib/visibility/apply-fix";

/** V7.2 — apply or revert a finding's fix. */
const schema = z.object({
  findingId: z.string().uuid(),
  action: z.enum(["apply", "revert"]).default("apply"),
});

export async function POST(request: Request) {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const { findingId, action } = parseBody(schema, await readJson(request));
    const result = action === "revert" ? await revertFix(findingId, workspace.id) : await applyFix(findingId, workspace.id);
    return jsonOk(result);
  });
}
