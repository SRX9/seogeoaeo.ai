"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiGet } from "@/lib/api/fetcher";

/** Central query keys so mutations can invalidate the right caches. */
export const queryKeys = {
  me: ["me"] as const,
  automation: ["dashboard", "automation"] as const,
  onboarding: ["onboarding"] as const,
  brands: ["brands"] as const,
  brandProfile: ["brand", "profile"] as const,
  competitors: ["brand", "competitors"] as const,
  topics: ["topics"] as const,
  articles: ["articles"] as const,
  article: (id: string) => ["articles", id] as const,
  activity: ["activity"] as const,
  research: ["research"] as const,
  integrations: ["integrations"] as const,
  credits: ["credits"] as const,
};

export type SessionUser = { id: string; email: string; name: string; image?: string | null };

export type CreditBalance = { monthly: number; purchased: number; total: number };

export type CreditCosts = {
  article_generation: number;
  research_run: number;
  competitor_discovery: number;
};

export type CreditLedgerEntry = {
  id: string;
  delta: number;
  balanceAfter: number | null;
  reason: string;
  createdAt: string;
};

export type CreditsResponse = {
  balance: CreditBalance;
  costs: CreditCosts;
  ledger: CreditLedgerEntry[];
};

export type MeResponse = {
  user: SessionUser;
  llmReady: boolean;
  workspace: { id: string; name: string };
  subscription: {
    planId: string;
    status: string;
    credits: CreditBalance;
    monthlyCreditGrant: number;
    currentPeriodEnd: string | null;
    hasStripeCustomer: boolean;
    creditEmailsEnabled: boolean;
  } | null;
  brands: { id: string; name: string; autonomyMode: string }[];
  activeBrandId: string | null;
};

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  href: string;
  completed: boolean;
};

export type OnboardingResponse = { steps: OnboardingStep[] };

export type AgentState =
  | "active"
  | "paused_no_credits"
  | "paused_no_subscription"
  | "idle_caught_up";

export type AutomationStats = {
  /** Whether the daily auto-run pipeline is active (requires a subscription). */
  enabled: boolean;
  autoPublish: boolean;
  schedule: string;
  nextRunAt: string | null;
  /** Current high-level state of the content agent, for the overview banner. */
  agentState: AgentState;
  /** Max articles the agent writes per day on the current plan. */
  dailyCap: number;
  /** Articles already written for this brand today (UTC). */
  writtenToday: number;
  /** Scored topics queued and waiting to be written. */
  pendingTopics: number;
  /** When the workspace (its content agent) was created. */
  workingSince: string;
  totalRuns: number;
  /** Lifetime articles written / published, from durable usage_counters. */
  articlesWritten: number;
  articlesPublished: number;
  thisWeek: { articlesWritten: number; articlesPublished: number };
  lastRun: {
    status: string;
    createdAt: string;
    articlesGenerated: number;
    topicsResearched: number;
  } | null;
};

export type BrandProfile = {
  productDescription: string;
  audience: string;
  tone: string;
  website: string;
  seedKeywords: string;
};

export type Competitor = {
  id: string;
  name: string;
  url: string;
  rssUrl: string | null;
  sitemapUrl: string | null;
};

export type Topic = {
  id: string;
  title: string;
  angle: string | null;
  keywords: string | null;
  status: string;
  source: string;
  score: number | null;
  rationale: string | null;
  answerFit: string | null;
  evidenceJson: string | null;
};

export type Article = {
  id: string;
  topicId: string | null;
  title: string;
  slug: string;
  metaDescription: string | null;
  tags: string | null;
  bodyMarkdown: string;
  status: string;
  version: number;
  updatedAt: string;
  createdAt: string;
};

export type Publication = {
  provider: string;
  status: string;
  externalUrl: string | null;
  errorMessage: string | null;
  attemptCount: number;
};

