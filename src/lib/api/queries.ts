"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiGet } from "@/lib/api/fetcher";

/** Central query keys so mutations can invalidate the right caches. */
export const queryKeys = {
  me: ["me"] as const,
  dashboard: ["dashboard"] as const,
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
  workspace: { id: string; name: string; autonomyMode: string };
  subscription: {
    planId: string;
    status: string;
    credits: CreditBalance;
    monthlyCreditGrant: number;
    currentPeriodEnd: string | null;
    hasStripeCustomer: boolean;
  } | null;
  brands: { id: string; name: string }[];
  activeBrandId: string | null;
};

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  href: string;
  completed: boolean;
};

export type DashboardResponse = {
  active: boolean;
  plan: { id: string; name: string } | null;
  autonomyMode: string;
  credits: CreditBalance;
  creditCosts: CreditCosts;
  monthlyCreditGrant: number;
  canGenerate: boolean;
  totalArticles: number;
  approvedArticles: number;
  pendingTopics: number;
  latestRun: { status: string; summary: string | null; topicsCreated: number | null } | null;
  automation: AutomationStats;
  onboardingSteps: OnboardingStep[];
  recentArticles: { id: string; title: string; status: string }[];
};

export type AutomationStats = {
  /** Whether the weekly auto-run pipeline is active (requires a subscription). */
  enabled: boolean;
  autoPublish: boolean;
  schedule: string;
  nextRunAt: string | null;
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
const dashboardQueryOptions = () => ({
  queryKey: queryKeys.dashboard,
  queryFn: () => apiGet<DashboardResponse>("/api/dashboard"),
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

export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: () => apiGet<MeResponse>("/api/me") });
}

export function useDashboard() {
  return useQuery(dashboardQueryOptions());
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
    queryClient.prefetchQuery(dashboardQueryOptions());
    queryClient.prefetchQuery(topicsQueryOptions());
    queryClient.prefetchQuery(articlesQueryOptions());
    queryClient.prefetchQuery(activityQueryOptions());
  }, [enabled, queryClient]);
}

export function useResearch() {
  return useQuery({
    queryKey: queryKeys.research,
    queryFn: () => apiGet<{ latest: ResearchRun | null; runs: ResearchRun[] }>("/api/research"),
  });
}

export function useIntegrations() {
  return useQuery({
    queryKey: queryKeys.integrations,
    queryFn: () => apiGet<{ integrations: IntegrationView[] }>("/api/integrations"),
  });
}

export function useCredits() {
  return useQuery({
    queryKey: queryKeys.credits,
    queryFn: () => apiGet<CreditsResponse>("/api/credits"),
  });
}
