import { z } from "zod";
import {
  getApiContext,
  handleApi,
  HttpError,
  jsonOk,
  parseBody,
  readJson,
} from "@/lib/api/server";
import { setActiveBrandCookie } from "@/lib/brand/context";
import { getBrand } from "@/lib/brand/repository";

/** Switch the active brand (stored in an httpOnly cookie). */
export async function PUT(request: Request) {
  return handleApi(async () => {
    const ctx = await getApiContext();
    const { brandId } = parseBody(z.object({ brandId: z.string().min(1) }), await readJson(request));
    const brand = await getBrand(ctx.workspace.id, brandId);
    if (!brand) {
      throw new HttpError(404, "Brand not found");
    }
    await setActiveBrandCookie(brand.id);
    return jsonOk({ activeBrandId: brand.id });
  });
}
