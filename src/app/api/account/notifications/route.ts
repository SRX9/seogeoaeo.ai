import { z } from "zod";
import { getApiContext, handleApi, jsonOk, parseBody, readJson } from "@/lib/api/server";
import { setCreditEmailsEnabled } from "@/lib/workspace";

/** Update the workspace's credit-email notification preference (owner-scoped). */
export async function PATCH(request: Request) {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const { creditEmailsEnabled } = parseBody(
      z.object({ creditEmailsEnabled: z.boolean() }),
      await readJson(request),
    );
    await setCreditEmailsEnabled(workspace.id, creditEmailsEnabled);
    return jsonOk({ creditEmailsEnabled });
  });
}
