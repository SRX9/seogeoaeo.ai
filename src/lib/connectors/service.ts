import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import {
  validateAgentApprovalForExecution,
} from "@/lib/agent/events";
import {
  authorizeAgentAutonomyAction,
  type AutonomyReservation,
} from "@/lib/agent/autonomy-rollout";
import { getAgentControlState } from "@/lib/agent/memory";
import { authorizeAction } from "@/lib/agent/policy";
import {
  computeActionProposalHash,
  DEFAULT_ACTION_POLICY_VERSION,
  type ActionProposalMaterial,
} from "@/lib/agent/proposal";
import { assertAgentOperationAllowed } from "@/lib/agent/safety";
import { getArticle } from "@/lib/articles/repository";
import { getBrand, type BrandScope } from "@/lib/brand/repository";
import {
  canLiveApplyCapability,
  isConnectorCapabilityCertified,
} from "@/lib/connectors/certification";
import {
  connectorErrorRateShouldStop,
  fingerprintConnectorState,
} from "@/lib/connectors/protocol";
import {
  claimConnectorMutationForWrite,
  getConnectorCertification,
  getConnectorActivation,
  getConnectorMutation,
  getConnectorMutationByIdempotency,
  getOpenConnectorCircuit,
  finalizeConnectorRollback,
  listRecentConnectorOutcomes,
  listConnectorHealthScopes,
  openConnectorCircuit,
  reserveConnectorMutation,
  transitionConnectorMutation,
  verifyConnectorMutationWithAction,
} from "@/lib/connectors/repository";
import { getConnectorAdapter } from "@/lib/connectors/registry";
import {
  ConnectorAdapterError,
  type ConnectorContext,
  type ConnectorDiffEntry,
  type ConnectorFetch,
} from "@/lib/connectors/types";
import type {
  WordPressArticleMetaConfig,
  WordPressArticleMetaDesiredState,
  WordPressArticleMetaField,
  WordPressArticleMetaSecrets,
  WordPressArticleMetaState,
} from "@/lib/connectors/wordpress";
import { fingerprintWordPressIntegration } from "@/lib/connectors/wordpress";
import { getDb } from "@/lib/db";
import { trafficSnapshots } from "@/lib/db/schema";
import { connectorHasCapability } from "@/lib/integrations/capabilities";
import {
  getIntegrationBinding,
  readIntegrationSecrets,
} from "@/lib/integrations/repository";
import { isIntegrationOperational } from "@/lib/integrations/providers";
import { getPublication } from "@/lib/publishing/repository";
import { safePublicFetch } from "@/lib/visibility/egress";

const PROVIDER = "wordpress" as const;
const CAPABILITY = "article.meta.update" as const;

const persistedDiffSchema = z
  .array(
    z
      .object({
        field: z.enum(["slug", "excerpt"]),
        before: z.string(),
        after: z.string(),
      })
      .strict(),
  )
  .max(2);

