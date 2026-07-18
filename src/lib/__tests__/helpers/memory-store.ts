/**
 * In-memory "temp" data store for end-to-end workflow tests.
 *
 * This is a throwaway local database (plain Maps, reset between tests) plus mock
 * implementations of every data/IO seam the article pipeline touches. Wiring
 * these mocks via `vi.mock` lets the REAL orchestration code: article
 * generation, publishing, and the weekly pipeline: run end-to-end with no
 * Postgres and no network, so we can drive it through every scenario.
 *
 * The store is a module singleton shared between the `vi.mock` factories and the
 * test bodies. `resetStore()` mutates it in place (never reassigns it), so all
 * holders keep seeing the same live object across tests.
 */
import type { ModelTier } from "@/lib/llm/client";
import {
  emptySecretStates,
  getIntegrationProvider,
  integrationRequirementsMet,
  type IntegrationSecretKey,
  IntegrationConfig,
  IntegrationProviderId,
  IntegrationView,
} from "@/lib/integrations/providers";
import {
  connectorCapabilities,
  type ConnectorCapability,
} from "@/lib/integrations/capabilities";
import { slugify } from "@/lib/articles/format";

export type WorkspaceRow = { id: string; name: string; autonomyMode: string };

export type TopicRow = {
  id: string;
  workspaceId: string;
  title: string;
  angle: string | null;
  keywords: string | null;
  status: string;
  source: string;
  score: number | null;
  evidenceJson: string | null;
  intentTier: string | null;
  thesis: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ArticleRow = {
  id: string;
  workspaceId: string;
  topicId: string | null;
  title: string;
  slug: string;
  metaDescription: string | null;
  tags: string | null;
  bodyMarkdown: string;
  status: string;
  version: number;
  shape: string | null;
  gateResultsJson: string | null;
  memoryEvidenceRefs: string[];
  memoryEvidenceVersion: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type JobRow = {
  id: string;
  workspaceId: string;
  kind: string;
  status: string;
  message: string | null;
  metadataJson: string | null;
};

export type BrandRow = {
  workspaceId: string;
  productDescription: string | null;
  audience: string | null;
  tone: string | null;
  website: string | null;
  seedKeywords: string | null;
};

export type PublicationRow = {
  id: string;
  workspaceId: string;
  articleId: string;
  provider: string;
  status: string;
  externalUrl: string | null;
  errorMessage: string | null;
  attemptCount: number;
  publishedAt: Date | null;
  publishedHash: string | null;
};

export type DailyRunRow = {
  workspaceId: string;
  brandId: string;
  runDate: string;
  articlesWritten: number;
  topicsResearched: number;
  status: string;
  note: string | null;
};

type Store = {
  workspaces: Map<string, WorkspaceRow>;
  topics: Map<string, TopicRow>;
  articles: Map<string, ArticleRow>;
  jobs: Map<string, JobRow>;
  brand: Map<string, BrandRow>;
  integrations: Map<string, IntegrationView[]>;
  secrets: Map<string, string>;
  usage: Map<string, number>;
  counters: Map<string, { generated: number; published: number }>;
  publications: Map<string, PublicationRow>;
  dailyRuns: Map<string, DailyRunRow>;
  /** (workspace:reason:refId) tuples already charged: models the ledger unique index. */
  creditRefs: Set<string>;
  seq: number;
};

export const store: Store = {
  workspaces: new Map(),
  topics: new Map(),
  articles: new Map(),
  jobs: new Map(),
  brand: new Map(),
  integrations: new Map(),
  secrets: new Map(),
  usage: new Map(),
  counters: new Map(),
  publications: new Map(),
  dailyRuns: new Map(),
  creditRefs: new Set(),
  seq: 0,
};

function nextId(prefix: string) {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

// ---- LLM controller: deterministic, scriptable responses + failure hooks ----

type ArticleMetadataShape = {
  title: string;
  slug: string;
  metaDescription: string;
  tags: string[];
};

type LlmState = {
  /** One entry per `generateText` call, in order: summary, outline, draft, seo edit. */
  textResponses: string[];
  /** Returned by `generateJson` (the metadata step). */
  metadata: ArticleMetadataShape;
  /** Throw on the Nth (1-based) `generateText` call, or null to never fail. */
  failTextOnCall: number | null;
  failJson: boolean;
  textTokens: number;
  jsonTokens: number;
  textCalls: number;
  jsonCalls: number;
};

export const llm: LlmState = {
  textResponses: [],
  metadata: { title: "", slug: "", metaDescription: "", tags: [] },
  failTextOnCall: null,
  failJson: false,
  textTokens: 30,
  jsonTokens: 10,
  textCalls: 0,
  jsonCalls: 0,
};

/** Controls the mocked research step (weekly + daily). */
export const research = {
  topicsCreated: 0,
  fail: false,
  /** Number of times runResearch was invoked (for the daily replenish tests). */
  calls: 0,
};

/** Controllable exact-content gate seam used by the orchestration tests. */
export const grounding = {
  passes: true,
  persists: true,
};

/** Controls the owner instructions seen by the agent policy in workflow tests. */
export const agentControls = {
  paused: false,
  pauseInstruction: null as string | null,
  publishingPaused: false,
  publishingPauseInstruction: null as string | null,
  ownerConstraints: [] as string[],
  priorityInstructions: [] as string[],
  grantedCapabilities: [] as ConnectorCapability[],
};

/** Captures out-of-credits emails the daily agent tried to send. */
export const email: { sent: Array<{ workspaceId: string; brandName?: string; pendingTopics: number }> } = {
  sent: [],
};

export function resetStore() {
  store.workspaces.clear();
  store.topics.clear();
  store.articles.clear();
  store.jobs.clear();
  store.brand.clear();
  store.integrations.clear();
  store.secrets.clear();
  store.usage.clear();
  store.counters.clear();
  store.publications.clear();
  store.dailyRuns.clear();
  store.creditRefs.clear();
  store.seq = 0;

  // The final-article fixture must pass the C3 style lint (no banned phrases,
  // and a ≥25-word opening paragraph so direct-answer shapes keep their
  // answer-first block): otherwise every e2e run triggers rewrite passes.
  llm.textResponses = [
    "Concise summary of the topic.",
    "## Outline\n- Answer\n- Steps\n- Pitfalls",
    "Full draft body content.",
    "# Final Article\n\n" +
      "Automated SEO content pays off when each article answers one real query, " +
      "and our own pipeline proves it: we publish twice a week and organic clicks " +
      "doubled in about ninety days.\n\nSEO-polished body content.",
  ];
  llm.metadata = {
    title: "Generated Title",
    slug: "generated-title",
    metaDescription: "A helpful meta description.",
    tags: ["seo", "automation"],
  };
  llm.failTextOnCall = null;
  llm.failJson = false;
  llm.textTokens = 30;
  llm.jsonTokens = 10;
  llm.textCalls = 0;
  llm.jsonCalls = 0;

  research.topicsCreated = 0;
  research.fail = false;
  research.calls = 0;
  grounding.passes = true;
  grounding.persists = true;
  agentControls.paused = false;
  agentControls.pauseInstruction = null;
  agentControls.publishingPaused = false;
  agentControls.publishingPauseInstruction = null;
  agentControls.ownerConstraints = [];
  agentControls.priorityInstructions = [];
  agentControls.grantedCapabilities = [];
  email.sent = [];
}

// ---- Seed helpers ----

export function seedWorkspace(input: Partial<WorkspaceRow> & { id: string }) {
  const workspace: WorkspaceRow = {
    name: "Test Workspace",
    autonomyMode: "REVIEW",
    ...input,
  };
  store.workspaces.set(workspace.id, workspace);
  // Default credit balance so generation tests succeed unless a test overrides
  // it via setCredits(). Article generation costs 100 credits.
  if (!store.usage.has(workspace.id)) {
    store.usage.set(workspace.id, 1000);
  }
  return workspace;
}

export function seedTopic(input: Partial<TopicRow> & { workspaceId: string }) {
  const id = input.id ?? nextId("topic");
  const now = new Date();
  const topic: TopicRow = {
    id,
    workspaceId: input.workspaceId,
    title: input.title ?? "How to automate SEO content",
    angle: input.angle ?? null,
    keywords: input.keywords ?? null,
    status: input.status ?? "pending",
    source: input.source ?? "manual",
    score: input.score ?? null,
    evidenceJson: input.evidenceJson ?? null,
    intentTier: input.intentTier ?? null,
    thesis: input.thesis ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
  store.topics.set(id, topic);
  return topic;
}

export function seedArticle(input: Partial<ArticleRow> & { workspaceId: string }) {
  const id = input.id ?? nextId("article");
  const now = new Date();
  const article: ArticleRow = {
    id,
    workspaceId: input.workspaceId,
    topicId: input.topicId ?? null,
    title: input.title ?? "Existing Article",
    slug: input.slug ?? "existing-article",
    metaDescription: input.metaDescription ?? null,
    tags: input.tags ?? JSON.stringify(["seo"]),
    bodyMarkdown: input.bodyMarkdown ?? "# Body\n\nContent.",
    status: input.status ?? "draft",
    version: input.version ?? 1,
    shape: input.shape ?? null,
    gateResultsJson: input.gateResultsJson ?? null,
    memoryEvidenceRefs: input.memoryEvidenceRefs ?? [],
    memoryEvidenceVersion: input.memoryEvidenceVersion ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
  store.articles.set(id, article);
  return article;
}

export function seedBrand(workspaceId: string, input: Partial<Omit<BrandRow, "workspaceId">> = {}) {
  const brand: BrandRow = {
    workspaceId,
    productDescription: input.productDescription ?? null,
    audience: input.audience ?? null,
    tone: input.tone ?? null,
    website: input.website ?? null,
    seedKeywords: input.seedKeywords ?? null,
  };
  store.brand.set(workspaceId, brand);
  return brand;
}

export function seedIntegration(
  workspaceId: string,
  seed: {
    provider: IntegrationProviderId;
    enabled: boolean;
    available?: boolean;
    config?: IntegrationConfig;
    apiKey?: string;
    secrets?: Partial<Record<IntegrationSecretKey, string>>;
  },
) {
  const list = store.integrations.get(workspaceId) ?? [];
  const provider = getIntegrationProvider(seed.provider);
  if (!provider) {
    throw new Error(`Unknown provider ${seed.provider}`);
  }
  const secrets =
    seed.secrets ??
    (seed.apiKey && provider.secrets[0] ? { [provider.secrets[0].key]: seed.apiKey } : {});
  const secretStates = {
    ...emptySecretStates(provider),
    ...Object.fromEntries(Object.keys(secrets).map((key) => [key, true])),
  };
  const view: IntegrationView = {
    ...provider,
    provider: seed.provider,
    capabilities: connectorCapabilities(seed.provider),
    enabled: seed.enabled,
    config: seed.config ?? {},
    secretStates,
    requirementsMet: integrationRequirementsMet(provider, seed.config ?? {}, secretStates),
    available: seed.available ?? (provider.status === "available"),
    configurable: provider.status === "available",
  };
  list.push(view);
  store.integrations.set(workspaceId, list);
  for (const [secretKey, secretValue] of Object.entries(secrets)) {
    if (secretValue) {
      store.secrets.set(`${workspaceId}:${seed.provider}:${secretKey}`, secretValue);
    }
  }
  return view;
}

/** Set the workspace credit balance. */
export function setCredits(workspaceId: string, amount: number) {
  store.usage.set(workspaceId, amount);
}

export function getJob(jobId: string) {
  return store.jobs.get(jobId) ?? null;
}

export function jobsFor(workspaceId: string, kind?: string) {
  return [...store.jobs.values()].filter(
    (job) => job.workspaceId === workspaceId && (kind ? job.kind === kind : true),
  );
}

export function publicationsFor(workspaceId: string, articleId: string) {
  return [...store.publications.values()].filter(
    (row) => row.workspaceId === workspaceId && row.articleId === articleId,
  );
}

export function countersFor(workspaceId: string) {
  return store.counters.get(workspaceId) ?? { generated: 0, published: 0 };
}

// ---- Mock module implementations (each closes over the singleton store) ----

export const dbMock = {
  getDb() {
    throw new Error("getDb() must not be called in e2e tests: a data seam is unmocked");
  },
  createDb() {
    throw new Error("createDb() must not be called in e2e tests");
  },
  schema: {},
};

export const agentMemoryRepo = {
  async listOwnerConstraints() {
    return [] as string[];
  },
  async getAgentControlState() {
    return { ...agentControls };
  },
};

export const agentEventsRepo = {
  async recordAgentAction() {
    return { id: nextId("agent-action") };
  },
};

export const articlesRepo = {
  async getTopic(workspaceId: string, topicId: string) {
    const topic = store.topics.get(topicId);
    return topic && topic.workspaceId === workspaceId ? topic : null;
  },
  async getArticle(workspaceId: string, articleId: string) {
    const article = store.articles.get(articleId);
    return article && article.workspaceId === workspaceId ? article : null;
  },
  async getArticleByTopic(workspaceId: string, topicId: string) {
    return (
      [...store.articles.values()]
        .filter((a) => a.workspaceId === workspaceId && a.topicId === topicId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    );
  },
  async createArticle(
    scope: { workspaceId: string; brandId: string },
    input: {
      topicId?: string;
      title: string;
      slug: string;
      metaDescription?: string;
      tags: string[];
      bodyMarkdown: string;
      status?: string;
      shape?: string;
      gateResultsJson?: string;
      memoryEvidenceRefs?: readonly string[];
    },
  ) {
    return seedArticle({
      workspaceId: scope.workspaceId,
      topicId: input.topicId ?? null,
      title: input.title,
      slug: input.slug || slugify(input.title),
      metaDescription: input.metaDescription ?? null,
      tags: JSON.stringify(input.tags),
      bodyMarkdown: input.bodyMarkdown,
      status: input.status ?? "draft",
      version: 1,
      shape: input.shape ?? null,
      gateResultsJson: input.gateResultsJson ?? null,
      memoryEvidenceRefs: [...(input.memoryEvidenceRefs ?? [])],
      memoryEvidenceVersion: input.memoryEvidenceRefs?.length ? 1 : null,
    });
  },
  async updateArticle(
    workspaceId: string,
    articleId: string,
    input: {
      title: string;
      slug: string;
      metaDescription?: string;
      tags: string[];
      bodyMarkdown: string;
      status: string;
    },
  ) {
    const existing = store.articles.get(articleId);
    if (!existing || existing.workspaceId !== workspaceId) {
      return null;
    }
    const updated: ArticleRow = {
      ...existing,
      title: input.title,
      slug: input.slug || slugify(input.title),
      metaDescription: input.metaDescription ?? null,
      tags: JSON.stringify(input.tags),
      bodyMarkdown: input.bodyMarkdown,
      status: input.status,
      version: existing.version + 1,
      memoryEvidenceRefs: existing.memoryEvidenceRefs,
      memoryEvidenceVersion:
        existing.memoryEvidenceRefs.length > 0 ? existing.version + 1 : null,
      updatedAt: new Date(),
    };
    store.articles.set(articleId, updated);
    return updated;
  },
  async setGeneratedArticleStatus(
    workspaceId: string,
    articleId: string,
    status: "draft" | "approved",
    gateResultsJson?: string,
  ) {
    const existing = store.articles.get(articleId);
    if (!existing || existing.workspaceId !== workspaceId) return null;
    const updated = {
      ...existing,
      status,
      ...(gateResultsJson === undefined ? {} : { gateResultsJson }),
      updatedAt: new Date(),
    };
    store.articles.set(articleId, updated);
    return updated;
  },
  async updateTopicStatus(topicId: string, status: string) {
    const topic = store.topics.get(topicId);
    if (topic) {
      topic.status = status;
      topic.updatedAt = new Date();
    }
  },
  async claimTopicForGeneration(
    scope: { workspaceId: string; brandId: string },
    topicId: string,
  ) {
    const topic = store.topics.get(topicId);
    if (
      !topic ||
      topic.workspaceId !== scope.brandId ||
      !["pending", "failed"].includes(topic.status)
    ) {
      return null;
    }
    topic.status = "generating";
    topic.updatedAt = new Date();
    return topic;
  },
  async createTopic(
    scope: { workspaceId: string; brandId: string },
    input: { title: string; angle?: string; keywords?: string },
  ) {
    return seedTopic({
      workspaceId: scope.workspaceId,
      title: input.title,
      angle: input.angle ?? null,
      keywords: input.keywords ?? null,
      source: "manual",
      status: "pending",
    });
  },
  async listPendingTopicsForWriting(workspaceId: string, limit: number) {
    return [...store.topics.values()]
      .filter((t) => t.workspaceId === workspaceId && t.status === "pending" && t.score != null)
      .sort(
        (a, b) => (b.score ?? 0) - (a.score ?? 0) || b.createdAt.getTime() - a.createdAt.getTime(),
      )
      .slice(0, limit);
  },
  async listTopics(workspaceId: string) {
    return [...store.topics.values()].filter((t) => t.workspaceId === workspaceId);
  },
  async listArticles(workspaceId: string) {
    return [...store.articles.values()].filter((a) => a.workspaceId === workspaceId);
  },
  async listArticleGroundingCorpus(
    workspaceId: string,
    options: number | { limit?: number } = 100,
  ) {
    const limit = typeof options === "number" ? options : options.limit ?? 100;
    return [...store.articles.values()]
      .filter((article) => article.workspaceId === workspaceId)
      .slice(0, limit);
  },
};

export const brandRepo = {
  async getBrandProfile(brandId: string) {
    return store.brand.get(brandId) ?? null;
  },
  async getBrand(workspaceId: string, brandId: string) {
    // Autonomy is per-brand in production. Tests still express it via
    // seedWorkspace({ autonomyMode }): and use a single brand whose id equals
    // the workspace id: so mirror the seeded workspace's mode onto the brand.
    return {
      id: brandId,
      workspaceId,
      name: "Test Brand",
      autonomyMode: store.workspaces.get(workspaceId)?.autonomyMode ?? "REVIEW",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  },
  async listBrands(workspaceId: string) {
    // Tests use a single brand whose id equals the workspace id.
    return [
      {
        id: workspaceId,
        workspaceId,
        name: "Test Brand",
        autonomyMode: store.workspaces.get(workspaceId)?.autonomyMode ?? "REVIEW",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  },
};

export const workspaceRepo = {
  async getWorkspaceById(workspaceId: string) {
    return store.workspaces.get(workspaceId) ?? null;
  },
};

export const jobsRepo = {
  async createAgentJob(
    scope: { workspaceId: string; brandId: string },
    kind: string,
    message?: string,
  ) {
    const id = nextId("job");
    const job: JobRow = {
      id,
      workspaceId: scope.workspaceId,
      kind,
      status: "running",
      message: message ?? null,
      metadataJson: null,
    };
    store.jobs.set(id, job);
    return job;
  },
  async finishAgentJob(
    jobId: string,
    status: string,
    message: string,
    metadata?: Record<string, unknown>,
  ) {
    const job = store.jobs.get(jobId);
    if (job) {
      job.status = status;
      job.message = message;
      job.metadataJson = metadata ? JSON.stringify(metadata) : null;
    }
  },
  async listAgentJobs(workspaceId: string, limit = 20) {
    return [...store.jobs.values()]
      .filter((job) => job.workspaceId === workspaceId)
      .slice(0, limit);
  },
  async incrementArticlesGenerated(scope: { workspaceId: string; brandId: string }, amount = 1) {
    const current = store.counters.get(scope.brandId) ?? { generated: 0, published: 0 };
    current.generated += amount;
    store.counters.set(scope.brandId, current);
  },
  async incrementArticlesPublished(scope: { workspaceId: string; brandId: string }, amount = 1) {
    const current = store.counters.get(scope.brandId) ?? { generated: 0, published: 0 };
    current.published += amount;
    store.counters.set(scope.brandId, current);
  },
  async getUsageTotals(brandId: string) {
    const current = store.counters.get(brandId) ?? { generated: 0, published: 0 };
    return {
      articlesWritten: current.generated,
      articlesPublished: current.published,
      thisWeek: { articlesWritten: current.generated, articlesPublished: current.published },
    };
  },
};

export class InsufficientCreditsError extends Error {
  constructor(
    public readonly required: number,
    public readonly available: number,
  ) {
    super(`Insufficient credits (need ${required}, have ${available})`);
    this.name = "InsufficientCreditsError";
  }
}

// `store.usage` holds the workspace's total credit balance in these tests.
export const creditsRepo = {
  InsufficientCreditsError,
  async getCreditBalance(workspaceId: string) {
    const total = store.usage.get(workspaceId) ?? 0;
    return { monthly: total, purchased: 0, total };
  },
  async assertHasCredits(workspaceId: string, cost: number) {
    const total = store.usage.get(workspaceId) ?? 0;
    if (total < cost) {
      throw new InsufficientCreditsError(cost, total);
    }
    return { monthly: total, purchased: 0, total };
  },
  async spendCredits(
    workspaceId: string,
    cost: number,
    ref?: { reason: string; refId?: string | null },
  ) {
    // Dedupe on (workspace, reason, refId) like the real ledger unique index, so a
    // retried charge with the same refId is a no-op rather than a double-spend.
    if (ref?.refId) {
      const key = `${workspaceId}:${ref.reason}:${ref.refId}`;
      if (store.creditRefs.has(key)) {
        const total = store.usage.get(workspaceId) ?? 0;
        return { monthly: total, purchased: 0, total };
      }
      store.creditRefs.add(key);
    }
    const total = store.usage.get(workspaceId) ?? 0;
    if (total < cost) {
      throw new InsufficientCreditsError(cost, total);
    }
    const next = total - cost;
    store.usage.set(workspaceId, next);
    return { monthly: next, purchased: 0, total: next };
  },
  async grantCredits(workspaceId: string, amount: number) {
    const total = (store.usage.get(workspaceId) ?? 0) + amount;
    store.usage.set(workspaceId, total);
    return { monthly: 0, purchased: total, total };
  },
  async resetMonthlyCredits(workspaceId: string, grant: number) {
    store.usage.set(workspaceId, grant);
    return { monthly: grant, purchased: 0, total: grant };
  },
  async listCreditLedger() {
    return [];
  },
  async creditsForRefs() {
    return new Map<string, number>();
  },
  async listCompetitorDiscoveries() {
    return [];
  },
};

export const llmClient = {
  async generateText(tier: ModelTier) {
    llm.textCalls += 1;
    if (llm.failTextOnCall === llm.textCalls) {
      throw new Error(`LLM generateText failed on call ${llm.textCalls}`);
    }
    const text = llm.textResponses[llm.textCalls - 1] ?? `mock-${tier}-${llm.textCalls}`;
    return {
      text,
      model: `model-${tier}`,
      tier,
      usage: {
        promptTokens: 10,
        completionTokens: llm.textTokens - 10,
        totalTokens: llm.textTokens,
      },
    };
  },
  async generateJson(tier: ModelTier) {
    llm.jsonCalls += 1;
    if (llm.failJson) {
      throw new Error("LLM generateJson failed");
    }
    return {
      text: JSON.stringify(llm.metadata),
      model: `model-${tier}`,
      tier,
      usage: {
        promptTokens: 4,
        completionTokens: llm.jsonTokens - 4,
        totalTokens: llm.jsonTokens,
      },
      data: llm.metadata,
    };
  },
};

export const integrationsRepo = {
  async listIntegrations(workspaceId: string) {
    return store.integrations.get(workspaceId) ?? [];
  },
  async readIntegrationSecret(
    workspaceId: string,
    provider: IntegrationProviderId,
    secretKey: string,
  ) {
    return store.secrets.get(`${workspaceId}:${provider}:${secretKey}`) ?? null;
  },
  async readIntegrationSecrets(workspaceId: string, provider: IntegrationProviderId) {
    const providerDefinition = getIntegrationProvider(provider);
    if (!providerDefinition) {
      return {};
    }

    return Object.fromEntries(
      providerDefinition.secrets.flatMap((secret) => {
        const value =
          store.secrets.get(`${workspaceId}:${provider}:${secret.key}`) ??
          secret.legacyKeys
            ?.map((legacyKey) => store.secrets.get(`${workspaceId}:${provider}:${legacyKey}`))
            .find((legacyValue): legacyValue is string => Boolean(legacyValue));
        return value ? [[secret.key, value]] : [];
      }),
    );
  },
};

export const publishingRepo = {
  async getPublication(brandId: string, articleId: string, provider: string) {
    return store.publications.get(`${brandId}:${articleId}:${provider}`) ?? null;
  },
  async upsertPublication(
    scope: { workspaceId: string; brandId: string },
    articleId: string,
    provider: string,
    input: {
      status: string;
      externalUrl?: string | null;
      errorMessage?: string | null;
      attemptCount: number;
      publishedAt?: Date | null;
      publishedHash?: string | null;
    },
  ) {
    const key = `${scope.brandId}:${articleId}:${provider}`;
    const existing = store.publications.get(key);
    const row: PublicationRow = {
      id: existing?.id ?? nextId("pub"),
      workspaceId: scope.workspaceId,
      articleId,
      provider,
      status: input.status,
      externalUrl: input.externalUrl ?? null,
      errorMessage: input.errorMessage ?? null,
      attemptCount: input.attemptCount,
      publishedAt: input.publishedAt ?? null,
      publishedHash: input.publishedHash ?? null,
    };
    store.publications.set(key, row);
    return row;
  },
  async listPublicationsForArticle(workspaceId: string, articleId: string) {
    return publicationsFor(workspaceId, articleId);
  },
  async listPublishedDestinationsForBrand(workspaceId: string, limit = 200) {
    return [...store.publications.values()]
      .filter(
        (publication) =>
          publication.workspaceId === workspaceId &&
          publication.status === "published" &&
          publication.externalUrl,
      )
      .slice(0, limit)
      .map((publication) => ({
        articleId: publication.articleId,
        provider: publication.provider,
        externalUrl: publication.externalUrl,
        publishedAt: publication.publishedAt,
      }));
  },
};

export const groundingService = {
  async persistResearchEvidenceBundles() {
    return [];
  },
  async loadGenerationGrounding() {
    return {
      bundleId: "bundle-test",
      bundleVersion: 1,
      packet: {
        version: "evidence-packet.v1",
        createdAt: new Date().toISOString(),
        records: [],
        omittedSourceCount: 0,
        excerptCharacters: 0,
        limits: { maxSources: 12, maxExcerptChars: 1200, maxPacketChars: 9000 },
      },
      promptPacket: "Mock bounded evidence packet",
      evidenceSourceIds: {},
      siteOrigin: "https://example.test",
      internalTargets: [],
    };
  },
  async prepareArticleGroundingEvaluation(
    scope: { workspaceId: string; brandId: string },
    input: { stylePassed?: boolean },
  ) {
    const destinations = (store.integrations.get(scope.brandId) ?? []).filter(
      (integration) =>
        integration.enabled &&
        integration.available &&
        integration.requirementsMet &&
        integration.capabilities.includes("article.create"),
    );
    const destinationsSafe =
      destinations.length > 0 &&
      destinations.every((integration) => integration.capabilities.includes("rollback.supported"));
    const passed = grounding.passes && grounding.persists && input.stylePassed !== false && destinationsSafe;
    return {
      aggregate: { passed, blockingReasons: passed ? [] : ["Mock grounding gate blocked."] },
      gateResults: [
        { gate: "style-lint", passed: input.stylePassed !== false, detail: "Mock style gate" },
        { gate: "grounded_material_claims", passed, detail: "Mock grounding gate" },
      ],
      evaluatorVersions: { publication_gate: "publication-gate.v1" },
      finalContentHash: "mock-final-content-hash",
      grounding: { bundleId: "bundle-test", bundleVersion: 1 },
      blockingReasons: passed ? [] : ["Mock grounding gate blocked."],
    };
  },
  async recordArticleGroundingEvaluation(
    _scope: unknown,
    _article: unknown,
    prepared: { aggregate: { passed: boolean } },
  ) {
    return {
      persisted: grounding.persists,
      passed: grounding.persists && grounding.passes && prepared.aggregate.passed,
      claimLedgerId: grounding.persists ? "ledger-test" : null,
      gateRunId: grounding.persists ? "gate-test" : null,
      prepared,
    };
  },
  async assertFreshAutomaticPublicationGate() {
    if (!grounding.passes || !grounding.persists) {
      throw new Error("Automatic publication blocked by mocked grounding gate");
    }
    return { run: { status: "passed", automaticPublicationAllowed: true }, checks: [] };
  },
};

export const billingAccess = {
  async getRequestOrigin() {
    return "https://fallback.test";
  },
};

export const researchRun = {
  async runResearch() {
    research.calls += 1;
    if (research.fail) {
      throw new Error("Research step failed");
    }
    return { runId: nextId("research-run"), topicsCreated: research.topicsCreated };
  },
};

export function dailyRunFor(brandId: string, runDate: string) {
  return store.dailyRuns.get(`${brandId}:${runDate}`) ?? null;
}

export const dailyRepo = {
  async getDailyRun(brandId: string, runDate: string) {
    return store.dailyRuns.get(`${brandId}:${runDate}`) ?? null;
  },
  async upsertDailyRun(
    scope: { workspaceId: string; brandId: string },
    runDate: string,
    input: {
      articlesWritten: number;
      topicsResearched: number;
      status: string;
      note?: string | null;
    },
  ) {
    store.dailyRuns.set(`${scope.brandId}:${runDate}`, {
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      runDate,
      articlesWritten: input.articlesWritten,
      topicsResearched: input.topicsResearched,
      status: input.status,
      note: input.note ?? null,
    });
  },
};

export const emailNotify = {
  async sendOutOfCreditsEmail(notice: { workspaceId: string; brandName?: string; pendingTopics: number }) {
    email.sent.push(notice);
  },
};