export type AgentJob = {
  id: string;
  kind: string;
  status: string;
  message: string | null;
  metadataJson: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ResearchRun = {
  id: string;
  status: string;
  summary: string | null;
  findingsJson: string | null;
  topicsCreated: number | null;
  createdAt: string;
};

/** A competitor discovery surfaced on the activity feed from its ledger spend. */
export type CompetitorRun = {
  id: string;
  status: string;
  createdAt: string;
  creditsSpent: number;
};

/**
 * Activity feed entries, each annotated with the credits it spent. Competitor
 * discoveries have no job/run record, so they come through as their own list.
 */
export type ActivityResponse = {
  jobs: (AgentJob & { creditsSpent: number })[];
  runs: (ResearchRun & { creditsSpent: number })[];
  competitors: CompetitorRun[];
};

export type IntegrationView = {
  provider: string;
  name: string;
  description: string;
  enabled: boolean;
  available: boolean;
  configurable: boolean;
  config: {
    webhookUrl?: string;
    siteUrl?: string;
    username?: string;
    publicationId?: string;
    adminApiUrl?: string;
  };
  hasSecret: boolean;
};

// Shared query options so a hook and its prefetch call can't drift apart.
const automationQueryOptions = () => ({
  queryKey: queryKeys.automation,
  queryFn: () => apiGet<AutomationStats>("/api/dashboard/automation"),
});
const onboardingQueryOptions = () => ({
  queryKey: queryKeys.onboarding,
  queryFn: () => apiGet<OnboardingResponse>("/api/onboarding"),
});
const creditsQueryOptions = () => ({
  queryKey: queryKeys.credits,
  queryFn: () => apiGet<CreditsResponse>("/api/credits"),
});
const researchQueryOptions = () => ({
  queryKey: queryKeys.research,
  queryFn: () => apiGet<{ latest: ResearchRun | null; runs: ResearchRun[] }>("/api/research"),
});
const topicsQueryOptions = () => ({
  queryKey: queryKeys.topics,
  queryFn: () => apiGet<{ topics: Topic[] }>("/api/topics"),
});
const articlesQueryOptions = () => ({
  queryKey: queryKeys.articles,
  queryFn: () => apiGet<{ articles: Article[] }>("/api/articles"),
});
const activityQueryOptions = () => ({
  queryKey: queryKeys.activity,
  queryFn: () => apiGet<ActivityResponse>("/api/activity"),
});

/** The minimal shape `<Section>` consumes; `combineQueries` produces it too. */
export type QueryLike<T> = {
  data: T | undefined;
  error: unknown;
  refetch: () => unknown;
};

// `infer D` greedily keeps the `| undefined` from `QueryLike.data`, so strip it
// — once `combineQueries` resolves, every element is guaranteed present.
type DataOf<Q> = Q extends QueryLike<infer D> ? Exclude<D, undefined> : never;

/**
 * Merge several query results into one `<Section>`-compatible result: `data` is
 * a tuple present only once every query has resolved, `error` is the first
 * failure, and `refetch` re-runs them all. Lets one section depend on several
 * endpoints while still loading/erroring as a unit.
 */
export function combineQueries<T extends readonly QueryLike<unknown>[]>(
  ...queries: [...T]
): QueryLike<{ [K in keyof T]: DataOf<T[K]> }> {
  const failed = queries.find((query) => query.error != null);
  const ready = queries.every((query) => query.data !== undefined);
  return {
    data: ready
      ? (queries.map((query) => query.data) as { [K in keyof T]: DataOf<T[K]> })
      : undefined,
    error: failed?.error ?? null,
    refetch: () => {
      for (const query of queries) query.refetch();
    },
  };
}

export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: () => apiGet<MeResponse>("/api/me") });
}

export function useAutomation() {
  return useQuery(automationQueryOptions());
}

export function useOnboarding() {
  return useQuery(onboardingQueryOptions());
}

export function useBrandProfile() {
  return useQuery({
    queryKey: queryKeys.brandProfile,
    queryFn: () => apiGet<{ profile: BrandProfile }>("/api/brand/profile"),
  });
}

export function useCompetitors() {
  return useQuery({
    queryKey: queryKeys.competitors,
    queryFn: () => apiGet<{ competitors: Competitor[] }>("/api/brand/competitors"),
  });
}

export function useTopics() {
  return useQuery(topicsQueryOptions());
}

export function useArticles() {
  return useQuery(articlesQueryOptions());
}

export function useArticle(id: string) {
  return useQuery({
    queryKey: queryKeys.article(id),
    queryFn: () =>
      apiGet<{ article: Article; publications: Publication[] }>(`/api/articles/${id}`),
    enabled: Boolean(id),
    // Keep the previously opened article on screen while the next one loads.
    placeholderData: keepPreviousData,
  });
}

export function useActivity() {
  return useQuery(activityQueryOptions());
}

/**
 * Warm the caches for the primary nav destinations once the workspace has
 * loaded, so switching pages renders from cache instead of a spinner.
 */
export function usePrefetchAppData(enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    // Dashboard sections (each loads independently from its own endpoint).
    queryClient.prefetchQuery(creditsQueryOptions());
    queryClient.prefetchQuery(automationQueryOptions());
    queryClient.prefetchQuery(onboardingQueryOptions());
    queryClient.prefetchQuery(researchQueryOptions());
    // Shared across pages.
    queryClient.prefetchQuery(topicsQueryOptions());
    queryClient.prefetchQuery(articlesQueryOptions());
    queryClient.prefetchQuery(activityQueryOptions());
  }, [enabled, queryClient]);
}

export function useResearch() {
  return useQuery(researchQueryOptions());
}

export function useIntegrations() {
  return useQuery({
    queryKey: queryKeys.integrations,
    queryFn: () => apiGet<{ integrations: IntegrationView[] }>("/api/integrations"),
  });
}

export function useCredits() {
  return useQuery(creditsQueryOptions());
}