const persistedRemoteStateSchema = z
  .object({
    protocol: z.literal("claudia-wordpress-mutation-v1"),
    pluginVersion: z.literal("1.0.0"),
    id: z.number().int().positive(),
    link: z.string().url().regex(/^https?:\/\//i),
    modifiedGmt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    slug: z.string(),
    excerpt: z.string(),
    status: z.literal("publish"),
  })
  .strict();

const persistedStateSchema = z
  .object({
    remote: persistedRemoteStateSchema,
    connection: z
      .object({
        integrationId: z.string().uuid(),
        endpointOrigin: z.string().url(),
        configFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        activationId: z.string().uuid(),
        activationFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
  })
  .strict();

type PersistedWordPressState = z.infer<typeof persistedStateSchema>;

export class ConnectorProtocolError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly status: number,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "ConnectorProtocolError";
  }
}

type MutationRow = NonNullable<Awaited<ReturnType<typeof getConnectorMutation>>>;
type WordPressDiff = ConnectorDiffEntry<WordPressArticleMetaField>[];
type StepResult = { mutationId: string; status: string; ok: boolean };

function protocolError(
  code: string,
  message: string,
  options: { retryable?: boolean; status?: number; retryAfterMs?: number | null } = {},
) {
  return new ConnectorProtocolError(
    code,
    message,
    options.retryable ?? false,
    options.status ?? (options.retryable ? 503 : 422),
    options.retryAfterMs ?? null,
  );
}

function normalizeConnectorError(error: unknown): ConnectorProtocolError {
  if (error instanceof ConnectorProtocolError) return error;
  if (error instanceof ConnectorAdapterError) {
    return protocolError(error.code, error.message, {
      retryable: error.retryable,
      status: error.status ?? (error.retryable ? 503 : 422),
      retryAfterMs: error.retryAfterMs,
    });
  }
  return protocolError(
    "connector_internal_error",
    "Connector operation failed.",
    { retryable: true, status: 503 },
  );
}

function parseMutationDiff(mutation: MutationRow): WordPressDiff {
  const parsed = persistedDiffSchema.safeParse(mutation.intendedDiff);
  if (!parsed.success) {
    throw protocolError(
      "persisted_schema_drift",
      "Stored connector mutation diff is invalid.",
      { status: 500 },
    );
  }
  return parsed.data;
}

function parseMutationBeforeState(mutation: MutationRow): PersistedWordPressState {
  const parsed = persistedStateSchema.safeParse(mutation.beforeState);
  if (!parsed.success) {
    throw protocolError(
      "persisted_schema_drift",
      "Stored connector before-state is invalid.",
      { status: 500 },
    );
  }
  return parsed.data;
}

function reverseDiff(diff: WordPressDiff): WordPressDiff {
  return diff.map((entry) => ({
    field: entry.field,
    before: entry.after,
    after: entry.before,
  }));
}

function intendedProjection(
  diff: WordPressDiff,
  state: WordPressArticleMetaState,
): Record<string, string> {
  return Object.fromEntries(diff.map((entry) => [entry.field, state[entry.field]]));
}

function actorFromMutation(mutation: MutationRow): "agent" | "owner" {
  if (mutation.policyDecision.actor === "agent") return "agent";
  if (mutation.policyDecision.actor === "owner") return "owner";
  throw protocolError(
    "persisted_schema_drift",
    "Stored connector mutation actor is invalid.",
    { status: 500 },
  );
}

type WordPressBinding = NonNullable<
  Awaited<ReturnType<typeof getIntegrationBinding>>
>;

async function buildConnectionSnapshot(
  binding: WordPressBinding,
  activation: NonNullable<Awaited<ReturnType<typeof getConnectorActivation>>>,
  adapterVersion: string,
) {
  let endpointOrigin: string;
  let configFingerprint: string;
  try {
    ({ endpointOrigin, fingerprint: configFingerprint } =
      await fingerprintWordPressIntegration({
        integrationId: binding.integrationId,
        siteUrl: binding.config.siteUrl ?? "",
        username: binding.config.username ?? "",
        adapterVersion,
      }));
  } catch (error) {
    throw normalizeConnectorError(error);
  }
  const activationFingerprint = await fingerprintConnectorState({
    activationId: activation.id,
    certificationId: activation.certificationId,
    integrationId: activation.integrationId,
    activatedAt: activation.activatedAt?.toISOString() ?? null,
    evidence: activation.evidence,
  });
  return {
    integrationId: binding.integrationId,
    endpointOrigin,
    configFingerprint,
    activationId: activation.id,
    activationFingerprint,
  };
}

function assertPublishedRemoteIdentity(
  state: WordPressArticleMetaState,
  remoteResourceId: string,
) {
  if (
    state.protocol !== "claudia-wordpress-mutation-v1" ||
    state.status !== "publish" ||
    String(state.id) !== remoteResourceId
  ) {
    throw protocolError(
      "remote_identity_mismatch",
      "The WordPress companion returned a different or unpublished post.",
      { status: 409 },
    );
  }
}

function createConnectorFetch(scope: BrandScope, siteUrl: string): ConnectorFetch {
  return (input, init) => {
    const url = input instanceof Request ? input.url : input;
    return safePublicFetch(url, init, {
      maxBytes: 512 * 1024,
      // Never forward an Application Password across a redirect, including a
      // seemingly same-site www/non-www hop.
      maxRedirects: 0,
      sameSiteWith: siteUrl,
      workspaceBudgetKey: `connector:${scope.workspaceId}:${scope.brandId}`,
    });
  };
}

async function trafficAnomaly(scope: BrandScope) {
  const since = new Date(Date.now() - 21 * 86_400_000).toISOString().slice(0, 10);
  const rows = await getDb()
    .select({ date: trafficSnapshots.date, clicks: trafficSnapshots.clicks })
    .from(trafficSnapshots)
    .where(
      and(
        eq(trafficSnapshots.brandId, scope.brandId),
        eq(trafficSnapshots.source, "gsc"),
        gte(trafficSnapshots.date, since),
      ),
    )
    .orderBy(desc(trafficSnapshots.date))
    .limit(21);
  const gscRows = rows
    .filter((row) => row.date >= since && typeof row.clicks === "number")
    .slice(0, 14);
  const recent = gscRows.slice(0, 7);
  const baseline = gscRows.slice(7, 14);
  if (recent.length < 5 || baseline.length < 5) return null;
  const average = (values: typeof recent) =>
    values.reduce((sum, row) => sum + (row.clicks ?? 0), 0) / values.length;
  const recentAverage = average(recent);
  const baselineAverage = average(baseline);
  if (baselineAverage < 20 || recentAverage > baselineAverage * 0.5) return null;
  return {
    recentAverage,
    baselineAverage,
    dropPercent: Math.round((1 - recentAverage / baselineAverage) * 100),
  };
}

async function assertConnectorHealth(
  scope: BrandScope,
  provider: string,
  capability: string,
) {
  const open = await getOpenConnectorCircuit(scope, provider, capability);
  if (open) {
    throw protocolError("circuit_open", open.reason ?? "Connector circuit is open.", {
      status: 409,
    });
  }

  const outcomes = await listRecentConnectorOutcomes(scope, provider, capability);
  const criticalFailure = outcomes.find(
    (item) =>
      item.verificationStatus === "failed" ||
      [
        "verification_failed",
        "rollback_failed",
        "manual_recovery_required",
      ].includes(item.status),
  );
  if (criticalFailure) {
    await openConnectorCircuit(
      scope,
      provider,
      capability,
      "A connector verification or rollback failure requires operator review.",
      "unreviewed_failure",
    );
    throw protocolError(
      "connector_failure_unreviewed",
      "Connector writes stopped after a verification or rollback failure.",
      { status: 409 },
    );
  }
  if (connectorErrorRateShouldStop(outcomes)) {
    await openConnectorCircuit(
      scope,
      provider,
      capability,
      "Recent connector verification or rollback failures exceeded the safety threshold.",
      "error_rate",
    );
    throw protocolError(
      "connector_error_rate",
      "Connector writes stopped because the recent error rate is too high.",
      { status: 409 },
    );
  }

  const anomaly = await trafficAnomaly(scope);
  if (anomaly) {
    await openConnectorCircuit(
      scope,
      provider,
      capability,
      `Traffic fell ${anomaly.dropPercent}% versus the prior observed window.`,
      "traffic_anomaly",
    );
    throw protocolError(
      "traffic_anomaly",
      "Connector writes stopped because a traffic anomaly needs review.",
      { status: 409 },
    );
  }
}

/** Daily DB-backed safety scan; opens circuits before another write is allowed. */
export async function scanConnectorHealthSignals(limit = 100) {
  const scopes = await listConnectorHealthScopes(limit);
  let healthy = 0;
  let stopped = 0;
  for (const item of scopes) {
    try {
      await assertConnectorHealth(
        { workspaceId: item.workspaceId, brandId: item.brandId },
        item.provider,
        item.capability,
      );
      healthy += 1;
    } catch {
      stopped += 1;
    }
  }
  return { checked: scopes.length, healthy, stopped };
}

async function loadRuntime(
  scope: BrandScope,
  mutation: MutationRow,
  options: { forRollback?: boolean; requireWriteAuthority?: boolean } = {},
) {
  if (mutation.provider !== PROVIDER || mutation.capability !== CAPABILITY) {
    throw protocolError("unsupported_connector", "Connector mutation is not supported.", {
      status: 422,
    });
  }
  const adapter = getConnectorAdapter(PROVIDER, CAPABILITY);
  if (!adapter || adapter.version !== mutation.adapterVersion) {
    throw protocolError(
      "adapter_version_mismatch",
      "The certified connector adapter version is unavailable.",
      { status: 409 },
    );
  }

  const expectedState = parseMutationBeforeState(mutation);
  const [integration, secrets, controls, certification, brand] = await Promise.all([
    getIntegrationBinding(scope, PROVIDER),
    readIntegrationSecrets(scope.brandId, PROVIDER),
    getAgentControlState(scope.brandId),
    getConnectorCertification(
      PROVIDER,
      CAPABILITY,
      adapter.version,
      mutation.protocolVersion,
    ),
    getBrand(scope.workspaceId, scope.brandId),
  ]);
  if (!integration || !integration.requirementsMet) {
    throw protocolError(
      "owner_disconnected",
      "WordPress credentials are unavailable; manual recovery may be required.",
      { status: 409 },
    );
  }
  if (!options.forRollback && !isIntegrationOperational(integration)) {
    throw protocolError(
      "owner_disconnected",
      "The owner disconnected WordPress during execution.",
      { status: 409 },
    );
  }
  if (!certification || certification.id !== mutation.certificationId) {
    throw protocolError(
      "certification_changed",
      "Connector certification changed after the proposal was created.",
      { status: 409 },
    );
  }
  const activation = await getConnectorActivation(
    scope,
    integration.integrationId,
    certification.id,
  );
  if (!activation) {
    throw protocolError(
      "site_activation_missing",
      "This WordPress site is not activated for the certified mutation channel.",
      { status: 409 },
    );
  }
  const connection = await buildConnectionSnapshot(
    integration,
    activation,
    adapter.version,
  );
  if (
    connection.integrationId !== expectedState.connection.integrationId ||
    connection.endpointOrigin !== expectedState.connection.endpointOrigin ||
    connection.configFingerprint !== expectedState.connection.configFingerprint
  ) {
    throw protocolError(
      "connection_target_changed",
      "The WordPress connection changed after this mutation was prepared.",
      { status: 409 },
    );
  }
  if (
    !options.forRollback &&
    (connection.activationId !== expectedState.connection.activationId ||
      connection.activationFingerprint !==
        expectedState.connection.activationFingerprint)
  ) {
    throw protocolError(
      "site_activation_changed",
      "The WordPress site activation changed after this mutation was prepared.",
      { status: 409 },
    );
  }

  const actor = actorFromMutation(mutation);
  if (!options.forRollback) {
    let approvalValidated = Boolean(mutation.approvalId);
    if (options.requireWriteAuthority) {
      const proposalMaterial: ActionProposalMaterial = {
        actionType: "update article metadata",
        capability: CAPABILITY,
        resourceRef: mutation.resourceRef,
        beforeState: mutation.beforeState,
        afterState: mutation.proposedState,
        destination: PROVIDER,
        policyVersion: DEFAULT_ACTION_POLICY_VERSION,
      };
      const approval =
        actor === "agent" && mutation.approvalId
          ? await validateAgentApprovalForExecution(
              scope,
              mutation.approvalId,
              proposalMaterial,
            )
          : null;
      approvalValidated = approval?.valid === true;
      const riskLevel = mutation.policyDecision.riskLevel === "low" ? "low" : "high";
      if (!brand) {
        throw protocolError("brand_not_found", "Brand not found.", { status: 404 });
      }
      const authority =
        actor === "owner"
          ? { decision: "allow" as const, reason: "Owner initiated action." }
          : authorizeAction({
              mode: brand.autonomyMode === "REVIEW" ? "REVIEW" : "FULL_AUTO",
              capability: CAPABILITY,
              availableCapabilities: integration.capabilities,
              riskLevel,
              resourceRef: mutation.resourceRef,
              destination: PROVIDER,
              ownerConstraints: controls.ownerConstraints,
              grantedCapabilities: controls.grantedCapabilities,
              canonicalPolicies: controls.canonicalPolicies,
              approvalValidated,
            });
      if (
        authority.decision === "deny" ||
        (authority.decision === "require_approval" && !approvalValidated)
      ) {
        throw protocolError(
          "authority_changed",
          approval?.valid === false ? approval.reason : authority.reason,
          { status: 403 },
        );
      }
    }
    const certified = canLiveApplyCapability({
      certification,
      activation,
      provider: PROVIDER,
      capability: CAPABILITY,
      adapterVersion: adapter.version,
      integrationId: integration.integrationId,
      integrationFingerprint: connection.configFingerprint,
      approvalValidated,
    });
    if (!certified) {
      throw protocolError(
        "certification_inactive",
        "This WordPress capability is not currently certified for live use.",
        { status: 409 },
      );
    }
    if (options.requireWriteAuthority) {
      assertAgentOperationAllowed("site_write", {
        actor,
        controls,
        liveCapability: {
          certified,
          reversible: certification.reversible,
          approvalValidated,
        },
      });
    }
  }

  const siteUrl = connection.endpointOrigin;
  const context: ConnectorContext<
    WordPressArticleMetaConfig,
    WordPressArticleMetaSecrets
  > = {
    config: {
      siteUrl,
      username: integration.config.username,
    },
    secrets: {
      wordpress_application_password: secrets.wordpress_application_password,
    },
    remoteResourceId: mutation.remoteResourceId ?? "",
    idempotencyKey: mutation.idempotencyKey,
    expectedRevision: mutation.beforeRevision ?? undefined,
    fetch: createConnectorFetch(scope, siteUrl),
  };
  return { adapter, context, certification, activation, connection, controls, actor };
}

async function persistFailure(
  scope: BrandScope,
  mutation: MutationRow,
  error: ConnectorProtocolError,
  phase: "write" | "verify",
) {
  const failure = {
    code: error.code,
    message: error.message.slice(0, 500),
    retryable: error.retryable,
    phase,
  };
  if (error.retryable && phase === "write" && mutation.status === "writing") {
    await transitionConnectorMutation(scope, mutation.id, {
      from: ["writing"],
      to: "prepared",
      eventType: "write_retryable_failure",
      detail: failure,
      patch: { failure },
    });
    return;
  }
  if (["writing", "applied"].includes(mutation.status)) {
    await transitionConnectorMutation(scope, mutation.id, {
      from: [mutation.status as "writing" | "applied"],
      to: "verification_failed",
      eventType: `${phase}_failed`,
      detail: failure,
      patch: { verificationStatus: "failed", failure },
    });
  }
}

export async function prepareWordPressArticleMetadataMutation(
  scope: BrandScope,
  articleId: string,
  options: {
    actor?: "agent" | "owner";
    taskId?: string | null;
    approvalId?: string | null;
  } = {},
) {
  const actor = options.actor ?? "owner";
  const [article, publication, brand, controls, integration] = await Promise.all([
    getArticle(scope.brandId, articleId),
    getPublication(scope.brandId, articleId, PROVIDER),
    getBrand(scope.workspaceId, scope.brandId),
    getAgentControlState(scope.brandId),
    getIntegrationBinding(scope, PROVIDER),
  ]);
  if (!article || !brand) {
    throw protocolError("article_not_found", "Article not found.", { status: 404 });
  }
  if (article.status !== "approved") {
    throw protocolError(
      "article_not_approved",
      "Only approved articles can sync live metadata.",
      { status: 409 },
    );
  }
  if (!publication?.externalId || publication.status !== "published") {
    throw protocolError(
      "remote_article_missing",
      "Publish this article to WordPress before syncing its metadata.",
      { status: 409 },
    );
  }
  if (!integration || !isIntegrationOperational(integration)) {
    throw protocolError("owner_disconnected", "WordPress is not connected.", {
      status: 409,
    });
  }
  if (!connectorHasCapability(PROVIDER, CAPABILITY)) {
    throw protocolError(
      "capability_unavailable",
      "WordPress metadata updates are unavailable.",
      { status: 409 },
    );
  }
  const adapter = getConnectorAdapter(PROVIDER, CAPABILITY);
  if (!adapter) {
    throw protocolError("adapter_unavailable", "WordPress adapter is unavailable.", {
      status: 503,
      retryable: true,
    });
  }
  const certification = await getConnectorCertification(
    PROVIDER,
    CAPABILITY,
    adapter.version,
  );
  if (!certification) {
    throw protocolError(
      "certification_missing",
      "WordPress metadata updates have no certification record.",
      { status: 409 },
    );
  }
  const certificationActive = isConnectorCapabilityCertified({
    certification,
    provider: PROVIDER,
    capability: CAPABILITY,
    adapterVersion: adapter.version,
  });
  if (!certificationActive) {
    throw protocolError(
      "certification_inactive",
      "WordPress metadata updates are installed but remain disabled until certification evidence is approved.",
      { status: 409 },
    );
  }
  const activation = await getConnectorActivation(
    scope,
    integration.integrationId,
    certification.id,
  );
  if (!activation) {
    throw protocolError(
      "site_activation_missing",
      "This WordPress site has not passed its site-specific activation checks.",
      { status: 409 },
    );
  }
  const connection = await buildConnectionSnapshot(
    integration,
    activation,
    adapter.version,
  );
  const channelEligible = canLiveApplyCapability({
    certification,
    activation,
    provider: PROVIDER,
    capability: CAPABILITY,
    adapterVersion: adapter.version,
    integrationId: integration.integrationId,
    integrationFingerprint: connection.configFingerprint,
    approvalValidated: true,
  });
  if (!channelEligible) {
    throw protocolError(
      "site_activation_inactive",
      "This exact WordPress connection is not active for live metadata writes.",
      { status: 409 },
    );
  }
  await assertConnectorHealth(scope, PROVIDER, CAPABILITY);

  const secrets = await readIntegrationSecrets(scope.brandId, PROVIDER);
  const context: ConnectorContext<
    WordPressArticleMetaConfig,
    WordPressArticleMetaSecrets
  > = {
    config: {
      siteUrl: connection.endpointOrigin,
      username: integration.config.username,
    },
    secrets: {
      wordpress_application_password: secrets.wordpress_application_password,
    },
    remoteResourceId: publication.externalId,
    idempotencyKey: `connector-read:${article.id}`,
    fetch: createConnectorFetch(scope, connection.endpointOrigin),
  };

  let before: WordPressArticleMetaState;
  try {
    before = adapter.normalize(await adapter.read(context));
  } catch (error) {
    throw normalizeConnectorError(error);
  }
  assertPublishedRemoteIdentity(before, publication.externalId);
  const desired: WordPressArticleMetaDesiredState = {
    slug: article.slug,
    excerpt: article.metaDescription ?? "",
  };
  const diff = adapter.constructDiff(before, desired);
  const riskLevel = diff.some((entry) => entry.field === "slug")
    ? ("high" as const)
    : ("low" as const);
  const proposedState: WordPressArticleMetaState = { ...before };
  for (const entry of diff) proposedState[entry.field] = entry.after;
  const beforeState: PersistedWordPressState = {
    remote: before,
    connection,
  };
  const proposedEnvelope: PersistedWordPressState = {
    remote: proposedState,
    connection,
  };
  const resourceRef = `${PROVIDER}:${connection.endpointOrigin}:post:${publication.externalId}`;
  const proposalMaterial: ActionProposalMaterial = {
    actionType: "update article metadata",
    capability: CAPABILITY,
    resourceRef,
    beforeState,
    afterState: proposedEnvelope,
    destination: PROVIDER,
    policyVersion: DEFAULT_ACTION_POLICY_VERSION,
  };
  const proposalHash = await computeActionProposalHash(proposalMaterial);
  let idempotencyKey = [
    "connector:wp:meta",
    article.id,
    before.revision.slice(0, 16),
    proposalHash.slice(0, 32),
  ].join(":");
  const existing = await getConnectorMutationByIdempotency(scope, idempotencyKey);
  if (existing) {
    if (!["blocked", "cancelled", "reverted"].includes(existing.status)) {
      return existing;
    }
    idempotencyKey = `${idempotencyKey}:retry:${crypto.randomUUID().slice(0, 8)}`;
  }
  const approval =
    actor === "agent" && options.approvalId
      ? await validateAgentApprovalForExecution(
          scope,
          options.approvalId,
          proposalMaterial,
        )
      : null;
  const authority =
    actor === "owner"
      ? {
          decision: "allow" as const,
          reason: "The owner initiated this exact, reversible metadata change.",
        }
      : authorizeAction({
          mode: brand.autonomyMode === "REVIEW" ? "REVIEW" : "FULL_AUTO",
          capability: CAPABILITY,
          availableCapabilities: integration.capabilities,
          riskLevel,
          resourceRef,
          destination: PROVIDER,
          ownerConstraints: controls.ownerConstraints,
          grantedCapabilities: controls.grantedCapabilities,
          canonicalPolicies: controls.canonicalPolicies,
          approvalValidated: approval?.valid === true,
        });
  if (
    authority.decision === "deny" ||
    (authority.decision === "require_approval" && approval?.valid !== true)
  ) {
    throw protocolError(
      "authority_denied",
      approval?.valid === false ? approval.reason : authority.reason,
      { status: 403 },
    );
  }

  const liveApplyAllowed = canLiveApplyCapability({
    certification,
    activation,
    provider: PROVIDER,
    capability: CAPABILITY,
    adapterVersion: adapter.version,
    integrationId: integration.integrationId,
    integrationFingerprint: connection.configFingerprint,
    approvalValidated: approval?.valid === true,
  });
  if (!liveApplyAllowed) {
    throw protocolError(
      "irreversible_approval_required",
      "This connector capability requires a fresh proposal-bound approval.",
      { status: 403 },
    );
  }
  if (actor === "agent") {
    assertAgentOperationAllowed("site_write", {
      actor,
      controls,
      liveCapability: {
        certified: liveApplyAllowed,
        reversible: certification.reversible,
        approvalValidated: approval?.valid === true,
      },
    });
  }

  let autonomyReservation: AutonomyReservation | null = null;
  if (actor === "agent") {
    const autonomy = await authorizeAgentAutonomyAction(scope, {
      taskId: options.taskId,
      capability: CAPABILITY,
      effect: "remote_write",
      risk: riskLevel,
      resourceRef,
      destination: PROVIDER,
      proposalHash,
      approvalValidated: approval?.valid === true,
      certificationValidated: liveApplyAllowed,
      certificationId: certification.id,
      reversible: certification.reversible,
      estimatedCredits: 0,
      estimatedMoneyMicros: 0,
      resourceCount: 1,
      baselineDecision: {
        workflow: "scripted_wordpress_metadata_sync",
        decision: authority.decision,
        reason: authority.reason,
      },
    });
    if (autonomy.policy.decision !== "allow" || !autonomy.rollout) {
      const code =
        autonomy.policy.decision === "shadow"
          ? "autonomy_shadow_only"
          : autonomy.policy.decision === "approval_required"
            ? "autonomy_approval_required"
            : autonomy.policy.decision === "pause"
              ? "autonomy_paused"
              : "autonomy_denied";
      throw protocolError(code, autonomy.policy.reason, {
        status: autonomy.policy.decision === "approval_required" ? 403 : 409,
      });
    }
    autonomyReservation = {
      rolloutId: autonomy.rollout.id,
      decisionId: autonomy.decision.id,
      rolloutRevision: autonomy.rollout.revision,
      riskBudget: autonomy.rollout.riskBudget,
      stopConditions: autonomy.rollout.stopConditions,
    };
  }

  const beforeFingerprint = await fingerprintConnectorState(beforeState);
  const expectedAfterFingerprint = await fingerprintConnectorState(
    intendedProjection(diff, proposedState),
  );
  const reserved = await reserveConnectorMutation(scope, {
    taskId: options.taskId,
    approvalId: approval?.valid === true ? options.approvalId : null,
    provider: PROVIDER,
    capability: CAPABILITY,
    adapterVersion: adapter.version,
    resourceRef,
    remoteResourceId: publication.externalId,
    idempotencyKey,
    proposalHash,
    beforeState,
    proposedState: proposedEnvelope,
    intendedDiff: diff,
    beforeFingerprint,
    expectedAfterFingerprint,
    policyDecision: {
      actor,
      decision: authority.decision,
      reason: authority.reason,
      riskLevel,
      policyVersion: DEFAULT_ACTION_POLICY_VERSION,
      autonomyDecisionId: autonomyReservation?.decisionId ?? null,
      autonomyRolloutId: autonomyReservation?.rolloutId ?? null,
    },
    certificationId: certification.id,
    beforeRevision: before.revision,
    autonomy: autonomyReservation
      ? {
          rolloutId: autonomyReservation.rolloutId,
          decisionId: autonomyReservation.decisionId,
          rolloutRevision: autonomyReservation.rolloutRevision,
          maxActionsPerUtcDay:
            autonomyReservation.riskBudget.maxActionsPerUtcDay,
          pauseOnAnyCriticalIncident:
            autonomyReservation.stopConditions.pauseOnAnyCriticalIncident,
          stopSloKeys: autonomyReservation.stopConditions.sloKeys,
        }
      : null,
  });
  if (reserved.guardrail) throw reserved.guardrail;
  return reserved.mutation;
}

export async function applyConnectorMutation(
  scope: BrandScope,
  mutationId: string,
): Promise<StepResult> {
  let mutation = await getConnectorMutation(scope, mutationId);
  if (!mutation) throw protocolError("mutation_not_found", "Mutation not found.", { status: 404 });
  if (["applied", "verified"].includes(mutation.status)) {
    return { mutationId, status: mutation.status, ok: true };
  }
  if (mutation.status === "no_op") return { mutationId, status: "no_op", ok: true };
  if (!["prepared", "writing"].includes(mutation.status)) {
    throw protocolError(
      "mutation_not_applicable",
      `Mutation cannot be applied from ${mutation.status}.`,
      { status: 409 },
    );
  }

  let runtime: Awaited<ReturnType<typeof loadRuntime>>;
  try {
    await assertConnectorHealth(scope, mutation.provider, mutation.capability);
    runtime = await loadRuntime(scope, mutation, { requireWriteAuthority: true });
  } catch (error) {
    const normalized = normalizeConnectorError(error);
    if (!normalized.retryable && mutation.status === "prepared") {
      await transitionConnectorMutation(scope, mutationId, {
        from: ["prepared"],
        to: "cancelled",
        eventType: "write_cancelled_before_remote_effect",
        detail: { code: normalized.code, reason: normalized.message },
        patch: {
          failure: {
            code: normalized.code,
            message: normalized.message,
            retryable: false,
          },
          settledAt: new Date(),
        },
      });
    }
    throw normalized;
  }
  const claim = await claimConnectorMutationForWrite(scope, mutationId);
  mutation = claim.mutation;
  if (!claim.claimed) {
    if (["applied", "verified"].includes(mutation.status)) {
      return { mutationId, status: mutation.status, ok: true };
    }
    if (["prepared", "writing"].includes(mutation.status)) {
      throw protocolError(
        "mutation_in_progress",
        "This connector mutation is already being applied.",
        { retryable: true, status: 409, retryAfterMs: 1_000 },
      );
    }
    throw protocolError(
      "mutation_not_applicable",
      `Mutation cannot be applied from ${mutation.status}.`,
      { status: 409 },
    );
  }
  const diff = parseMutationDiff(mutation);

  try {
    const current = runtime.adapter.normalize(await runtime.adapter.read(runtime.context));
    assertPublishedRemoteIdentity(current, mutation.remoteResourceId ?? "");
    const alreadyAfter = runtime.adapter.verify(diff, current).ok;
    if (!alreadyAfter && !runtime.adapter.verify(reverseDiff(diff), current).ok) {
      const error = protocolError(
        "unexpected_remote_diff",
        "WordPress changed after the proposal was captured; the write was stopped.",
        { status: 409 },
      );
      await persistFailure(scope, mutation, error, "write");
      await openConnectorCircuit(
        scope,
        mutation.provider,
        mutation.capability,
        error.message,
        "unexpected_diff",
      );
      throw error;
    }

    let written: WordPressArticleMetaState;
    try {
      written = await runtime.adapter.write(runtime.context, diff);
    } catch (error) {
      const normalized = normalizeConnectorError(error);
      if (alreadyAfter && normalized.code === "revision_conflict") {
        const fresh = runtime.adapter.normalize(
          await runtime.adapter.read(runtime.context),
        );
        assertPublishedRemoteIdentity(fresh, mutation.remoteResourceId ?? "");
        if (runtime.adapter.verify(diff, fresh).ok) {
          const noOp = await transitionConnectorMutation(scope, mutationId, {
            from: ["writing"],
            to: "no_op",
            eventType: "remote_state_satisfied_externally",
            detail: { writeAttempted: false, receiptFound: false },
            patch: {
              verificationStatus: "verified",
              result: { remoteStateAlreadySatisfied: true },
              verifiedRevision: fresh.revision,
              verifiedAt: new Date(),
              settledAt: new Date(),
              failure: null,
            },
          });
          return { mutationId, status: noOp.status, ok: true };
        }
      }
      throw normalized;
    }
    assertPublishedRemoteIdentity(written, mutation.remoteResourceId ?? "");
    const applied = await transitionConnectorMutation(scope, mutationId, {
      from: ["writing"],
      to: "applied",
      eventType: "write_applied",
      detail: { providerAccepted: true },
      patch: {
        result: { providerAccepted: true },
        rollbackHandle: { mutationId, provider: mutation.provider },
        appliedRevision: written.revision,
        appliedAt: new Date(),
        failure: null,
      },
    });
    return { mutationId, status: applied.status, ok: true };
  } catch (error) {
    const normalized = normalizeConnectorError(error);
    const current = (await getConnectorMutation(scope, mutationId)) ?? mutation;
    await persistFailure(scope, current, normalized, "write");
    if (!normalized.retryable) {
      await openConnectorCircuit(
        scope,
        mutation.provider,
        mutation.capability,
        normalized.message,
        normalized.code,
      );
    }
    throw normalized;
  }
}

export async function verifyConnectorMutation(
  scope: BrandScope,
  mutationId: string,
): Promise<StepResult> {
  let mutation = await getConnectorMutation(scope, mutationId);
  if (!mutation) throw protocolError("mutation_not_found", "Mutation not found.", { status: 404 });
  if (mutation.status === "no_op") {
    return { mutationId, status: "no_op", ok: true };
  }
  if (mutation.status === "verified") {
    return { mutationId, status: "verified", ok: true };
  }
  if (mutation.status !== "applied") {
    throw protocolError(
      "mutation_not_verifiable",
      `Mutation cannot be verified from ${mutation.status}.`,
      { status: 409 },
    );
  }
  const runtime = await loadRuntime(scope, mutation);
  const diff = parseMutationDiff(mutation);
  try {
    const remote = runtime.adapter.normalize(await runtime.adapter.read(runtime.context));
    assertPublishedRemoteIdentity(remote, mutation.remoteResourceId ?? "");
    const verification = runtime.adapter.verify(diff, remote);
    const fingerprint = await fingerprintConnectorState(intendedProjection(diff, remote));
    if (
      !verification.ok ||
      fingerprint !== mutation.expectedAfterFingerprint ||
      !mutation.appliedRevision ||
      remote.revision !== mutation.appliedRevision
    ) {
      const error = protocolError(
        "read_back_verification_failed",
        "WordPress read-back did not match the exact intended metadata change.",
        { status: 422 },
      );
      await persistFailure(scope, mutation, error, "verify");
      await openConnectorCircuit(
        scope,
        mutation.provider,
        mutation.capability,
        error.message,
        "verification_failure",
      );
      throw error;
    }

    mutation = await verifyConnectorMutationWithAction(scope, mutationId, {
      taskId: mutation.taskId,
      approvalId: mutation.approvalId,
      actionType: "update article metadata",
      resourceRef: mutation.resourceRef,
      capability: mutation.capability,
      idempotencyKey: mutation.idempotencyKey,
      beforeState: mutation.beforeState,
      appliedChange: {
        proposedState: mutation.proposedState,
        intendedDiff: mutation.intendedDiff,
        proposalHash: mutation.proposalHash,
        adapterVersion: mutation.adapterVersion,
        protocolVersion: mutation.protocolVersion,
      },
      remoteRef: remote.link,
      rollbackHandle: {
        mutationId,
        provider: mutation.provider,
        remoteResourceId: mutation.remoteResourceId,
      },
      verificationResult: {
        readBack: true,
        exactDelta: true,
        revision: remote.revision,
      },
      result: { remoteState: intendedProjection(diff, remote) },
      verifiedRevision: remote.revision,
    });
    return { mutationId, status: mutation.status, ok: true };
  } catch (error) {
    const normalized = normalizeConnectorError(error);
    const current = (await getConnectorMutation(scope, mutationId)) ?? mutation;
    if (current.status === "applied") {
      await persistFailure(scope, current, normalized, "verify");
    }
    throw normalized;
  }
}

export async function monitorConnectorMutation(
  scope: BrandScope,
  mutationId: string,
): Promise<StepResult> {
  const mutation = await getConnectorMutation(scope, mutationId);
  if (!mutation) throw protocolError("mutation_not_found", "Mutation not found.", { status: 404 });
  if (mutation.status === "no_op") {
    return { mutationId, status: "no_op", ok: true };
  }
  if (mutation.status !== "verified") {
    throw protocolError(
      "mutation_not_monitorable",
      `Mutation cannot be monitored from ${mutation.status}.`,
      { status: 409 },
    );
  }
  try {
    await assertConnectorHealth(scope, mutation.provider, mutation.capability);
    const runtime = await loadRuntime(scope, mutation);
    const diff = parseMutationDiff(mutation);
    const remote = runtime.adapter.normalize(await runtime.adapter.read(runtime.context));
    assertPublishedRemoteIdentity(remote, mutation.remoteResourceId ?? "");
    if (
      !runtime.adapter.verify(diff, remote).ok ||
      !mutation.verifiedRevision ||
      remote.revision !== mutation.verifiedRevision
    ) {
      throw protocolError(
        "post_write_drift",
        "WordPress metadata drifted during the post-write health check.",
        { status: 422 },
      );
    }
    await transitionConnectorMutation(scope, mutationId, {
      from: ["verified"],
      to: "verified",
      eventType: "post_write_health_verified",
      detail: { revision: remote.revision },
      patch: { settledAt: new Date() },
    });
    return { mutationId, status: "verified", ok: true };
  } catch (error) {
    const normalized = normalizeConnectorError(error);
    await openConnectorCircuit(
      scope,
      mutation.provider,
      mutation.capability,
      normalized.message,
      normalized.code,
    );
    throw normalized;
  }
}

async function finishManualRecovery(
  scope: BrandScope,
  mutation: MutationRow,
  reason: string,
  detail: Record<string, unknown> = {},
) {
  const eventDetail = { mutationId: mutation.id, reason, ...detail };
  const updated = await finalizeConnectorRollback(scope, mutation.id, {
    to: "manual_recovery_required",
    eventType: "manual_recovery_required",
    detail: eventDetail,
    patch: {
      rollbackStatus: "manual_recovery_required",
      failure: { code: "manual_recovery_required", message: reason, retryable: false },
      settledAt: new Date(),
    },
    summary: `Manual recovery is required for ${mutation.resourceRef}.`,
  });
  await openConnectorCircuit(
    scope,
    updated.provider,
    updated.capability,
    reason,
    "manual_recovery_required",
  );
  return updated;
}

async function finishReverted(
  scope: BrandScope,
  mutation: MutationRow,
  revision: string,
  detail: Record<string, unknown>,
) {
  const eventDetail = { mutationId: mutation.id, revision, ...detail };
  return finalizeConnectorRollback(scope, mutation.id, {
    to: "reverted",
    eventType: "rollback_verified",
    detail: eventDetail,
    patch: {
      rollbackStatus: "reverted",
      revertedRevision: revision,
      revertedAt: new Date(),
      settledAt: new Date(),
      failure: null,
    },
    summary: `Verified remote rollback for ${mutation.resourceRef}.`,
  });
}

export async function rollbackConnectorMutation(
  scope: BrandScope,
  mutationId: string,
): Promise<StepResult> {
  let mutation = await getConnectorMutation(scope, mutationId);
  if (!mutation) throw protocolError("mutation_not_found", "Mutation not found.", { status: 404 });
  if (mutation.status === "reverted") {
    return { mutationId, status: "reverted", ok: true };
  }
  if (["no_op", "blocked", "cancelled"].includes(mutation.status)) {
    return { mutationId, status: mutation.status, ok: true };
  }
  if (mutation.status !== "rollback_pending") {
    const eligible = [
      "prepared",
      "writing",
      "applied",
      "verified",
      "verification_failed",
      "rollback_failed",
    ] as const;
    if (!(eligible as readonly string[]).includes(mutation.status)) {
      throw protocolError(
        "mutation_not_revertible",
        `Mutation cannot be rolled back from ${mutation.status}.`,
        { status: 409 },
      );
    }
    mutation = await transitionConnectorMutation(scope, mutationId, {
      from: [mutation.status as (typeof eligible)[number]],
      to: "rollback_pending",
      eventType: "rollback_started",
      patch: { rollbackStatus: "pending", rollbackStartedAt: new Date() },
    });
  }

  try {
    const runtime = await loadRuntime(scope, mutation, { forRollback: true });
    const diff = parseMutationDiff(mutation);
    const beforeState = parseMutationBeforeState(mutation).remote;
    const current = runtime.adapter.normalize(await runtime.adapter.read(runtime.context));
    assertPublishedRemoteIdentity(current, mutation.remoteResourceId ?? "");
    if (
      runtime.adapter.verify(reverseDiff(diff), current).ok &&
      current.revision === beforeState.revision
    ) {
      const reverted = await finishReverted(scope, mutation, current.revision, {
        remoteWriteRequired: false,
        beforeStateAlreadyPresent: true,
      });
      return { mutationId, status: reverted.status, ok: true };
    }
    if (!runtime.adapter.verify(diff, current).ok) {
      await finishManualRecovery(
        scope,
        mutation,
        "The remote metadata changed after this action; automatic rollback refused to overwrite it.",
        { remoteWriteAttempted: false },
      );
      throw protocolError(
        "manual_recovery_required",
        "Remote drift prevented a safe automatic rollback.",
        { status: 422 },
      );
    }

    const rollback = await runtime.adapter.rollback(runtime.context, diff);
    if (rollback.status === "manual_recovery_required") {
      await finishManualRecovery(scope, mutation, rollback.reason, {
        remoteWriteAttempted: rollback.wrote,
        unexpected: rollback.unexpected,
      });
      throw protocolError(
        "manual_recovery_required",
        "WordPress rollback could not be verified automatically.",
        { status: 422 },
      );
    }
    assertPublishedRemoteIdentity(rollback.state, mutation.remoteResourceId ?? "");
    if (
      !runtime.adapter.verify(reverseDiff(diff), rollback.state).ok ||
      rollback.state.revision !== beforeState.revision
    ) {
      await finishManualRecovery(
        scope,
        mutation,
        "WordPress did not restore the exact captured before-state.",
        { remoteWriteAttempted: true },
      );
      throw protocolError(
        "manual_recovery_required",
        "WordPress rollback could not be verified automatically.",
        { status: 422 },
      );
    }
    const reverted = await finishReverted(
      scope,
      mutation,
      rollback.state.revision,
      { remoteWriteRequired: true, exactReadBack: true },
    );
    return { mutationId, status: reverted.status, ok: true };
  } catch (error) {
    const normalized = normalizeConnectorError(error);
    const current = (await getConnectorMutation(scope, mutationId)) ?? mutation;
    if (current.status === "manual_recovery_required") throw normalized;
    if (current.status === "rollback_pending") {
      if (normalized.retryable) {
        const failed = await finalizeConnectorRollback(scope, mutationId, {
          to: "rollback_failed",
          eventType: "rollback_failed",
          detail: { mutationId, code: normalized.code, retryable: true },
          patch: {
            rollbackStatus: "failed",
            failure: {
              code: normalized.code,
              message: normalized.message,
              retryable: true,
            },
          },
          summary: `Remote rollback failed for ${current.resourceRef}.`,
        });
        await openConnectorCircuit(
          scope,
          failed.provider,
          failed.capability,
          normalized.message,
          "rollback_failure",
        );
      } else {
        await finishManualRecovery(scope, current, normalized.message);
      }
    }
    throw normalized;
  }
}

export async function runConnectorMutationInline(
  scope: BrandScope,
  mutationId: string,
): Promise<StepResult> {
  try {
    await applyConnectorMutation(scope, mutationId);
    await verifyConnectorMutation(scope, mutationId);
    return await monitorConnectorMutation(scope, mutationId);
  } catch (error) {
    if (
      error instanceof ConnectorProtocolError &&
      error.code === "mutation_in_progress"
    ) {
      throw error;
    }
    try {
      await rollbackConnectorMutation(scope, mutationId);
    } catch {
      // The rollback path persisted either retryable failure or manual recovery.
    }
    throw error;
  }
}
