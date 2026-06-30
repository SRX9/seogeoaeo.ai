"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getRequestOrigin } from "@/lib/billing/access";
import { isActiveSubscription } from "@/lib/billing/plans";
import { requireBrand } from "@/lib/brand/context";
import { generateArticleFromTopic } from "@/lib/articles/generate";
import { slugify } from "@/lib/articles/format";
import { createTopic, updateArticle } from "@/lib/articles/repository";
import { publishArticleToDestinations } from "@/lib/publishing/publish";
import { InsufficientCreditsError } from "@/lib/usage/credits";
import { assertWorkspaceRateLimit, RateLimitError } from "@/lib/security/rate-limit";
import { logError, logWarn } from "@/lib/logging/logger";

const ONE_HOUR_MS = 60 * 60 * 1000;

const topicSchema = z.object({
  title: z.string().min(3).max(300),
  angle: z.string().max(500).optional(),
  keywords: z.string().max(500).optional(),
});

const articleSchema = z.object({
  title: z.string().min(3).max(300),
  slug: z.string().min(1).max(200),
  metaDescription: z.string().max(320).optional(),
  bodyMarkdown: z.string().min(20),
  status: z.enum(["draft", "review", "approved"]),
});

export async function createTopicAction(formData: FormData): Promise<void> {
  const { scope } = await requireBrand();
  const parsed = topicSchema.safeParse({
    title: formData.get("title"),
    angle: formData.get("angle"),
    keywords: formData.get("keywords"),
  });

  if (!parsed.success) {
    return;
  }

  await createTopic(scope, parsed.data);
  revalidatePath("/topics");
}

export async function generateArticleAction(topicId: string): Promise<void> {
  const { workspace, subscription, scope } = await requireBrand();
  const active = isActiveSubscription(subscription?.status);

  try {
    await assertWorkspaceRateLimit(workspace.id, "generate_article", 20, ONE_HOUR_MS);
  } catch (error) {
    if (error instanceof RateLimitError) {
      logWarn("rate_limit.generate_article", { workspaceId: workspace.id, topicId });
      redirect("/topics?rate=limited");
    }
    throw error;
  }

  try {
    const origin = await getRequestOrigin();
    // Generation is credit-gated. Without an active subscription the article
    // stays a draft, since publishing remains a paid feature.
    const { article } = await generateArticleFromTopic(scope, topicId, {
      forceDraft: !active,
      origin,
    });
    revalidatePath("/topics");
    revalidatePath("/articles");
    revalidatePath("/dashboard");
    revalidatePath("/activity");
    redirect(`/articles/${article.id}`);
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      revalidatePath("/dashboard");
      redirect("/account?tab=billing&upgrade=1");
    }
    throw error;
  }
}

export async function saveArticleAction(articleId: string, formData: FormData): Promise<void> {
  // Saving only persists edits and status. Publishing is an explicit, separate
  // action (publishArticleAction) so the editor can offer a single, predictable
  // "Approve & publish" button instead of coupling publish to a status change.
  const { brand } = await requireBrand();
  const tagsRaw = String(formData.get("tags") ?? "");
  const tags = tagsRaw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const parsed = articleSchema.safeParse({
    title: formData.get("title"),
    slug: formData.get("slug"),
    metaDescription: formData.get("metaDescription"),
    bodyMarkdown: formData.get("bodyMarkdown"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return;
  }

  await updateArticle(brand.id, articleId, {
    title: parsed.data.title,
    slug: parsed.data.slug || slugify(parsed.data.title),
    metaDescription: parsed.data.metaDescription,
    tags,
    bodyMarkdown: parsed.data.bodyMarkdown,
    status: parsed.data.status,
  });

  revalidatePath("/articles");
  revalidatePath(`/articles/${articleId}`);
}

export async function publishArticleAction(articleId: string): Promise<void> {
  const { workspace, subscription, scope } = await requireBrand();
  // Publishing to live destinations is a paid feature. Free users can generate a
  // sample draft, but must subscribe to publish it.
  if (!isActiveSubscription(subscription?.status)) {
    redirect("/account?tab=billing&upgrade=1");
  }

  try {
    await assertWorkspaceRateLimit(workspace.id, "publish_article", 30, ONE_HOUR_MS);
    await publishArticleToDestinations(scope, articleId);
  } catch (error) {
    if (error instanceof RateLimitError) {
      logWarn("rate_limit.publish_article", { workspaceId: workspace.id, articleId });
    } else {
      logError("publish.failed", {
        workspaceId: workspace.id,
        articleId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  revalidatePath("/articles");
  revalidatePath(`/articles/${articleId}`);
}
