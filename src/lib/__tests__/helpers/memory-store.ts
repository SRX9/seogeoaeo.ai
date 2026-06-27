/**
 * In-memory "temp" data store for end-to-end workflow tests.
 *
 * This is a throwaway local database (plain Maps, reset between tests) plus mock
 * implementations of every data/IO seam the article pipeline touches. Wiring
 * these mocks via `vi.mock` lets the REAL orchestration code — article
 * generation, publishing, and the weekly pipeline — run end-to-end with no
 * Postgres and no network, so we can drive it through every scenario.
 *
 * The store is a module singleton shared between the `vi.mock` factories and the
 * test bodies. `resetStore()` mutates it in place (never reassigns it), so all
 * holders keep seeing the same live object across tests.
 */
import type { ModelTier } from "@/lib/llm/client";
import type {
  IntegrationConfig,
  IntegrationProviderId,
  IntegrationView,
} from "@/lib/integrations/providers";
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

type Store = {
  workspaces: Map<string, WorkspaceRow>;
  topics: Map<string, TopicRow>;
  articles: Map<string, ArticleRow>;
  jobs: Map<string, JobRow>;
  brand: Map<string, BrandRow>;
  integrations: Map<string, IntegrationView[]>;
  secrets: Map<string, string>;
  usage: Map<string, number>;
  publications: Map<string, PublicationRow>;
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
  publications: new Map(),
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

/** Controls the mocked weekly research step. */
export const research = {
  topicsCreated: 0,
  fail: false,
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
  store.publications.clear();
  store.seq = 0;

  llm.textResponses = [
    "Concise summary of the topic.",
    "## Outline\n- Intro\n- Body\n- Conclusion",
    "Full draft body content.",
    "# Final Article\n\nSEO-polished body content.",
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
  },
) {
  const list = store.integrations.get(workspaceId) ?? [];
  const view: IntegrationView = {
    provider: seed.provider,
    name: seed.provider,
    description: "",
    enabled: seed.enabled,
    available: seed.available ?? true,
    configurable: true,
    config: seed.config ?? {},
    hasSecret: Boolean(seed.apiKey),
  };
  list.push(view);
  store.integrations.set(workspaceId, list);
  if (seed.apiKey) {
    store.secrets.set(`${workspaceId}:${seed.provider}:api_key`, seed.apiKey);
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

// ---- Mock module implementations (each closes over the singleton store) ----

export const dbMock = {
  getDb() {
    throw new Error("getDb() must not be called in e2e tests — a data seam is unmocked");
  },
  createDb() {
    throw new Error("createDb() must not be called in e2e tests");
  },
  schema: {},
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
};

export const brandRepo = {
  async getBrandProfile(brandId: string) {
    return store.brand.get(brandId) ?? null;
  },
  async listBrands(workspaceId: string) {
    // Tests use a single brand whose id equals the workspace id.
    return [
      {
        id: workspaceId,
        workspaceId,
        name: "Test Brand",
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
  async spendCredits(workspaceId: string, cost: number) {
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
};

export const billingAccess = {
  async getRequestOrigin() {
    return "https://fallback.test";
  },
};

export const researchRun = {
  async runResearch() {
    if (research.fail) {
      throw new Error("Research step failed");
    }
    return { topicsCreated: research.topicsCreated };
  },
};
