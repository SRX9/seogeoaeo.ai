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
import { reconcileOwnerBrandProfileMemory } from "@/lib/agent/brand-profile-memory";
import { brandNameSchema } from "@/lib/brand/schemas";
import { deleteBrand, listBrands, renameBrand } from "@/lib/brand/repository";

type RouteProps = { params: Promise<{ id: string }> };

/** Rename a brand. */
export async function PATCH(request: Request, { params }: RouteProps) {
  return handleApi(async () => {
    const [{ id }, ctx, body] = await Promise.all([params, getApiContext(), readJson(request)]);
    const { name } = parseBody(z.object({ name: brandNameSchema }), body);
    const brand = await renameBrand(ctx.workspace.id, id, name);
    if (!brand) {
      throw new HttpError(404, "Brand not found");
    }
    await reconcileOwnerBrandProfileMemory({ workspaceId: ctx.workspace.id, brandId: id });
    return jsonOk({ brand: { id: brand.id, name: brand.name } });
  });
}

/** Delete a brand (never the last one) and activate a remaining brand. */
export async function DELETE(_request: Request, { params }: RouteProps) {
  return handleApi(async () => {
    const [{ id }, ctx] = await Promise.all([params, getApiContext()]);
    const remaining = await listBrands(ctx.workspace.id);
    if (remaining.length <= 1) {
      throw new HttpError(400, "You must keep at least one brand");
    }
    await deleteBrand(ctx.workspace.id, id);
    const next = remaining.find((brand) => brand.id !== id);
    if (next) {
      await setActiveBrandCookie(next.id);
    }
    return jsonOk({ activeBrandId: next?.id ?? null });
  });
}
