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
import { learnVoiceFromEdit } from "@/lib/brand/voice";
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
  /** Optimistic concurrency: reject if another save landed first. */
  expectedVersion: z.number().int().positive().optional(),
});

/** Get a single article. */
export async function GET(_request: Request, { params }: RouteProps) {
  return handleApi(async () => {
    const [{ id }, { brand }] = await Promise.all([params, requireApiBrand()]);
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
    const [{ id }, { brand }, body] = await Promise.all([
      params,
      requireApiBrand(),
      readJson(request),
    ]);
    const data = parseBody(articleSchema, body);

    const tags = Array.isArray(data.tags)
      ? data.tags.flatMap((tag) => {
          const trimmed = tag.trim();
          return trimmed ? [trimmed] : [];
        })
      : String(data.tags ?? "")
          .split(",")
          .flatMap((tag) => {
            const trimmed = tag.trim();
            return trimmed ? [trimmed] : [];
          });

    // C3 voice learning: when the user approves an edited draft, the diff
    // between what Claudia wrote and what the owner shipped teaches the voice
    // doc. Read the stored body before it's overwritten; never block the save.
    const previous = data.status === "approved" ? await getArticle(brand.id, id) : null;

    let article;
    try {
      article = await updateArticle(brand.id, id, {
        title: data.title,
        slug: data.slug || slugify(data.title),
        metaDescription: data.metaDescription,
        tags,
        bodyMarkdown: data.bodyMarkdown,
        status: data.status,
        expectedVersion: data.expectedVersion,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "VERSION_CONFLICT") {
        throw new HttpError(409, "This article changed in another tab. Reload it before saving again.", {
          code: "VERSION_CONFLICT",
        });
      }
      throw error;
    }
    if (!article) {
      throw new HttpError(404, "Article not found");
    }

    if (previous && previous.status !== "approved") {
      await learnVoiceFromEdit(brand.id, previous.bodyMarkdown, data.bodyMarkdown);
    }

    return jsonOk({ article });
  });
}
