import { z } from "zod";
import {
  handleApi,
  HttpError,
  jsonOk,
  parseBody,
  readJson,
  requireApiBrand,
} from "@/lib/api/server";
import { slugify } from "@/lib/articles/format";
import { getArticle, updateArticle } from "@/lib/articles/repository";
import { listPublicationsForArticle } from "@/lib/publishing/repository";

type RouteProps = { params: Promise<{ id: string }> };

const articleSchema = z.object({
  title: z.string().min(3).max(300),
  slug: z.string().min(1).max(200),
  metaDescription: z.string().max(320).optional(),
  bodyMarkdown: z.string().min(20),
  status: z.enum(["draft", "review", "approved"]),
  // Tags accepted as an array or a comma-separated string.
  tags: z.union([z.array(z.string()), z.string()]).optional(),
});

/** Get a single article. */
export async function GET(_request: Request, { params }: RouteProps) {
  return handleApi(async () => {
    const { id } = await params;
    const { brand } = await requireApiBrand();
    const [article, publications] = await Promise.all([
      getArticle(brand.id, id),
      listPublicationsForArticle(brand.id, id),
    ]);
    if (!article) {
      throw new HttpError(404, "Article not found");
    }
    return jsonOk({
      article,
      publications: publications.map((publication) => ({
        provider: publication.provider,
        status: publication.status,
        externalUrl: publication.externalUrl,
        errorMessage: publication.errorMessage,
        attemptCount: publication.attemptCount,
      })),
    });
  });
}

/** Save edits to an article (title, slug, meta, body, tags, status). */
export async function PATCH(request: Request, { params }: RouteProps) {
  return handleApi(async () => {
    const { id } = await params;
    const { brand } = await requireApiBrand();
    const data = parseBody(articleSchema, await readJson(request));

    const tags = Array.isArray(data.tags)
      ? data.tags.map((tag) => tag.trim()).filter(Boolean)
      : String(data.tags ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);

    const article = await updateArticle(brand.id, id, {
      title: data.title,
      slug: data.slug || slugify(data.title),
      metaDescription: data.metaDescription,
      tags,
      bodyMarkdown: data.bodyMarkdown,
      status: data.status,
    });
    if (!article) {
      throw new HttpError(404, "Article not found");
    }
    return jsonOk({ article });
  });
}
