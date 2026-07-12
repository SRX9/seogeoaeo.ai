import { getBrand, getBrandProfile, type BrandScope } from "@/lib/brand/repository";
import { getBrandIntelligence } from "@/lib/brand/intelligence";
import { getAgentControlState } from "@/lib/agent/memory";
import { isArticleGenerationBlockedByOwnerConstraint } from "@/lib/agent/policy";
import {
  beginOwnerDirectedWritingTask,
  completeOwnerDirectedWritingTask,
} from "@/lib/agent/planner";
import {
  createArticle,
  getArticleByTopic,
  getTopic,
  updateTopicStatus,
} from "@/lib/articles/repository";
import { slugify } from "@/lib/articles/format";
import { pickShape } from "@/lib/articles/shapes";
import { lintArticle } from "@/lib/articles/style-lint";
import { parseVoiceDoc, renderVoiceBlock } from "@/lib/brand/voice";
import { generateJson, generateText } from "@/lib/llm/client";
import { addTokenUsage, emptyTokenUsage } from "@/lib/llm/usage";
import { logInfo, logWarn, logError } from "@/lib/logging/logger";
import { publishArticleToDestinations } from "@/lib/publishing/publish";
import {
  draftPrompt,
  metadataPrompt,
  outlinePrompt,
  seoEditPrompt,
  styleRewritePrompt,
  summaryPrompt,
  type ArticleMetadata,
  type BrandContext,
} from "@/lib/llm/prompts";
import { createAgentJob, finishAgentJob, incrementArticlesGenerated } from "@/lib/jobs/repository";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { assertHasCredits, spendCredits } from "@/lib/usage/credits";

export type GenerationTrace = {
  summaryModel: string;
  outlineModel: string;
  draftModel: string;
  seoEditModel: string;
  metadataModel: string;
  shape: string;
  rewritePasses: number;
};

/** Stored on the article as gate_results_json; shown in the editor. */
export type GateResult = { gate: string; passed: boolean; detail: string };

// Lint failures trigger targeted rewrites, capped: then the draft goes to
// human review instead of publishing. Autonomy never ships slop for its quota.
const MAX_REWRITE_PASSES = 2;

type GenerateOptions = {
  /** Agent runs obey stored pauses/constraints; direct owner actions override them. */
  actor?: "agent" | "owner";
  /** Credits to charge on success. Defaults to the article-generation cost. */
  creditCost?: number;
  /** Skip the credit assert/spend entirely (e.g. internal/admin reruns). */
  skipCreditCheck?: boolean;
  origin?: string;
  /**
   * Force the article to "draft" regardless of autonomy mode. Used for
   * non-subscribers so their output is never auto-published: publishing stays a
   * paid feature unlocked by an active subscription.
   */
  forceDraft?: boolean;
};

