import { handleApi, jsonOk, requireApiBrand } from "@/lib/api/server";
import { listArticles } from "@/lib/articles/repository";

/** List the active brand's articles (most recently updated first). */
export async function GET() {
  return handleApi(async () => {
    const { brand } = await requireApiBrand();
    const articles = await listArticles(brand.id);
    return jsonOk({ articles });
  });
}
