import { handleApi, jsonOk, requireApiBrand } from "@/lib/api/server";
import {
  getBrandIntelligence,
  refreshBrandIntelligence,
  toBrandIdentitySummary,
} from "@/lib/brand/intelligence";
import { getBrandProfile } from "@/lib/brand/repository";

/** Complete saved Context.dev snapshot for the active brand. */
export async function GET() {
  return handleApi(async () => {
    const { brand } = await requireApiBrand();
    const row = await getBrandIntelligence(brand.id);
    return jsonOk({ identity: row ? toBrandIdentitySummary(row) : null, data: row?.data ?? null });
  });
}

/** Refreshes only when the saved snapshot is due; safe to call from Settings. */
export async function POST() {
  return handleApi(async () => {
    const { brand, scope } = await requireApiBrand();
    const profile = await getBrandProfile(brand.id);
    const website = profile?.website?.trim();
    const row = website ? await refreshBrandIntelligence(scope, website) : null;
    return jsonOk({ identity: row ? toBrandIdentitySummary(row) : null, data: row?.data ?? null });
  });
}
