import { z } from "zod";
import { getApiContext, handleApi, jsonOk, parseBody, readJson } from "@/lib/api/server";
import { updateWorkspaceAutonomy } from "@/lib/workspace";
import type { AutonomyMode } from "@/lib/workspace/settings";

/** Update workspace-level settings (currently autonomy mode). */
export async function PATCH(request: Request) {
  return handleApi(async () => {
    const ctx = await getApiContext();
    const { autonomyMode } = parseBody(
      z.object({ autonomyMode: z.enum(["FULL_AUTO", "REVIEW"]) }),
      await readJson(request),
    );
    await updateWorkspaceAutonomy(ctx.workspace.id, autonomyMode as AutonomyMode);
    return jsonOk({ autonomyMode });
  });
}
