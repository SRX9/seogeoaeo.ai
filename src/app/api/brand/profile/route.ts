import { handleApi, jsonOk, parseBody, readJson, requireApiBrand } from "@/lib/api/server";
import { getBrandProfile, upsertBrandProfile } from "@/lib/brand/repository";
import { brandProfileSchema } from "@/lib/brand/schemas";

/** Get the active brand's profile (always returns string fields, never null). */
export async function GET() {
  return handleApi(async () => {
    const { brand } = await requireApiBrand();
    const profile = await getBrandProfile(brand.id);
    return jsonOk({
      profile: {
        productDescription: profile?.productDescription ?? "",
        audience: profile?.audience ?? "",
        tone: profile?.tone ?? "",
        website: profile?.website ?? "",
        seedKeywords: profile?.seedKeywords ?? "",
      },
    });
  });
}

/** Create or update the active brand's profile. */
export async function PUT(request: Request) {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const data = parseBody(brandProfileSchema, await readJson(request));
    await upsertBrandProfile(scope, {
      productDescription: data.productDescription ?? "",
      audience: data.audience ?? "",
      tone: data.tone ?? "",
      website: data.website ?? "",
      seedKeywords: data.seedKeywords ?? "",
    });
    return jsonOk({ ok: true });
  });
}
