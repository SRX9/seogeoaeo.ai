/** Cloudflare `send_email` binding (high-level send API). */
interface SendEmailBinding {
  send(message: {
    to: string;
    from: string;
    subject: string;
    html?: string;
    text?: string;
  }): Promise<{ messageId: string }>;
}

interface CloudflareEnv {
  ASSETS: Fetcher;
  HYPERDRIVE: Hyperdrive;
  EMAIL?: SendEmailBinding;
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
