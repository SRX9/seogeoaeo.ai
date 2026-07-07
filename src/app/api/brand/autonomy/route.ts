import { z } from "zod";
import { getApiContext, handleApi, HttpError, jsonOk, parseBody, readJson } from "@/lib/api/server";
import { getBrand } from "@/lib/brand/repository";
import { latestVisibilityMonitorMeta } from "@/lib/jobs/repository";
import {
  AUTO_CAPABLE_CATEGORIES,
  defaultLevelFor,
  type AutonomyLevel,
  type AutonomyMode,
} from "@/lib/jobs/visibility-agent";
import { AUTONOMY_CATEGORY_LABELS } from "@/lib/visibility/display";
import { getAutonomyOverrides, setAutonomyLevel } from "@/server/visibility/autonomy";

/**
 * AP4 — per-category autonomy for the standing loop. GET returns each fix
 * category's *effective* level (explicit override, else the Autopilot/Copilot
 * dial's default) plus what the agent did in that category on its last monitor
 * cycle; PATCH upserts one category's override.
 */

const KNOWN_CATEGORIES = Object.keys(AUTONOMY_CATEGORY_LABELS);

export async function GET(request: Request) {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const brandId = new URL(request.url).searchParams.get("brandId");
    if (!brandId) throw new HttpError(400, "Missing brandId");
    const brand = await getBrand(workspace.id, brandId);
    if (!brand) throw new HttpError(404, "Brand not found");

    const mode: AutonomyMode = brand.autonomyMode === "REVIEW" ? "REVIEW" : "FULL_AUTO";
    const [overrides, monitor] = await Promise.all([
      getAutonomyOverrides(brandId),
      // "What she did last": the latest monitor cycle's verified fixes per category.
      latestVisibilityMonitorMeta(brandId),
    ]);
    const verifiedByCategory = new Map<string, number>();
    for (const f of monitor?.meta.verified ?? []) {
      verifiedByCategory.set(f.category, (verifiedByCategory.get(f.category) ?? 0) + 1);
    }

    const categories = KNOWN_CATEGORIES.map((category) => {
      const defaultLevel = defaultLevelFor(
        mode,
        AUTO_CAPABLE_CATEGORIES.has(category) ? "auto" : "artifact",
      );
      return {
        category,
        label: AUTONOMY_CATEGORY_LABELS[category],
        level: overrides[category] ?? defaultLevel,
        isOverride: overrides[category] !== undefined,
        defaultLevel,
        verifiedLastCycle: verifiedByCategory.get(category) ?? 0,
      };
    });

    return jsonOk({
      mode,
      categories,
      lastRun: monitor ? { message: monitor.message, at: monitor.at } : null,
    });
  });
}

export async function PATCH(request: Request) {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const { brandId, category, level } = parseBody(
      z.object({
        brandId: z.string().uuid(),
        category: z.enum(KNOWN_CATEGORIES as [string, ...string[]]),
        level: z.union([z.literal(0), z.literal(1), z.literal(2)]),
      }),
      await readJson(request),
    );
    const brand = await getBrand(workspace.id, brandId);
    if (!brand) throw new HttpError(404, "Brand not found");

    await setAutonomyLevel(brandId, category, level as AutonomyLevel);
    return jsonOk({ category, level });
  });
}
