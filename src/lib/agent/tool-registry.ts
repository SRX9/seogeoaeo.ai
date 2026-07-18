import { z } from "zod";
import type { PolicyCapability } from "@/lib/agent/policy-model";

export type ToolCaller = "agent_loop" | "workflow" | "owner_api" | "ask_claudia";
export type ToolEffect = "read" | "local_write" | "remote_write";
export type ToolRiskClass = "low" | "medium" | "high" | "critical";
export type ToolTenantScope = "workspace" | "brand";
export type ToolDataSensitivity =
  | "public"
  | "workspace_confidential"
  | "public_by_design";

export type ToolCapability =
  | { mode: "static"; value: PolicyCapability }
  | {
      mode: "resource_state";
      values: readonly [PolicyCapability, ...PolicyCapability[]];
    };

export type AgentToolDefinition<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput extends z.ZodTypeAny = z.ZodTypeAny,
> = {
  name: string;
  version: string;
  inputSchema: TInput;
  outputSchema: TOutput;
  effect: ToolEffect;
  riskClass: ToolRiskClass;
  capability: ToolCapability;
  tenantScope: ToolTenantScope;
  estimatedCost: {
    credits: number;
    latencyMs: { typical: number; upper: number };
  };
  idempotency: {
    required: boolean;
    scope: "workspace" | "brand" | "resource";
    keyParts: readonly string[];
  };
  verification: {
    mode: "local_readback" | "remote_readback" | "provider_ack_only" | "none";
    targetGrade: boolean;
    evidence: string;
  };
  rollback: {
    mode: "not_applicable" | "supported" | "conditional" | "none";
    tool?: string;
    reason: string;
  };
  rateLimits: {
    scope: "workspace" | "brand" | "resource";
    maxConcurrency: number;
    policy: string;
  };
  dataSensitivity: ToolDataSensitivity;
  allowedCallers: readonly ToolCaller[];
  plannerEligible: boolean;
};

export function defineAgentTool<
  TInput extends z.ZodTypeAny,
  TOutput extends z.ZodTypeAny,
>(definition: AgentToolDefinition<TInput, TOutput>): AgentToolDefinition<TInput, TOutput> {
  return definition;
}

export const researchRefreshInputSchema = z
  .object({ budget: z.number().int().min(0).max(100) })
  .strict();

export const researchRefreshOutputSchema = z
  .object({
    researchTopics: z.number().int().nonnegative(),
    topicIds: z.array(z.string().uuid()).max(100),
  })
  .strict();

export const articleDraftInputSchema = z
  .object({ topicId: z.string().uuid() })
  .strict();

export const articleDraftOutputSchema = z
  .object({
    // Creation provenance cannot be reconstructed after a lost response or a
    // concurrent unique-insert winner. "available" truthfully guarantees the
    // postcondition the tool can verify: a scoped local draft now exists.
    status: z.literal("available"),
    articleId: z.string().uuid(),
  })
  .strict();

/**
 * Durable callback envelope. The registry output above remains the successful
 * business result; execution-only terminal states are explicit and validated
 * separately so a replay can never return an arbitrary persisted object.
 */
export const articleDraftExecutionOutputSchema = z.discriminatedUnion("status", [
  articleDraftOutputSchema,
  z.object({ status: z.literal("insufficient_credits") }).strict(),
  z
    .object({
      status: z.literal("blocked"),
      reason: z.string().trim().min(1).max(2_000),
    })
    .strict(),
]);

const httpUrlSchema = z
  .string()
  .url()
  .max(2_000)
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "siteUrl must use http or https");

export const visibilityAuditInputSchema = z
  .object({
    auditId: z.string().uuid(),
    siteUrl: httpUrlSchema,
  })
  .strict();

export const visibilityAuditOutputSchema = z
  .object({
    ok: z.boolean(),
    auditId: z.string().uuid(),
  })
  .strict();

export const articlePublishInputSchema = z
  .object({
    articleId: z.string().uuid(),
    provider: z.enum([
      "markdown_export",
      "webhook",
      "devto",
      "hashnode",
      "wordpress",
      "ghost",
    ]),
  })
  .strict();

