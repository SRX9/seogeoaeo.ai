import { parseTags } from "@/lib/articles/format";
import { getArticle } from "@/lib/articles/repository";
import type { BrandScope } from "@/lib/brand/repository";
import { getRequestOrigin } from "@/lib/billing/access";
import { incrementArticlesPublished } from "@/lib/jobs/repository";
import { logWarn } from "@/lib/logging/logger";
import {
  listIntegrations,
  readIntegrationSecret,
} from "@/lib/integrations/repository";
import type { IntegrationProviderId } from "@/lib/integrations/providers";
import { getPublishingAdapter } from "@/lib/publishing/adapters";
import { getPublication, upsertPublication } from "@/lib/publishing/repository";
import type { PublishArticle, PublishResult } from "@/lib/publishing/types";

export type DestinationPublishResult = {
  provider: IntegrationProviderId;
  result: PublishResult;
};

/**
 * Stable fingerprint of the fields we actually send to a destination. Used to
 * detect whether anything changed since the last successful publish so we can
 * skip a no-op re-publish. Web Crypto keeps this runtime-agnostic (Node + the
 * Cloudflare Workers runtime the app deploys to).
 */
async function contentFingerprint(article: PublishArticle): Promise<string> {
  const payload = JSON.stringify([
    article.title,
    article.slug,
    article.metaDescription ?? "",
    article.tags,
    article.bodyMarkdown,
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toPublishArticle(article: {
  id: string;
  title: string;
  slug: string;
  metaDescription: string | null;
  tags: string | null;
  bodyMarkdown: string;
}): PublishArticle {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    metaDescription: article.metaDescription,
    tags: parseTags(article.tags),
    bodyMarkdown: article.bodyMarkdown,
  };
}

async function publishToDestination(
  scope: BrandScope,
  article: PublishArticle,
  provider: IntegrationProviderId,
  origin: string,
  fingerprint: string,
) {
  const adapter = getPublishingAdapter(provider);
  if (!adapter) {
    return {
      provider,
      result: { ok: false, error: "Publishing adapter is not available" } satisfies PublishResult,
    };
  }

  const integrations = await listIntegrations(scope.brandId);
  const integration = integrations.find((item) => item.provider === provider);
  if (!integration?.enabled) {
    return {
      provider,
      result: { ok: false, error: "Integration is not enabled" } satisfies PublishResult,
    };
  }

  const existing = await getPublication(scope.brandId, article.id, provider);

  // Nothing changed since the last successful publish to this destination — skip
  // it so we don't re-send identical content (which providers like dev.to reject
  // as a duplicate). Failed destinations always retry.
  if (existing?.status === "published" && existing.publishedHash === fingerprint) {
    return {
      provider,
      result: {
        ok: true,
        skipped: true,
        externalUrl: existing.externalUrl ?? undefined,
      } satisfies PublishResult,
    };
  }

  const attemptCount = (existing?.attemptCount ?? 0) + 1;
  const apiKey = await readIntegrationSecret(scope.brandId, provider, "api_key");

  const result = await adapter.publish(article, {
    workspaceId: scope.workspaceId,
    config: integration.config,
    secrets: apiKey ? { api_key: apiKey } : {},
    origin,
  });

  await upsertPublication(scope, article.id, provider, {
    status: result.ok ? "published" : "failed",
    externalUrl: result.externalUrl ?? null,
    errorMessage: result.error ?? null,
    attemptCount,
    publishedAt: result.ok ? new Date() : null,
    // Record the fingerprint only on success; keep the prior one on failure so
    // it still reflects the last content we actually published.
    publishedHash: result.ok ? fingerprint : (existing?.publishedHash ?? null),
  });

  return { provider, result };
}

export async function publishArticleToDestinations(
  scope: BrandScope,
  articleId: string,
  origin?: string,
) {
  const article = await getArticle(scope.brandId, articleId);
  if (!article) {
    throw new Error("Article not found");
  }

  if (article.status !== "approved") {
    throw new Error("Only approved articles can be published");
  }

  const integrations = await listIntegrations(scope.brandId);
  const enabledProviders = integrations
    .filter((integration) => integration.enabled && integration.available)
    .map((integration) => integration.provider)
    .filter((provider) => getPublishingAdapter(provider));

  if (enabledProviders.length === 0) {
    throw new Error("No enabled publishing destinations");
  }

  const publishArticle = toPublishArticle(article);
  const resolvedOrigin = origin ?? (await getRequestOrigin());
  const fingerprint = await contentFingerprint(publishArticle);
  const results: DestinationPublishResult[] = [];

  for (const provider of enabledProviders) {
    results.push(
      await publishToDestination(scope, publishArticle, provider, resolvedOrigin, fingerprint),
    );
  }

  // Count the article once if it newly reached at least one destination (a pure
  // no-op re-publish where every destination was skipped doesn't count). Metrics
  // are non-critical, so a counter failure never breaks publishing.
  const newlyPublished = results.some((entry) => entry.result.ok && !entry.result.skipped);
  if (newlyPublished) {
    try {
      await incrementArticlesPublished(scope);
    } catch (error) {
      logWarn("usage.published_counter_skipped", {
        workspaceId: scope.workspaceId,
        articleId,
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}
