import { handleApi, jsonOk, requireApiBrand } from "@/lib/api/server";
import { latestVerdicts } from "@/lib/articles/performance";
import { listArticles } from "@/lib/articles/repository";
import { listPublicationSummariesForBrand } from "@/lib/publishing/repository";

/** List the active brand's articles (most recently updated first), each with
 * its latest C4 performance verdict when a checkpoint has run. */
export async function GET() {
  return handleApi(async () => {
    const { brand } = await requireApiBrand();
    const [articles, verdicts, publications] = await Promise.all([
      listArticles(brand.id),
      latestVerdicts(brand.id), // never throws: degrades to {} and logs
      listPublicationSummariesForBrand(brand.id),
    ]);
    // The repository orders newest published records first and unpublished
    // attempts last. Reversing before construction makes the newest published
    // destination the final value for each article without mutating request state.
    const publicationByArticle = new Map(
      publications.toReversed().map((publication) => [publication.articleId, publication] as const),
    );
    return jsonOk({
      articles: articles.map((article) => {
        const publication = publicationByArticle.get(article.id);
        return {
          ...article,
          // List omits full markdown; keep a stable field for shared Article type.
          bodyMarkdown: "",
          performance: verdicts[article.id] ?? null,
          publication: publication
            ? {
                provider: publication.provider,
                status: publication.status,
                externalUrl: publication.externalUrl,
                publishedAt: publication.publishedAt?.toISOString() ?? null,
              }
            : null,
        };
      }),
    });
  });
}