export const articlePublishOutputSchema = z
  .object({
    provider: z.enum([
      "markdown_export",
      "webhook",
      "devto",
      "hashnode",
      "wordpress",
      "ghost",
    ]),
    status: z.enum(["published", "skipped", "failed"]),
    remoteRef: z.string().max(2_000).nullable(),
    error: z.string().max(2_000).nullable(),
  })
  .strict();

export const connectorArticleMetadataInputSchema = z
  .object({ mutationId: z.string().uuid() })
  .strict();

export const connectorArticleMetadataOutputSchema = z
  .object({
    mutationId: z.string().uuid(),
    status: z.enum([
      "applied",
      "verified",
      "no_op",
      "reverted",
      "cancelled",
      "blocked",
      "manual_recovery_required",
    ]),
    ok: z.boolean(),
  })
  .strict();

export const AGENT_TOOLS = [
  defineAgentTool({
    name: "research.refresh",
    version: "1.0.0",
    inputSchema: researchRefreshInputSchema,
    outputSchema: researchRefreshOutputSchema,
    effect: "local_write",
    riskClass: "low",
    capability: { mode: "static", value: "observe" },
    tenantScope: "brand",
    estimatedCost: {
      credits: 20,
      latencyMs: { typical: 30_000, upper: 120_000 },
    },
    idempotency: {
      required: true,
      scope: "brand",
      keyParts: ["brandId", "toolName", "toolVersion", "inputHash"],
    },
    verification: {
      mode: "local_readback",
      targetGrade: true,
      evidence: "Completed research run and brand-owned topic rows.",
    },
    rollback: {
      mode: "not_applicable",
      reason: "The operation creates local research suggestions and does not mutate a remote system.",
    },
    rateLimits: {
      scope: "brand",
      maxConcurrency: 1,
      policy: "workspace plan and daily research budget",
    },
    dataSensitivity: "workspace_confidential",
    allowedCallers: ["agent_loop", "workflow", "owner_api"],
    plannerEligible: true,
  }),
  defineAgentTool({
    name: "article.draft",
    version: "1.0.0",
    inputSchema: articleDraftInputSchema,
    outputSchema: articleDraftOutputSchema,
    effect: "local_write",
    riskClass: "low",
    capability: { mode: "static", value: "prepare" },
    tenantScope: "brand",
    estimatedCost: {
      credits: 100,
      latencyMs: { typical: 90_000, upper: 300_000 },
    },
    idempotency: {
      required: true,
      scope: "resource",
      keyParts: ["brandId", "topicId", "toolName", "toolVersion"],
    },
    verification: {
      mode: "local_readback",
      targetGrade: true,
      evidence: "Brand-owned article row and exact persisted grounding-gate result.",
    },
    rollback: {
      mode: "not_applicable",
      reason: "The operation prepares a local draft and does not mutate a remote destination.",
    },
    rateLimits: {
      scope: "brand",
      maxConcurrency: 1,
      policy: "workspace plan daily article cap",
    },
    dataSensitivity: "workspace_confidential",
    allowedCallers: ["agent_loop", "workflow", "owner_api"],
    plannerEligible: true,
  }),
  defineAgentTool({
    name: "visibility.audit.execute",
    version: "1.0.0",
    inputSchema: visibilityAuditInputSchema,
    outputSchema: visibilityAuditOutputSchema,
    effect: "local_write",
    riskClass: "low",
    capability: { mode: "static", value: "observe" },
    // Legacy and scheduled audits can legitimately exist without a brand row.
    // The execution boundary is therefore workspace-scoped, while auditId is
    // still the stable resource identity.
    tenantScope: "workspace",
    estimatedCost: {
      credits: 50,
      latencyMs: { typical: 60_000, upper: 300_000 },
    },
    idempotency: {
      required: true,
      scope: "resource",
      keyParts: ["workspaceId", "auditId", "toolName", "toolVersion"],
    },
    verification: {
      mode: "local_readback",
      targetGrade: true,
      evidence: "Workspace-owned audit row reaches a terminal state with scoped findings.",
    },
    rollback: {
      mode: "not_applicable",
      reason: "The operation observes public site state and stores a local audit result.",
    },
    rateLimits: {
      scope: "resource",
      maxConcurrency: 1,
      policy: "workspace visibility-audit entitlement",
    },
    dataSensitivity: "public",
    allowedCallers: ["agent_loop", "workflow", "owner_api"],
    plannerEligible: true,
  }),
  defineAgentTool({
    name: "article.publish",
    version: "1.0.0",
    inputSchema: articlePublishInputSchema,
    outputSchema: articlePublishOutputSchema,
    effect: "remote_write",
    riskClass: "medium",
    capability: {
      mode: "resource_state",
      values: ["article.create", "article.update"],
    },
    tenantScope: "brand",
    estimatedCost: {
      credits: 0,
      latencyMs: { typical: 5_000, upper: 30_000 },
    },
    idempotency: {
      required: true,
      scope: "resource",
      keyParts: [
        "brandId",
        "provider",
        "articleId",
        "contentFingerprint",
        "toolVersion",
      ],
    },
    verification: {
      mode: "provider_ack_only",
      targetGrade: false,
      evidence: "Current adapters return provider acceptance without remote state read-back.",
    },
    rollback: {
      mode: "none",
      reason: "No connector has a certified compensation operation yet.",
    },
    rateLimits: {
      scope: "resource",
      maxConcurrency: 1,
      policy: "destination adapter rate limit",
    },
    dataSensitivity: "public_by_design",
    allowedCallers: ["owner_api"],
    plannerEligible: false,
  }),
  defineAgentTool({
    name: "connector.wordpress.article_metadata",
    version: "1.0.0",
    inputSchema: connectorArticleMetadataInputSchema,
    outputSchema: connectorArticleMetadataOutputSchema,
    effect: "remote_write",
    riskClass: "high",
    capability: { mode: "static", value: "article.meta.update" },
    tenantScope: "brand",
    estimatedCost: {
      credits: 0,
      latencyMs: { typical: 5_000, upper: 60_000 },
    },
    idempotency: {
      required: true,
      scope: "resource",
      keyParts: ["brandId", "mutationId", "toolName", "toolVersion"],
    },
    verification: {
      mode: "remote_readback",
      targetGrade: true,
      evidence: "Authenticated WordPress read-back of the exact changed slug and excerpt.",
    },
    rollback: {
      mode: "conditional",
      tool: "connector.wordpress.article_metadata",
      reason: "Restores the captured before-state only while the remote fields still match this action's verified after-state.",
    },
    rateLimits: {
      scope: "resource",
      maxConcurrency: 1,
      policy: "one-resource canary, tenant write budgets, cooldown, and connector circuit breaker",
    },
    dataSensitivity: "public_by_design",
    allowedCallers: ["workflow", "owner_api"],
    plannerEligible: false,
  }),
] as const;

export type AgentTool = (typeof AGENT_TOOLS)[number];

export function getAgentTool(name: string, version?: string): AgentTool | undefined {
  return AGENT_TOOLS.find(
    (tool) => tool.name === name && (version === undefined || tool.version === version),
  );
}

export class AgentToolRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentToolRegistryError";
  }
}

/** Resolve a versioned tool from trusted code and enforce its caller boundary. */
export function requireAgentTool(
  name: string,
  version: string,
  caller: ToolCaller,
): AgentTool {
  const tool = getAgentTool(name, version);
  if (!tool) {
    throw new AgentToolRegistryError(`Unknown agent tool ${name}@${version}`);
  }
  if (!(tool.allowedCallers as readonly ToolCaller[]).includes(caller)) {
    throw new AgentToolRegistryError(
      `${caller} cannot call agent tool ${name}@${version}`,
    );
  }
  if (caller === "agent_loop" && !tool.plannerEligible) {
    throw new AgentToolRegistryError(
      `${name}@${version} is quarantined from agent planning`,
    );
  }
  return tool;
}