/** The originating search query, when the topic came from research. */
function readTopicQuery(evidenceJson: string | null | undefined): string | null {
  if (!evidenceJson) return null;
  try {
    const evidence = JSON.parse(evidenceJson) as { query?: unknown };
    return typeof evidence.query === "string" ? evidence.query : null;
  } catch {
    return null;
  }
}

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
    // Retry after a partial success: article was inserted and topic flipped to
    // `generating`, then the isolate died before charge/complete. Ledger spend is
    // idempotent on article id. Pure hits (topic already completed / never
    // started generate) just return the existing row with no side effects.
    if (topic.status === "generating") {
      if (!options.skipCreditCheck) {
        try {
          await spendCredits(workspaceId, options.creditCost ?? CREDIT_COSTS.article_generation, {
            reason: "article_generation",
            brandId,
            refType: "article",
            refId: existing.id,
          });
        } catch (error) {
          logWarn("article.credit_charge_skipped", {
            workspaceId,
            articleId: existing.id,
            reason: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
      await updateTopicStatus(topicId, "completed");
      if (existing.status === "approved") {
        try {
          await publishArticleToDestinations(scope, existing.id, options.origin, {
            actor: options.actor ?? "owner",
          });
        } catch (error) {
          logWarn("publish.auto_skipped", {
            workspaceId,
            articleId: existing.id,
            reason: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    }
    try {
      await completeOwnerDirectedWritingTask(scope, topicId, { articleId: existing.id });
    } catch (error) {
      logWarn("agent.owner_task_settle_skipped", {
        workspaceId,
        topicId,
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }
    return { article: existing, trace: null };
  }

  const controls = await getAgentControlState(brandId);
  if (options.actor === "agent" && controls.paused) {
    throw new Error("Agent paused by owner");
  }
  const blockingConstraint =
    options.actor === "agent"
      ? controls.ownerConstraints.find((constraint) =>
          isArticleGenerationBlockedByOwnerConstraint(constraint, topic.title),
        )
      : null;
  if (blockingConstraint) {
    throw new Error(`Agent blocked by owner constraint: ${blockingConstraint}`);
  }

  // Autonomy is per-brand: it decides whether this article auto-publishes or
  // waits as a draft. Fetched here (before any LLM spend) from the brand row.
  const brand = await getBrand(workspaceId, brandId);
  if (!brand) {
    throw new Error("Brand not found");
  }

  const creditCost = options.creditCost ?? CREDIT_COSTS.article_generation;
  // Fail fast before any LLM spend if the workspace can't cover the cost.
  if (!options.skipCreditCheck) {
    await assertHasCredits(workspaceId, creditCost);
  }

  const job = await createAgentJob(scope, "writing", `Generating article for: ${topic.title}`);
  await updateTopicStatus(topicId, "generating");

  try {
    try {
      await beginOwnerDirectedWritingTask(scope, topicId);
    } catch (error) {
      logWarn("agent.owner_task_start_skipped", {
        workspaceId,
        topicId,
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }
    const [profile, intelligence] = await Promise.all([
      getBrandProfile(brandId),
      getBrandIntelligence(brandId),
    ]);
    const voice = parseVoiceDoc(profile?.voiceJson);
    const brandContext: BrandContext = {
      productDescription: profile?.productDescription || intelligence?.description,
      audience: profile?.audience,
      tone: profile?.tone,
      website: profile?.website,
      seedKeywords: profile?.seedKeywords,
      slogan: intelligence?.slogan,
      industries: intelligence?.data.industries
        ? Object.values(intelligence.data.industries)
            .flat()
            .filter((value): value is string => typeof value === "string")
            .slice(0, 8)
            .join(", ")
        : null,
      voice: voice ? renderVoiceBlock(voice) : null,
    };

    const topicInput = {
      title: topic.title,
      angle: topic.angle,
      keywords: topic.keywords,
    };

    // C3: shape follows topic: picked once, deterministic, stored on the
    // article. The essay template is not in the library.
    const shape = pickShape({
      title: topic.title,
      keywords: topic.keywords,
      query: readTopicQuery(topic.evidenceJson),
    });

    let tokenUsage = emptyTokenUsage();

    const summaryMessages = summaryPrompt(topicInput, brandContext);
    const summary = await generateText("light", [
      { role: "system", content: summaryMessages.system },
      { role: "user", content: summaryMessages.user },
    ]);
    tokenUsage = addTokenUsage(tokenUsage, summary);

    const outlineMessages = outlinePrompt(topicInput, brandContext, summary.text, shape);
    const outline = await generateText("heavy", [
      { role: "system", content: outlineMessages.system },
      { role: "user", content: outlineMessages.user },
    ]);
    tokenUsage = addTokenUsage(tokenUsage, outline);

    const draftMessages = draftPrompt(topicInput, brandContext, outline.text, shape);
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

    // C3 gate loop: the slop lint must pass before the draft can publish.
    // Failures get a targeted rewrite (fix the flagged spans, keep the rest);
    // after MAX_REWRITE_PASSES the draft is flagged for human review.
    let body = seoEdited.text;
    let lint = lintArticle(body, shape);
    let rewritePasses = 0;
    while (!lint.passed && rewritePasses < MAX_REWRITE_PASSES) {
      const rewriteMessages = styleRewritePrompt(body, lint.hits);
      const rewritten = await generateText("heavy", [
        { role: "system", content: rewriteMessages.system },
        { role: "user", content: rewriteMessages.user },
      ]);
      tokenUsage = addTokenUsage(tokenUsage, rewritten);
      body = rewritten.text;
      lint = lintArticle(body, shape);
      rewritePasses += 1;
    }

    const gateResults: GateResult[] = [
      {
        gate: "style-lint",
        passed: lint.passed,
        detail: lint.passed
          ? rewritePasses === 0
            ? "Clean on first pass"
            : `Clean after ${rewritePasses} rewrite pass${rewritePasses > 1 ? "es" : ""}`
          : lint.hits.map((hit) => hit.message).join("; "),
      },
      {
        // E-E-A-T basics. Advisory until the publishing layer stamps
        // author/date (V7.1): recorded so the editor can surface it, but a
        // missing link never blocks; only slop does.
        gate: "eeat-source",
        passed: /\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(body),
        detail: "At least one linked source in the article",
      },
    ];
    const flaggedForReview = !lint.passed;

    const metadataMessages = metadataPrompt(topicInput, body);
    const metadata = await generateJson<ArticleMetadata>("light", [
      { role: "system", content: metadataMessages.system },
      { role: "user", content: metadataMessages.user },
    ]);
    tokenUsage = addTokenUsage(tokenUsage, metadata);

    let article;
    try {
      article = await createArticle(scope, {
        topicId: topic.id,
        title: metadata.data.title || topic.title,
        slug: metadata.data.slug || slugify(metadata.data.title || topic.title),
        metaDescription: metadata.data.metaDescription,
        tags: metadata.data.tags ?? [],
        bodyMarkdown: body,
        // A draft that failed the gates never auto-publishes, whatever the
        // autonomy mode: it waits for a human.
        status:
          options.forceDraft || flaggedForReview
            ? "draft"
            : brand.autonomyMode === "FULL_AUTO" ||
                controls.grantedCapabilities.includes("article.create")
              ? "approved"
              : "draft",
        shape,
        gateResultsJson: JSON.stringify(gateResults),
      });
    } catch (error) {
      // Concurrent generate on the same topic (unique index): return the winner.
      const raced = await getArticleByTopic(brandId, topicId);
      if (raced) {
        article = raced;
      } else {
        throw error;
      }
    }

    // Charge only after the article exists, so a failed generation never burns
    // credits. Drains the monthly bucket before purchased credits. The balance
    // was asserted up front; if a concurrent spend drained it in the meantime the
    // charge can still fall short: keep the finished article rather than orphan
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

    // Tally the agent's weekly output. Non-critical: never fail a finished
    // article because the metrics write hiccupped.
    try {
      await incrementArticlesGenerated(scope);
    } catch (error) {
      logWarn("usage.generated_counter_skipped", {
        workspaceId,
        articleId: article.id,
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }

    const trace: GenerationTrace = {
      summaryModel: summary.model,
      outlineModel: outline.model,
      draftModel: draft.model,
      seoEditModel: seoEdited.model,
      metadataModel: metadata.model,
      shape,
      rewritePasses,
    };

    await finishAgentJob(
      job.id,
      "completed",
      flaggedForReview
        ? `Article generated and held for review: ${article.title}`
        : `Article generated: ${article.title}`,
      {
        articleId: article.id,
        topicId: topic.id,
        autonomyMode: brand.autonomyMode,
        status: article.status,
        shape,
        rewritePasses,
        flaggedForReview,
        tokenUsage,
      },
    );

    logInfo("article.generated", {
      workspaceId,
      articleId: article.id,
      topicId,
      shape,
      rewritePasses,
      flaggedForReview,
      totalTokens: tokenUsage.totalTokens,
    });

    // FULL_AUTO produces approved articles; publish them to enabled destinations now.
    // REVIEW leaves drafts that publish on manual approval.
    if (article.status === "approved") {
      try {
        await publishArticleToDestinations(scope, article.id, options.origin, {
          actor: options.actor ?? "owner",
        });
      } catch (error) {
        logWarn("publish.auto_skipped", {
          workspaceId,
          articleId: article.id,
          reason: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    try {
      await completeOwnerDirectedWritingTask(scope, topicId, { articleId: article.id });
    } catch (error) {
      logWarn("agent.owner_task_settle_skipped", {
        workspaceId,
        topicId,
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }

    return { article, trace };
  } catch (error) {
    await updateTopicStatus(topicId, "failed");
    // Store a user-friendly summary on the job (shown in the activity feed); keep
    // the raw error in the logs only.
    const detail = error instanceof Error ? error.message : "Unknown error";
    try {
      await completeOwnerDirectedWritingTask(scope, topicId, { failed: true, error: detail });
    } catch (taskError) {
      logWarn("agent.owner_task_failure_log_skipped", {
        workspaceId,
        topicId,
        reason: taskError instanceof Error ? taskError.message : "Unknown error",
      });
    }
    await finishAgentJob(job.id, "failed", "Article generation failed: retry to try again.", {
      topicId,
    });
    logError("article.generation_failed", { workspaceId, topicId, error: detail });
    throw error;
  }
}
