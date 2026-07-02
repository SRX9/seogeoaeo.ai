/** Cloudflare `send_email` binding (high-level send API). */
interface SendEmailBinding {
  send(message: {
    to: string;
    // A bare string is treated as just the address; pass `{ email, name }` so
    // clients show the display name instead of the raw address.
    from: string | { email: string; name?: string };
    subject: string;
    html?: string;
    text?: string;
  }): Promise<{ messageId: string }>;
}

/**
 * Cloudflare Workflows binding for the daily content agent. The Workflow class
 * (`DailyBrandWorkflow`) lives in the separate `agent-workflow` Worker; this app
 * binds to it cross-script (see `wrangler.jsonc`) only to create instances.
 */
interface AgentWorkflowBinding {
  create(options?: { id?: string; params?: unknown }): Promise<{ id: string }>;
  createBatch(batch: Array<{ id?: string; params?: unknown }>): Promise<Array<{ id: string }>>;
  get(id: string): Promise<{ id: string }>;
}

/** Minimal KV namespace surface used by `src/lib/cloudflare/kv.ts`. */
interface KvCacheBinding {
  get<T = unknown>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface CloudflareEnv {
  ASSETS: Fetcher;
  HYPERDRIVE: Hyperdrive;
  /** KV cache (public quick-snapshot results, other short-TTL caches). */
  CACHE?: KvCacheBinding;
  EMAIL?: SendEmailBinding;
  AGENT_WORKFLOW?: AgentWorkflowBinding;
  CRON_SECRET: string;
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  ENCRYPTION_KEY: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_INDIE?: string;
  STRIPE_PRICE_STARTUP?: string;
  STRIPE_PRICE_SCALE?: string;
  STRIPE_PRICE_ENTERPRISE?: string;
  STRIPE_PRICE_PACK_SMALL?: string;
  STRIPE_PRICE_PACK_MEDIUM?: string;
  STRIPE_PRICE_PACK_LARGE?: string;
  LLM_BASE_URL?: string;
  LLM_API_KEY?: string;
  LLM_LIGHT_MODEL?: string;
  LLM_HEAVY_MODEL?: string;
  LLM_IMAGE_MODEL?: string;
  TAVILY_API_KEY?: string;
  SERPER_API_KEY?: string;
  KEYWORD_API_URL?: string;
}
