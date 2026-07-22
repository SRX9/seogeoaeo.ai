import { z } from "zod";
import { getApiContext, handleApi, HttpError, jsonOk, parseBody, readJson } from "@/lib/api/server";
import { getBrand, updateBrandAutonomy, updateBrandBadgePublic } from "@/lib/brand/repository";
import type { AutonomyMode } from "@/lib/workspace/settings";
import { canEnrollFastAutoPublish, canEnrollNewFullAuto } from "@/lib/agent/safety";

/**
 * Update a brand's settings (autonomy mode and/or the public-badge opt-in).
 * The target brand is passed explicitly so the write can't diverge from the
 * brand the user is viewing if the active-brand cookie changes mid-flight.
 * Both repository writes are scoped by workspace, so a brandId outside the
 * workspace simply matches nothing → 404.
 */
export async function PATCH(request: Request) {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const { brandId, autonomyMode, badgePublic, fastAutoPublishAcknowledged } = parseBody(
      z
        .object({
          brandId: z.string().uuid(),
          autonomyMode: z.enum(["FULL_AUTO", "REVIEW", "AUTO_PUBLISH_FAST"]).optional(),
          fastAutoPublishAcknowledged: z.boolean().optional(),
          badgePublic: z.boolean().optional(),
        })
        .refine((body) => body.autonomyMode !== undefined || body.badgePublic !== undefined, {
          message: "Nothing to update",
        }),
      await readJson(request),
    );

    if (autonomyMode !== undefined) {
      if (autonomyMode === "FULL_AUTO") {
        const current = await getBrand(workspace.id, brandId);
        if (!current) throw new HttpError(404, "Brand not found");
        if (current.autonomyMode !== "FULL_AUTO" && !canEnrollNewFullAuto()) {
          throw new HttpError(
            409,
            "Autopilot enrollment is frozen until grounded publishing is enabled.",
          );
        }
      }
      if (autonomyMode === "AUTO_PUBLISH_FAST") {
        if (fastAutoPublishAcknowledged !== true) {
          throw new HttpError(
            400,
            "Confirm that fast auto-publish may publish with minor editorial issues.",
          );
        }
        if (!canEnrollFastAutoPublish()) {
          throw new HttpError(409, "Automatic publishing is currently disabled by system policy.");
        }
      }
      const updated = await updateBrandAutonomy(workspace.id, brandId, autonomyMode as AutonomyMode);
      if (!updated) throw new HttpError(404, "Brand not found");
    }
    if (badgePublic !== undefined) {
      const updated = await updateBrandBadgePublic(workspace.id, brandId, badgePublic);
      if (!updated) throw new HttpError(404, "Brand not found");
    }
    return jsonOk({ autonomyMode: autonomyMode ?? null, badgePublic: badgePublic ?? null });
  });
}
