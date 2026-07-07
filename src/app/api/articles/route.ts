import { handleApi, jsonOk, requireApiBrand } from "@/lib/api/server";
import { latestVerdicts } from "@/lib/articles/performance";
import { listArticles } from "@/lib/articles/repository";

/** List the active brand's articles (most recently updated first), each with
 * its latest C4 performance verdict when a checkpoint has run. */
export async function GET() {
  return handleApi(async () => {
    const { brand } = await requireApiBrand();
    const [articles, verdicts] = await Promise.all([
      listArticles(brand.id),
      latestVerdicts(brand.id), // never throws — degrades to {} and logs
    ]);
    return jsonOk({
      articles: articles.map((article) => ({
        ...article,
        performance: verdicts[article.id] ?? null,
      })),
    });
  });
}
