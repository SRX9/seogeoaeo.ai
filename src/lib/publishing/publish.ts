import { parseTags } from "@/lib/articles/format";
import {
  recordAgentAction,
  validateAgentApprovalForExecution,
} from "@/lib/agent/events";
import { getAgentControlState } from "@/lib/agent/memory";
import { validateMemoryEvidenceRefsAtExecution } from "@/lib/agent/layered-memory";
import { authorizeAction } from "@/lib/agent/policy";
import { DEFAULT_ACTION_POLICY_VERSION } from "@/lib/agent/proposal";
import { assertAgentOperationAllowed } from "@/lib/agent/safety";
import { getArticle } from "@/lib/articles/repository";
import { getBrand, type BrandScope } from "@/lib/brand/repository";
import { assertFreshAutomaticPublicationGate } from "@/lib/grounding/service";
import { hashFinalPublicationContent } from "@/lib/grounding/publication-gate";
import { getRequestOrigin } from "@/lib/billing/access";
import { incrementArticlesPublished } from "@/lib/jobs/repository";
import { logError, logWarn } from "@/lib/logging/logger";
import {
  listIntegrations,
  readIntegrationSecrets,
} from "@/lib/integrations/repository";
import type { IntegrationProviderId } from "@/lib/integrations/providers";
import { isIntegrationOperational } from "@/lib/integrations/providers";
import { getPublishingAdapter } from "@/lib/publishing/adapters";
import { getPublication, upsertPublication } from "@/lib/publishing/repository";
import type { PublishArticle, PublishResult } from "@/lib/publishing/types";

