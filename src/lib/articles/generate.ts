import { getBrandProfile, type BrandScope } from "@/lib/brand/repository";
import {
  createArticle,
  getArticleByTopic,
  getTopic,
  updateTopicStatus,
} from "@/lib/articles/repository";
import { slugify } from "@/lib/articles/format";
import { generateJson, generateText } from "@/lib/llm/client";
import { addTokenUsage, emptyTokenUsage } from "@/lib/llm/usage";
import { logInfo, logWarn, logError } from "@/lib/logging/logger";
import { publishArticleToDestinations } from "@/lib/publishing/publish";
import {
  draftPrompt,
  metadataPrompt,
  outlinePrompt,
  seoEditPrompt,
  summaryPrompt,
  type ArticleMetadata,
  type BrandContext,
} from "@/lib/llm/prompts";
import { createAgentJob, finishAgentJob } from "@/lib/jobs/repository";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { assertHasCredits, spendCredits } from "@/lib/usage/credits";
import { articleStatusForAutonomy } from "@/lib/workspace/settings";
import { getWorkspaceById } from "@/lib/workspace";

export type GenerationTrace = {
  summaryModel: string;
  outlineModel: string;
  draftModel: string;
  seoEditModel: string;
  metadataModel: string;
};

type GenerateOptions = {
  /** Credits to charge on success. Defaults to the article-generation cost. */
  creditCost?: number;
  /** Skip the credit assert/spend entirely (e.g. internal/admin reruns). */
  skipCreditCheck?: boolean;
  origin?: string;
  /**
   * Force the article to "draft" regardless of autonomy mode. Used for
   * non-subscribers so their output is never auto-published — publishing stays a
   * paid feature unlocked by an active subscription.
   */
  forceDraft?: boolean;
};

export async function generateArticleFromTopic(
  scope: BrandScope,
  topicId: string,
  options: GenerateOptions = {},
) {
  const { workspaceId, brandId } = scope;
  const topic = await getTopic(brandId, topicId);
  if (!topic) {
    throw new Error("Topic not found");
  }

  const existing = await getArticleByTopic(brandId, topicId);
  if (existing) {
    return { article: existing, trace: null };
  }

  const workspace = await getWorkspaceById(workspaceId);
  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const creditCost = options.creditCost ?? CREDIT_COSTS.article_generation;
  // Fail fast before any LLM spend if the workspace can't cover the cost.
  if (!options.skipCreditCheck) {
    await assertHasCredits(workspaceId, creditCost);
  }

  const job = await createAgentJob(scope, "writing", `Generating article for: ${topic.title}`);
  await updateTopicStatus(topicId, "generating");

  try {
    const brand = await getBrandProfile(brandId);
    const brandContext: BrandContext = {
      productDescription: brand?.productDescription,
      audience: brand?.audience,
      tone: brand?.tone,
      website: brand?.website,
      seedKeywords: brand?.seedKeywords,
    };

    const topicInput = {
      title: topic.title,
      angle: topic.angle,
      keywords: topic.keywords,
    };

    let tokenUsage = emptyTokenUsage();

    const summaryMessages = summaryPrompt(topicInput, brandContext);
    const summary = await generateText("light", [
      { role: "system", content: summaryMessages.system },
      { role: "user", content: summaryMessages.user },
    ]);
    tokenUsage = addTokenUsage(tokenUsage, summary);

    const outlineMessages = outlinePrompt(topicInput, brandContext, summary.text);
    const outline = await generateText("heavy", [
      { role: "system", content: outlineMessages.system },
      { role: "user", content: outlineMessages.user },
    ]);
    tokenUsage = addTokenUsage(tokenUsage, outline);

    const draftMessages = draftPrompt(topicInput, brandContext, outline.text);
    const draft = await generateText("heavy", [
      { role: "system", content: draftMessages.system },
      { role: "user", content: draftMessages.user },
    ]);
    tokenUsage = addTokenUsage(tokenUsage, draft);

    const seoMessages = seoEditPrompt(draft.text, topic.keywords);
    const seoEdited = await generateText("heavy", [
      { role: "system", content: seoMessages.system },
      { role: "user", content: seoMessages.user },
    ]);
    tokenUsage = addTokenUsage(tokenUsage, seoEdited);

    const metadataMessages = metadataPrompt(topicInput, seoEdited.text);
    const metadata = await generateJson<ArticleMetadata>("light", [
      { role: "system", content: metadataMessages.system },
      { role: "user", content: metadataMessages.user },
    ]);
    tokenUsage = addTokenUsage(tokenUsage, metadata);

    const article = await createArticle(scope, {
      topicId: topic.id,
      title: metadata.data.title || topic.title,
      slug: metadata.data.slug || slugify(metadata.data.title || topic.title),
      metaDescription: metadata.data.metaDescription,
      tags: metadata.data.tags ?? [],
      bodyMarkdown: seoEdited.text,
      status: options.forceDraft ? "draft" : articleStatusForAutonomy(workspace.autonomyMode),
    });

    // Charge only after the article exists, so a failed generation never burns
    // credits. Drains the monthly bucket before purchased credits. The balance
    // was asserted up front; if a concurrent spend drained it in the meantime the
    // charge can still fall short — keep the finished article rather than orphan
    // it, and log the miss instead of failing the request.
    if (!options.skipCreditCheck) {
      try {
        await spendCredits(workspaceId, creditCost, {
          reason: "article_generation",
          brandId,
          refType: "article",
          refId: article.id,
        });
      } catch (error) {
        logWarn("article.credit_charge_skipped", {
          workspaceId,
          articleId: article.id,
          reason: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    await updateTopicStatus(topicId, "completed");

    const trace: GenerationTrace = {
      summaryModel: summary.model,
      outlineModel: outline.model,
      draftModel: draft.model,
      seoEditModel: seoEdited.model,
      metadataModel: metadata.model,
    };

    await finishAgentJob(job.id, "completed", `Article generated: ${article.title}`, {
      articleId: article.id,
      topicId: topic.id,
      autonomyMode: workspace.autonomyMode,
      status: article.status,
      tokenUsage,
    });

    logInfo("article.generated", {
      workspaceId,
      articleId: article.id,
      topicId,
      totalTokens: tokenUsage.totalTokens,
    });

    // FULL_AUTO produces approved articles; publish them to enabled destinations now.
    // REVIEW leaves drafts that publish on manual approval.
    if (article.status === "approved") {
      try {
        await publishArticleToDestinations(scope, article.id, options.origin);
      } catch (error) {
        logWarn("publish.auto_skipped", {
          workspaceId,
          articleId: article.id,
          reason: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return { article, trace };
  } catch (error) {
    await updateTopicStatus(topicId, "failed");
    // Store a user-friendly summary on the job (shown in the activity feed); keep
    // the raw error in the logs only.
    const detail = error instanceof Error ? error.message : "Unknown error";
    await finishAgentJob(job.id, "failed", "Article generation failed — retry to try again.", {
      topicId,
    });
    logError("article.generation_failed", { workspaceId, topicId, error: detail });
    throw error;
  }
}
