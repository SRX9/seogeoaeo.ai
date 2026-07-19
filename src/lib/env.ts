import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_INDIE: z.string().optional(),
  STRIPE_PRICE_STARTUP: z.string().optional(),
  STRIPE_PRICE_SCALE: z.string().optional(),
  STRIPE_PRICE_ENTERPRISE: z.string().optional(),
  STRIPE_PRICE_PACK_SMALL: z.string().optional(),
  STRIPE_PRICE_PACK_MEDIUM: z.string().optional(),
  STRIPE_PRICE_PACK_LARGE: z.string().optional(),
  // Customer Portal configuration (bpc_...) from /api/admin/portal-config.
  STRIPE_PORTAL_CONFIG_ID: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  AUTH_DEV_BYPASS: z.string().optional(),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_LIGHT_MODEL: z.string().optional(),
  LLM_HEAVY_MODEL: z.string().optional(),
  LLM_IMAGE_MODEL: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  SERPER_API_KEY: z.string().optional(),
  KEYWORD_API_URL: z.string().url().optional(),
  // Managed scrapers for resilient content fetch + true-SSR check (src/lib/visibility/scrape.ts).
  CONTEXT_DEV_API_KEY: z.string().optional(),
  CONTEXT_API_KEY: z.string().optional(),
  FIRECRAWL_API_KEY: z.string().optional(),
  AGENT_OBSERVATION_ENABLED: z.string().optional(),
  AGENT_DRAFTING_ENABLED: z.string().optional(),
  AGENT_PUBLISHING_ENABLED: z.string().optional(),
  AGENT_SITE_WRITES_ENABLED: z.string().optional(),
  AGENT_BILLABLE_ACTIONS_ENABLED: z.string().optional(),
  AGENT_GLOBAL_KILL_SWITCH: z.string().optional(),
  AGENT_GROUNDED_CONTENT_GATE_ENABLED: z.string().optional(),
  AGENT_GOAL_KERNEL_ENABLED: z.string().optional(),
  /**
   * Where operator (developer) alert emails go when a customer-facing pipeline
   * fails terminally (e.g. a Setup Run exhausts recovery). Unset disables the
   * email; the failure is still logged and recorded as an operational signal.
   */
  OPERATOR_ALERT_EMAIL: z.string().email().optional(),
  /** PostHog project token (phc_...). Used for local/direct OTLP log shipping. */
  POSTHOG_PROJECT_TOKEN: z.string().optional(),
  /** PostHog ingest host. Defaults to https://us.i.posthog.com */
  POSTHOG_HOST: z.string().url().optional(),
  /** Override service.name on logs. Defaults to seo-ai. */
  POSTHOG_SERVICE_NAME: z.string().optional(),
  /** deployment.environment on logs. Defaults to NODE_ENV. */
  POSTHOG_ENVIRONMENT: z.string().optional(),
  /**
   * Set to "1" to also POST logs via OTLP from Workers (normally CF destinations
   * handle production export). Set to "0" to disable direct shipping even locally.
   */
  POSTHOG_LOGS_DIRECT: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

export function getServerEnv(): ServerEnv {
  return serverSchema.parse(process.env);
}

export { plans, type PlanId } from "@/lib/billing/plans";