export type DestinationPublishResult = {
  provider: IntegrationProviderId;
  result: PublishResult;
};

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
  authority: {
    actor: "agent" | "owner";
    autonomyMode: "FULL_AUTO" | "REVIEW";
    ownerConstraints: string[];
    grantedCapabilities: readonly import("@/lib/integrations/capabilities").ConnectorCapability[];
    publishingPaused: boolean;
    publishingPauseInstruction: string | null;
    taskId?: string | null;
    approvalId?: string | null;
  },
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
  if (!integration.requirementsMet) {
    return {
      provider,
      result: { ok: false, error: "Integration setup is incomplete" } satisfies PublishResult,
    };
  }

  const existing = await getPublication(scope.brandId, article.id, provider);
  const liveControls =
    authority.actor === "agent" ? await getAgentControlState(scope.brandId) : null;
  if (
    authority.actor === "agent" &&
    (liveControls?.paused || liveControls?.publishingPaused || authority.publishingPaused)
  ) {
    return {
      provider,
      result: {
        ok: false,
        error:
          liveControls?.pauseInstruction ??
          liveControls?.publishingPauseInstruction ??
          authority.publishingPauseInstruction ??
          "Publishing is paused by the owner.",
      } satisfies PublishResult,
    };
  }
  const capability = existing?.externalId ? "article.update" : "article.create";
  const actionType = existing?.externalId ? "update article" : "publish article";
  const resourceRef = `${provider}:article:${article.id}`;
  const beforeState = existing
    ? {
        externalId: existing.externalId,
        externalUrl: existing.externalUrl,
        publishedHash: existing.publishedHash,
      }
    : null;
  const afterState = {
    title: article.title,
    slug: article.slug,
    metaDescription: article.metaDescription,
    contentFingerprint: fingerprint,
  };
  const approvalValidation =
    authority.actor === "agent" && authority.approvalId
      ? await validateAgentApprovalForExecution(scope, authority.approvalId, {
          actionType,
          capability,
          resourceRef,
          beforeState,
          afterState,
          destination: provider,
          policyVersion: DEFAULT_ACTION_POLICY_VERSION,
        })
      : null;
  // Refresh at the executor boundary so revocation affects workflows that were
  // already running when the owner changed authority.
  const authorityResult = authorizeAction({
    mode: authority.autonomyMode,
    capability,
    availableCapabilities: integration.capabilities,
    riskLevel: "low",
    resourceRef: `${provider}:article:${article.slug}`,
    destination: provider,
    ownerConstraints: liveControls?.ownerConstraints ?? authority.ownerConstraints,
    grantedCapabilities: liveControls?.grantedCapabilities ?? authority.grantedCapabilities,
    canonicalPolicies: liveControls?.canonicalPolicies ?? [],
    approvalValidated: approvalValidation?.valid === true,
  });
  if (
    authorityResult.decision === "deny" ||
    (authority.actor === "agent" &&
      authorityResult.decision === "require_approval" &&
      approvalValidation?.valid !== true)
  ) {
    return {
      provider,
      result: {
        ok: false,
        error:
          approvalValidation?.valid === false
            ? approvalValidation.reason
            : authorityResult.reason,
      } satisfies PublishResult,
    };
  }

  async function recordPublicationAction(remoteRef?: string | null) {
    try {
      await recordAgentAction(scope, {
        taskId: authority.taskId,
        approvalId: approvalValidation?.valid === true ? authority.approvalId : null,
        actionType,
        resourceRef,
        capability,
        idempotencyKey: `publish:${provider}:${article.id}:${fingerprint}`,
        beforeState,
        appliedChange: {
          ...afterState,
          authority: {
            actor: authority.actor,
            mode: authority.autonomyMode,
            decision: authorityResult.decision,
            reason: authorityResult.reason,
            satisfiedBy:
              authority.actor === "owner" && authorityResult.decision === "require_approval"
                ? "owner_initiated_action"
                : "policy",
          },
        },
        remoteRef: remoteRef ?? null,
        verificationStatus: "verified",
        verificationResult: { providerAccepted: true },
      });
    } catch (error) {
      // The provider write and publication row remain the source of truth. The
      // next retry reconciles this idempotent ledger key without a second event.
      logError("agent.action_ledger.record_failed", {
        brandId: scope.brandId,
        articleId: article.id,
        provider,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Nothing changed since the last successful publish to this destination: skip
  // it so we don't re-send identical content (which providers like dev.to reject
  // as a duplicate). Failed destinations always retry.
  if (existing?.status === "published" && existing.publishedHash === fingerprint) {
    await recordPublicationAction(existing.externalUrl ?? existing.externalId);
    return {
      provider,
      result: {
        ok: true,
        skipped: true,
        externalUrl: existing.externalUrl ?? undefined,
      } satisfies PublishResult,
    };
  }

  // A prior executor reached the remote-call boundary but did not persist a
  // definitive result. Without provider read-back (Phase 6), retrying could
  // create a duplicate. Keep the item operator-visible and fail closed.
  if (existing?.status === "pending") {
    return {
      provider,
      result: {
        ok: false,
        error:
          existing.errorMessage ??
          "Previous publish delivery is uncertain; verify the destination before retrying.",
      } satisfies PublishResult,
    };
  }

  const attemptCount = (existing?.attemptCount ?? 0) + 1;
  const wasPublished = existing?.status === "published";
  // Persist the stable destination work record before crossing the remote
  // boundary. A process/response loss leaves `pending`, which prevents an
  // automatic duplicate on Workflow retry.
  await upsertPublication(scope, article.id, provider, {
    status: "pending",
    externalUrl: existing?.externalUrl ?? null,
    externalId: existing?.externalId ?? null,
    errorMessage: "Remote delivery started; verification is pending.",
    attemptCount,
    publishedAt: existing?.publishedAt ?? null,
    publishedHash: existing?.publishedHash ?? null,
  });
  const secrets = await readIntegrationSecrets(scope.brandId, provider);

  let result: PublishResult;
  let deliveryUncertain = false;
  try {
    result = await adapter.publish(article, {
      workspaceId: scope.workspaceId,
      config: integration.config,
      secrets,
      origin,
      // Prefer a stored remote id so adapters update instead of creating a duplicate.
      externalId: existing?.externalId ?? null,
      externalUrl: existing?.externalUrl ?? null,
    });
  } catch (error) {
    // Adapters should return { ok: false }, but never let one throw abort siblings.
    deliveryUncertain = true;
    result = {
      ok: false,
      error: error instanceof Error ? error.message : "Publishing adapter failed unexpectedly",
    };
  }

  if (!result.ok && /request failed:/i.test(result.error ?? "")) {
    deliveryUncertain = true;
  }

  if (result.ok) {
    await upsertPublication(scope, article.id, provider, {
      status: "published",
      externalUrl: result.externalUrl ?? existing?.externalUrl ?? null,
      externalId: result.externalId ?? existing?.externalId ?? null,
      errorMessage: null,
      attemptCount,
      publishedAt: new Date(),
      publishedHash: fingerprint,
    });
    await recordPublicationAction(result.externalUrl ?? result.externalId);
  } else {
    if (deliveryUncertain) {
      await upsertPublication(scope, article.id, provider, {
        status: "pending",
        externalUrl: existing?.externalUrl ?? null,
        externalId: existing?.externalId ?? null,
        errorMessage:
          "Remote delivery may have succeeded, but its response was lost. Verify the destination before retrying.",
        attemptCount,
        publishedAt: existing?.publishedAt ?? null,
        publishedHash: existing?.publishedHash ?? null,
      });
      return { provider, result };
    }
    // Never wipe a previously successful publish: the remote post is still live.
    // Only stamp the error + attempt count so the UI can show retry context.
    await upsertPublication(scope, article.id, provider, {
      status: wasPublished ? "published" : "failed",
      externalUrl: existing?.externalUrl ?? null,
      externalId: existing?.externalId ?? null,
      errorMessage: result.error ?? null,
      attemptCount,
      publishedAt: existing?.publishedAt ?? null,
      publishedHash: existing?.publishedHash ?? null,
    });
  }

  return { provider, result };
}

export async function publishArticleToDestinations(
  scope: BrandScope,
  articleId: string,
  origin?: string,
  options: {
    actor?: "agent" | "owner";
    taskId?: string | null;
    approvalId?: string | null;
  } = {},
) {
  const [article, brand, controls] = await Promise.all([
    getArticle(scope.brandId, articleId),
    getBrand(scope.workspaceId, scope.brandId),
    getAgentControlState(scope.brandId),
  ]);
  if (!article) {
    throw new Error("Article not found");
  }

  if (article.status !== "approved") {
    throw new Error("Only approved articles can be published");
  }
  if (!brand) throw new Error("Brand not found");

  if (article.memoryEvidenceRefs.length > 0) {
    if (article.memoryEvidenceVersion !== article.version) {
      throw new Error(
        "This article's memory evidence does not match its current version. Regenerate it before publishing.",
      );
    }
    const memoryEvidence = await validateMemoryEvidenceRefsAtExecution(
      scope,
      article.memoryEvidenceRefs,
      { consumer: "draft" },
    );
    if (!memoryEvidence.valid) {
      throw new Error(
        `This article depends on memory that is no longer current (${memoryEvidence.reason}). Regenerate it before publishing.`,
      );
    }
  }

  assertAgentOperationAllowed("publishing", {
    actor: options.actor ?? "owner",
    controls,
  });

  const integrations = await listIntegrations(scope.brandId);
  const enabledProviders = integrations.flatMap((integration) => {
    if (!isIntegrationOperational(integration)) {
      return [];
    }
    return getPublishingAdapter(integration.provider) ? [integration.provider] : [];
  });

  if (enabledProviders.length === 0) {
    throw new Error("No enabled publishing destinations");
  }

  const publishArticle = toPublishArticle(article);
  const resolvedOrigin = origin ?? (await getRequestOrigin());
  const fingerprint = await hashFinalPublicationContent(publishArticle);
  if ((options.actor ?? "owner") === "agent") {
    await assertFreshAutomaticPublicationGate(scope, article, { origin: resolvedOrigin });
  }
  const results: DestinationPublishResult[] = await Promise.all(
    enabledProviders.map((provider) =>
      publishToDestination(scope, publishArticle, provider, resolvedOrigin, fingerprint, {
        actor: options.actor ?? "owner",
        autonomyMode: brand.autonomyMode === "REVIEW" ? "REVIEW" : "FULL_AUTO",
        // A direct owner click is an explicit override of instructions previously
        // given to the agent; connector capability checks still apply.
        ownerConstraints: (options.actor ?? "owner") === "agent" ? controls.ownerConstraints : [],
        grantedCapabilities: controls.grantedCapabilities,
        publishingPaused: controls.paused || controls.publishingPaused,
        publishingPauseInstruction:
          controls.pauseInstruction ?? controls.publishingPauseInstruction,
        taskId: options.taskId,
        approvalId: options.approvalId,
      }),
    ),
  );

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
