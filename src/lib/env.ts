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
});

export type ServerEnv = z.infer<typeof serverSchema>;

export function getServerEnv(): ServerEnv {
  return serverSchema.parse(process.env);
}

export { plans, type PlanId } from "@/lib/billing/plans";
