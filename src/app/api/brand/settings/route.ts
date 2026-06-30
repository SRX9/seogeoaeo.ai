import { z } from "zod";
import { getApiContext, handleApi, HttpError, jsonOk, parseBody, readJson } from "@/lib/api/server";
import { updateBrandAutonomy } from "@/lib/brand/repository";
import type { AutonomyMode } from "@/lib/workspace/settings";

/**
 * Update a brand's settings (currently autonomy mode). The target brand is
 * passed explicitly so the write can't diverge from the brand the user is
 * viewing if the active-brand cookie changes mid-flight. `updateBrandAutonomy`
 * is scoped by workspace, so a brandId outside the workspace simply matches
 * nothing → 404.
 */
export async function PATCH(request: Request) {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const { brandId, autonomyMode } = parseBody(
      z.object({
        brandId: z.string().uuid(),
        autonomyMode: z.enum(["FULL_AUTO", "REVIEW"]),
      }),
      await readJson(request),
    );
    const updated = await updateBrandAutonomy(workspace.id, brandId, autonomyMode as AutonomyMode);
    if (!updated) {
      throw new HttpError(404, "Brand not found");
    }
    return jsonOk({ autonomyMode });
  });
}
