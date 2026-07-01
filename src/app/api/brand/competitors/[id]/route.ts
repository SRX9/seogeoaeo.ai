import { handleApi, jsonOk, requireApiBrand } from "@/lib/api/server";
import { deleteCompetitor } from "@/lib/brand/repository";

type RouteProps = { params: Promise<{ id: string }> };

/** Remove a competitor from the active brand. */
export async function DELETE(_request: Request, { params }: RouteProps) {
  return handleApi(async () => {
    const [{ id }, { brand }] = await Promise.all([params, requireApiBrand()]);
    await deleteCompetitor(brand.id, id);
    return jsonOk({ ok: true });
  });
}
