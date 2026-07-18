import { z } from "zod";
import { getBrand, getBrandProfile, type BrandScope } from "@/lib/brand/repository";
import { getBrandIntelligence } from "@/lib/brand/intelligence";
import { getAgentControlState } from "@/lib/agent/memory";
import { loadTrustedDraftMemory } from "@/lib/agent/memory-context";
import { isArticleGenerationBlockedByOwnerConstraint } from "@/lib/agent/policy";
import { assertAgentOperationAllowed } from "@/lib/agent/safety";
import {
  beginOwnerDirectedWritingTask,
  completeOwnerDirectedWritingTask,
} from "@/lib/agent/planner";
import {
  createArticle,
  claimTopicForGeneration,
  getArticleByTopic,
  getTopic,
  setGeneratedArticleStatus,
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
import {
  loadGenerationGrounding,
  prepareArticleGroundingEvaluation,
  recordArticleGroundingEvaluation,
} from "@/lib/grounding/service";

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
const articleMetadataSchema: z.ZodType<ArticleMetadata> = z.object({
  title: z.string().min(1).max(300),
  slug: z.string().min(1).max(300),
  metaDescription: z.string().max(500),
  tags: z.array(z.string().min(1).max(100)).max(20),
});

const EVIDENCE_REFERENCE_PATTERN = /\bev_[a-f0-9]{20}\b/gi;

function planningEvidenceIssue(
  text: string,
  allowedEvidenceIds: ReadonlySet<string>,
  stage: "summary" | "outline",
): string | null {
  const references = [...new Set(text.match(EVIDENCE_REFERENCE_PATTERN) ?? [])];
  const unknown = references.filter((reference) => !allowedEvidenceIds.has(reference));
  if (unknown.length > 0) return `unknown evidence IDs: ${unknown.join(", ")}`;
  if (/\bE\d+\b/.test(text)) return "invented shorthand evidence IDs";
  if (allowedEvidenceIds.size > 0 && references.length === 0) {
    return "no exact evidence ID was cited";
  }
  if (allowedEvidenceIds.size === 0) return null;
  if (stage === "summary") {
    const sentences = text
      .split(/(?<=[.!?])\s+|[\r\n]+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    const unsupportedIndex = sentences.findIndex((sentence) => {
      if (/\b(?:example|hypothesis|opinion|proposal|recommendation)\b/i.test(sentence)) return false;
      return (sentence.match(EVIDENCE_REFERENCE_PATTERN) ?? []).length === 0;
    });
    if (unsupportedIndex >= 0) {
      return `summary sentence ${unsupportedIndex + 1} has no declared evidence`;
    }
  } else {
    const notes = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^#{1,6}\s/.test(line));
    const unsupportedIndex = notes.findIndex((note) => {
      if (/Evidence:\s*none\s*\(opinion\/example\)\s*$/i.test(note)) return false;
      if (!/Evidence:/i.test(note)) return true;
      return (note.match(EVIDENCE_REFERENCE_PATTERN) ?? []).length === 0;
    });
    if (unsupportedIndex >= 0) {
      return `outline note ${unsupportedIndex + 1} has no valid evidence declaration`;
    }
  }
  return null;
}

function planningEvidenceRepairMessage(
  stage: "summary" | "outline",
  allowedEvidenceIds: ReadonlySet<string>,
  issue: string,
) {
  return `The previous ${stage} is held because it contains ${issue}. Rewrite it using only these exact evidence IDs: ${
    [...allowedEvidenceIds].join(", ") || "none"
  }. Do not invent aliases such as E1. When evidence is absent, omit factual specifics and label unsupported outline material as opinion/example.`;
}

type GenerateOptions = {
  /** Agent runs obey stored pauses/constraints; direct owner actions override them. */
  actor?: "agent" | "owner";
  /** Credits to charge on success. Defaults to the article-generation cost. */
  creditCost?: number;
  /** Retry-stable ledger identity allocated before generation starts. */
  billingWorkId?: string;
  /** Skip the credit assert/spend entirely (e.g. internal/admin reruns). */
  skipCreditCheck?: boolean;
  origin?: string;
  /**
   * Force the article to "draft" regardless of autonomy mode. Used for
   * non-subscribers so their output is never auto-published: publishing stays a
   * paid feature unlocked by an active subscription.
   */
  forceDraft?: boolean;
  /**
   * Keep a registry-classified draft tool behind a local-only boundary. The
   * legacy fixed workflow defaults to auto-publish behavior when eligible.
   */
  autoPublish?: boolean;
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
  const actor = options.actor ?? "owner";
  const controls = await getAgentControlState(brandId);
  assertAgentOperationAllowed("drafting", { actor, controls });
  if (!options.skipCreditCheck) {
    assertAgentOperationAllowed("billable", { actor, controls });
  }
  const topic = await getTopic(brandId, topicId);
  if (!topic) {
    throw new Error("Topic not found");
  }
  const existing = await getArticleByTopic(brandId, topicId);
  if (existing) {
    let creditCharged: boolean | null = null;
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
            refId: options.billingWorkId ?? existing.id,
            actor,
          });
          creditCharged = true;
        } catch (error) {
          creditCharged = false;
          logWarn("article.credit_charge_skipped", {
            workspaceId,
            articleId: existing.id,
            reason: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
      await updateTopicStatus(topicId, "completed");
      if (existing.status === "approved" && options.autoPublish !== false) {
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
    return { article: existing, trace: null, creditCharged };
  }

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

  const claimedTopic = await claimTopicForGeneration(scope, topicId);
  if (!claimedTopic) {
    throw new Error("Topic is no longer eligible for generation");
  }

  let job: Awaited<ReturnType<typeof createAgentJob>>;
  try {
    job = await createAgentJob(scope, "writing", `Generating article for: ${topic.title}`);
  } catch (error) {
    await updateTopicStatus(topicId, "failed");
    throw error;
  }

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
    const [profile, intelligence, grounding, trustedMemory] = await Promise.all([
      getBrandProfile(brandId),
      getBrandIntelligence(brandId),
      loadGenerationGrounding(scope, topicId),
      loadTrustedDraftMemory(scope, topic),
    ]);
    const voice = parseVoiceDoc(profile?.voiceJson);
    const correctedSubjects = new Set(trustedMemory.correctedSubjects);
    const unlessCorrected = <T,>(subjectKey: string, value: T) =>
      correctedSubjects.has(subjectKey) ? null : value;
    const brandContext: BrandContext = {
      productDescription: unlessCorrected(
        "brand.profile.product_description",
        profile?.productDescription || intelligence?.description,
      ),
      audience: unlessCorrected("brand.profile.target_audience", profile?.audience),
      tone: unlessCorrected("brand.profile.tone", profile?.tone),
      website: unlessCorrected("brand.profile.website", profile?.website),
      seedKeywords: unlessCorrected("brand.profile.seed_keywords", profile?.seedKeywords),
      slogan: intelligence?.slogan,
      industries: intelligence?.data.industries
        ? Object.values(intelligence.data.industries)
            .flat()
            .filter((value): value is string => typeof value === "string")
            .slice(0, 8)
            .join(", ")
        : null,
      voice: voice ? renderVoiceBlock(voice) : null,
      trustedMemory: trustedMemory.promptContext,
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

    const summaryMessages = summaryPrompt(topicInput, brandContext, grounding.promptPacket);
    const allowedEvidenceIds = new Set(
      grounding.packet.records.map((record) => record.evidenceId.toLowerCase()),
    );
    let summary = await generateText("light", [
      { role: "system", content: summaryMessages.system },
      { role: "user", content: summaryMessages.user },
    ]);
    tokenUsage = addTokenUsage(tokenUsage, summary);
    let summaryIssue = planningEvidenceIssue(summary.text, allowedEvidenceIds, "summary");
    if (summaryIssue) {
      summary = await generateText("light", [
        { role: "system", content: summaryMessages.system },
        { role: "user", content: summaryMessages.user },
        { role: "assistant", content: summary.text },
        {
          role: "user",
          content: planningEvidenceRepairMessage("summary", allowedEvidenceIds, summaryIssue),
        },
      ]);
      tokenUsage = addTokenUsage(tokenUsage, summary);
      summaryIssue = planningEvidenceIssue(summary.text, allowedEvidenceIds, "summary");
    }
    if (summaryIssue) {
      throw new Error(`Grounded summary held after bounded repair: ${summaryIssue}.`);
    }

    const outlineMessages = outlinePrompt(
      topicInput,
      brandContext,
      summary.text,
      shape,
      grounding.promptPacket,
    );
    let outline = await generateText("heavy", [
      { role: "system", content: outlineMessages.system },
      { role: "user", content: outlineMessages.user },
    ]);
    tokenUsage = addTokenUsage(tokenUsage, outline);
    let outlineIssue = planningEvidenceIssue(outline.text, allowedEvidenceIds, "outline");
    if (outlineIssue) {
      outline = await generateText("heavy", [
        { role: "system", content: outlineMessages.system },
        { role: "user", content: outlineMessages.user },
        { role: "assistant", content: outline.text },
        {
          role: "user",
          content: planningEvidenceRepairMessage("outline", allowedEvidenceIds, outlineIssue),
        },
      ]);
      tokenUsage = addTokenUsage(tokenUsage, outline);
      outlineIssue = planningEvidenceIssue(outline.text, allowedEvidenceIds, "outline");
    }
    if (outlineIssue) {
      throw new Error(`Grounded outline held after bounded repair: ${outlineIssue}.`);
    }

    const draftMessages = draftPrompt(
      topicInput,
      brandContext,
      outline.text,
      shape,
      grounding.promptPacket,
      grounding.internalTargets,
    );
    const draft = await generateText("heavy", [
      { role: "system", content: draftMessages.system },
      { role: "user", content: draftMessages.user },
    ]);
    tokenUsage = addTokenUsage(tokenUsage, draft);

    const seoMessages = seoEditPrompt(draft.text, topic.keywords, grounding.promptPacket);
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
      const rewriteMessages = styleRewritePrompt(body, lint.hits, grounding.promptPacket);
      const rewritten = await generateText("heavy", [
        { role: "system", content: rewriteMessages.system },
        { role: "user", content: rewriteMessages.user },
      ]);
      tokenUsage = addTokenUsage(tokenUsage, rewritten);
      body = rewritten.text;
      lint = lintArticle(body, shape);
      rewritePasses += 1;
    }

    const metadataMessages = metadataPrompt(topicInput, body, grounding.promptPacket);
    const metadata = await generateJson("light", [
      { role: "system", content: metadataMessages.system },
      { role: "user", content: metadataMessages.user },
    ], { schema: articleMetadataSchema });
    tokenUsage = addTokenUsage(tokenUsage, metadata);

    const finalTitle = metadata.data.title || topic.title;
    const finalSlug = metadata.data.slug || slugify(finalTitle);
    const finalTags = metadata.data.tags ?? [];
    const preparedGrounding = await prepareArticleGroundingEvaluation(scope, {
      topicId: topic.id,
      title: finalTitle,
      slug: finalSlug,
      metaDescription: metadata.data.metaDescription,
      tags: finalTags,
      bodyMarkdown: body,
      shape,
      actor,
      stylePassed: lint.passed,
      origin: options.origin,
      grounding,
    });
    let gateResults: GateResult[] = preparedGrounding.gateResults;
    let article;
    let createdHere = true;
    try {
      article = await createArticle(scope, {
        topicId: topic.id,
        title: finalTitle,
        slug: finalSlug,
        metaDescription: metadata.data.metaDescription,
        tags: finalTags,
        bodyMarkdown: body,
        // Insert as a draft first. Approval is finalized only after the exact
        // article version/hash has a durable claim ledger and passed gate run.
        status: "draft",
        shape,
        gateResultsJson: JSON.stringify(gateResults),
        memoryEvidenceRefs: trustedMemory.evidenceRefs,
      });
    } catch (error) {
      // Concurrent generate on the same topic (unique index): return the winner.
      const raced = await getArticleByTopic(brandId, topicId);
      if (raced) {
        article = raced;
        createdHere = false;
      } else {
        throw error;
      }
    }

    let groundingPersisted = false;
    let groundingPassed = false;
    if (createdHere) {
      try {
        const recorded = await recordArticleGroundingEvaluation(
          scope,
          { id: article.id, version: article.version },
          preparedGrounding,
        );
        groundingPersisted = recorded.persisted;
        groundingPassed = recorded.passed;
      } catch (error) {
        logWarn("article.grounding_persistence_failed", {
          workspaceId,
          articleId: article.id,
          reason: error instanceof Error ? error.message : "Unknown error",
        });
      }
      if (!groundingPersisted) {
        gateResults = [
          ...gateResults,
          {
            gate: "grounding-persistence",
            passed: false,
            detail: "The exact-content publication decision could not be persisted.",
          },
        ];
      }
      const authorityAllowsApproval =
        brand.autonomyMode === "FULL_AUTO" ||
        controls.grantedCapabilities.includes("article.create");
      const finalStatus =
        !options.forceDraft && groundingPassed && authorityAllowsApproval ? "approved" : "draft";
      article =
        (await setGeneratedArticleStatus(
          brandId,
          article.id,
          finalStatus,
          JSON.stringify(gateResults),
        )) ?? article;
    } else {
      groundingPassed = article.status === "approved";
    }
    const flaggedForReview = options.forceDraft === true || !lint.passed || !groundingPassed;

    // Charge only after the article exists, so a failed generation never burns
    // credits. Drains the monthly bucket before purchased credits. The balance
    // was asserted up front; if a concurrent spend drained it in the meantime the
    // charge can still fall short: keep the finished article rather than orphan
    // it, and log the miss instead of failing the request.
    let creditCharged: boolean | null = options.skipCreditCheck ? null : true;
    if (!options.skipCreditCheck) {
      try {
        await spendCredits(workspaceId, creditCost, {
          reason: "article_generation",
          brandId,
          refType: "article",
          refId: options.billingWorkId ?? article.id,
          actor,
        });
      } catch (error) {
        creditCharged = false;
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
        groundingPersisted,
        groundingPassed,
        evidenceBundleId: grounding.bundleId,
        evidenceBundleVersion: grounding.bundleVersion,
        groundingEvaluatorVersions: preparedGrounding.evaluatorVersions,
        memoryEvidenceRefs: trustedMemory.evidenceRefs,
        finalContentHash: preparedGrounding.finalContentHash,
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
      groundingPersisted,
      groundingPassed,
      evidenceBundleId: grounding.bundleId,
      totalTokens: tokenUsage.totalTokens,
    });

    // FULL_AUTO produces approved articles; publish them to enabled destinations now.
    // REVIEW leaves drafts that publish on manual approval.
    if (article.status === "approved" && options.autoPublish !== false) {
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

    return { article, trace, creditCharged };
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
