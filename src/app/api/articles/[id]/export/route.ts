import { NextResponse } from "next/server";
import { handleApi, HttpError, requireApiBrand } from "@/lib/api/server";
import { getArticle } from "@/lib/articles/repository";
import { parseTags } from "@/lib/articles/format";

type ExportRouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: ExportRouteProps) {
  return handleApi(async () => {
    const [{ id }, { brand }] = await Promise.all([params, requireApiBrand()]);
    const article = await getArticle(brand.id, id);

    if (!article) {
      throw new HttpError(404, "Article not found");
    }

    const tags = parseTags(article.tags);
    const frontmatter = [
      "---",
      `title: ${JSON.stringify(article.title)}`,
      `slug: ${JSON.stringify(article.slug)}`,
      article.metaDescription ? `description: ${JSON.stringify(article.metaDescription)}` : null,
      tags.length > 0 ? `tags: ${JSON.stringify(tags)}` : null,
      "---",
      "",
    ]
      .filter(Boolean)
      .join("\n");

    const body = `${frontmatter}${article.bodyMarkdown}`;
    const filename = `${article.slug || "article"}.md`;

    return new NextResponse(body, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  });
}
