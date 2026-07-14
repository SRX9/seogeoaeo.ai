"use client";

import {
  keepPreviousData,
  queryOptions,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { getAgentPresence, isAgentLive } from "@/lib/agent/presence";
import type { AgentState as AgentOperatingState } from "@/lib/agent/types";
import { apiGet } from "@/lib/api/fetcher";
import { queryKeys } from "@/lib/api/query-keys";
import { queryPolicy } from "@/lib/api/query-policy";
import type { BrandIdentitySummary, BrandIntelligenceData } from "@/lib/brand/intelligence-types";
import type { ConnectorCapability } from "@/lib/integrations/capabilities";
import type {
  IntegrationConfig,
  IntegrationFieldDefinition,
  IntegrationProviderId,
  IntegrationProviderStatus,
  IntegrationPublishMode,
  IntegrationRequirements,
  IntegrationSecretDefinition,
  IntegrationSecretKey,
} from "@/lib/integrations/providers";

export { queryKeys };

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
  brands: {
    id: string;
    name: string;
    autonomyMode: string;
    badgePublic: boolean;
    identity: BrandIdentitySummary | null;
  }[];
  activeBrandId: string | null;
};

/** All read-only data needed to render the Overview in one request. */
export type DashboardData = {
  brand: { id: string; name: string; identity: BrandIdentitySummary | null };
  setup: SetupRunResponse;
  agent: AgentOperatingState;
  summary: VisibilitySummary;
  answers: VisibilityAnswers;
  traffic: VisibilityTraffic;
  articles: Article[];
  findings: VisibilityFinding[];
  integrations: IntegrationView[];
  automation: AutomationStats;
  approvals: AgentApprovalView[];
  inboxCount: number;
};

/** One page-scoped payload shared by the Inbox page and persistent dock. */
export type InboxData = {
  agent: AgentOperatingState;
  approvals: AgentApprovalView[];
  articles: Article[];
  findings: VisibilityFinding[];
  traffic: VisibilityTraffic;
  integrations: IntegrationView[];
  automation: AutomationStats;
  inboxCount: number;
};

export type BrandIntelligenceResponse = {
  identity: BrandIdentitySummary | null;
  data: BrandIntelligenceData | null;
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
  /** C4: the next topic she'll write and its traffic thesis. */
  nextTopic: { title: string; thesis: string | null } | null;
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

export type UseCase = {
  id: string;
  job: string;
  persona: string;
  industry: string | null;
  evidence: string | null;
  origin: string;
  enabled: boolean;
  edited: boolean;
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
  intentTier: string | null;
  thesis: string | null;
};

export type Article = {
  id: string;
  topicId: string | null;
  title: string;
  slug: string;
  metaDescription: string | null;
  tags: string | null;
  /** Full body: present on detail GET; empty/absent on list. */
  bodyMarkdown: string;
  /** char_length of body from list endpoint (list omits bodyMarkdown payload). */
  bodyLength?: number;
  status: string;
  version: number;
  shape: string | null;
  gateResultsJson: string | null;
  updatedAt: string;
  createdAt: string;
  /** C4: latest performance checkpoint verdict, when one has run. */
  performance?: { verdict: "winner" | "stalling" | "dead" | "watching"; day: number; position: number | null } | null;
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
  provider: IntegrationProviderId;
  id: IntegrationProviderId;
  name: string;
  description: string;
  publishMode: IntegrationPublishMode;
  status: IntegrationProviderStatus;
  fields: IntegrationFieldDefinition[];
  secrets: IntegrationSecretDefinition[];
  requirements: IntegrationRequirements;
  capabilities: readonly ConnectorCapability[];
  enabled: boolean;
  available: boolean;
  configurable: boolean;
  config: IntegrationConfig;
  secretStates: Partial<Record<IntegrationSecretKey, boolean>>;
  requirementsMet: boolean;
};

type ApiQueryContext = { signal: AbortSignal };

/** Every GET consumes TanStack's AbortSignal so abandoned navigations stop work. */
const apiQuery = <T,>(path: string) =>
  ({ signal }: ApiQueryContext) => apiGet<T>(path, { signal });

// Shared query options so hooks and intent-prefetch calls cannot drift apart.
const meQueryOptions = () => queryOptions({
  ...queryPolicy.configuration,
  queryKey: queryKeys.me,
  queryFn: apiQuery<MeResponse>("/api/me"),
});
const automationQueryOptions = () => queryOptions({
  ...queryPolicy.live,
  queryKey: queryKeys.automation,
  queryFn: apiQuery<AutomationStats>("/api/dashboard/automation"),
});
const onboardingQueryOptions = () => queryOptions({
  ...queryPolicy.frequent,
  queryKey: queryKeys.onboarding,
  queryFn: apiQuery<OnboardingResponse>("/api/onboarding"),
});
const creditsQueryOptions = () => queryOptions({
  ...queryPolicy.frequent,
  queryKey: queryKeys.credits,
  queryFn: apiQuery<CreditsResponse>("/api/credits"),
});
const researchQueryOptions = () => queryOptions({
  ...queryPolicy.working,
  queryKey: queryKeys.research,
  queryFn: apiQuery<{ latest: ResearchRun | null; runs: ResearchRun[] }>("/api/research"),
});
const topicsQueryOptions = () => queryOptions({
  ...queryPolicy.working,
  queryKey: queryKeys.topics,
  queryFn: apiQuery<{ topics: Topic[]; sourceWeights?: Record<string, number> }>("/api/topics"),
});
const articlesQueryOptions = () => queryOptions({
  ...queryPolicy.working,
  queryKey: queryKeys.articles,
  queryFn: apiQuery<{ articles: Article[] }>("/api/articles"),
});
const activityQueryOptions = () => queryOptions({
  ...queryPolicy.live,
  queryKey: queryKeys.activity,
  queryFn: apiQuery<ActivityResponse>("/api/activity"),
});
const agentBriefQueryOptions = () => queryOptions({
  ...queryPolicy.snapshot,
  queryKey: queryKeys.agentBrief,
  queryFn: apiQuery<{ brief: AgentBrief }>("/api/dashboard/brief"),
});
const dashboardQueryOptions = () => queryOptions({
  ...queryPolicy.live,
  queryKey: queryKeys.dashboard,
  queryFn: apiQuery<DashboardData>("/api/dashboard"),
});
export const inboxQueryOptions = () => queryOptions({
  ...queryPolicy.live,
  queryKey: queryKeys.inbox,
  queryFn: apiQuery<InboxData>("/api/inbox"),
});
const agentStateQueryOptions = () => queryOptions({
  ...queryPolicy.live,
  queryKey: queryKeys.agentState,
  queryFn: apiQuery<AgentOperatingState>("/api/agent/state"),
});
const visibilitySummaryQueryOptions = () => queryOptions({
  ...queryPolicy.working,
  queryKey: queryKeys.visibilitySummary,
  queryFn: apiQuery<VisibilitySummary>("/api/visibility/summary"),
});
const visibilityFindingsQueryOptions = () => queryOptions({
  ...queryPolicy.working,
  queryKey: queryKeys.visibilityFindings,
  queryFn: apiQuery<{ findings: VisibilityFinding[] }>("/api/visibility/findings"),
});
const siteHealthQueryOptions = () => queryOptions({
  ...queryPolicy.snapshot,
  queryKey: queryKeys.siteHealth,
  queryFn: apiQuery<SiteHealthResponse>("/api/visibility/site-health"),
});
const visibilityAnswersQueryOptions = () => queryOptions({
  ...queryPolicy.working,
  queryKey: queryKeys.visibilityAnswers,
  queryFn: apiQuery<VisibilityAnswers>("/api/visibility/answers"),
});
const visibilityTrafficQueryOptions = () => queryOptions({
  ...queryPolicy.snapshot,
  queryKey: queryKeys.visibilityTraffic,
  // API returns the traffic payload at the top level (not wrapped in `{ data }`).
  queryFn: apiQuery<VisibilityTraffic>("/api/visibility/traffic"),
});

/** The minimal shape `<Section>` consumes; `combineQueries` produces it too. */
export type QueryLike<T> = {
  data: T | undefined;
  error: unknown;
  refetch: () => unknown;
};

// `infer D` greedily keeps the `| undefined` from `QueryLike.data`, so strip it
//: once `combineQueries` resolves, every element is guaranteed present.
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
  return useQuery(meQueryOptions());
}

/** Active brand id from the workspace bootstrap: null while `me` loads or the
 * workspace has no brand yet (mid-onboarding). */
export function useActiveBrandId(): string | null {
  return useQuery({
    ...meQueryOptions(),
    select: (data) => data.activeBrandId,
  }).data ?? null;
}

/**
 * Gate for brand-scoped queries. Every section endpoint 404s (`NO_BRAND`) when
 * the workspace has no brand: during onboarding of the first brand that's the
 * normal state, so brand-scoped hooks must not fire until a brand exists.
 */
function useHasBrand(): boolean {
  return Boolean(useActiveBrandId());
}

function seedIfOlder<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  data: T,
  updatedAt: number,
) {
  const currentUpdatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? 0;
  if (currentUpdatedAt < updatedAt) {
    queryClient.setQueryData(queryKey, data, { updatedAt });
  }
}

export function useDashboard(options: { enabled?: boolean } = {}) {
  const hasBrand = useHasBrand();
  const queryClient = useQueryClient();
  const query = useQuery({
    ...dashboardQueryOptions(),
    enabled: options.enabled !== false && hasBrand,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const lastRun = data.automation.lastRun?.status;
      if (
        data.setup.run?.status === "running" ||
        data.agent.presence.id === "working_now" ||
        lastRun === "running" ||
        lastRun === "pending"
      ) {
        return 8_000;
      }
      if (["paused", "scheduled", "on_duty"].includes(data.agent.presence.id)) {
        return 60_000;
      }
      return false;
    },
  });

  useEffect(() => {
    if (!query.data) return;
    const { agent, approvals, articles, findings, traffic, integrations, automation, inboxCount } =
      query.data;
    seedIfOlder<InboxData>(
      queryClient,
      queryKeys.inbox,
      {
        agent,
        approvals,
        articles,
        findings,
        traffic,
        integrations,
        automation,
        inboxCount,
      },
      query.dataUpdatedAt,
    );
    seedIfOlder(queryClient, queryKeys.agentState, agent, query.dataUpdatedAt);
    seedIfOlder(queryClient, queryKeys.automation, automation, query.dataUpdatedAt);
    seedIfOlder(queryClient, queryKeys.setupRun, query.data.setup, query.dataUpdatedAt);
    seedIfOlder(queryClient, queryKeys.integrations, { integrations }, query.dataUpdatedAt);
    seedIfOlder(queryClient, queryKeys.visibilityFindings, { findings }, query.dataUpdatedAt);
    seedIfOlder(queryClient, queryKeys.inboxSummary, { count: inboxCount }, query.dataUpdatedAt);
  }, [query.data, query.dataUpdatedAt, queryClient]);

  return query;
}

export function useInbox(options: { enabled?: boolean } = {}) {
  const hasBrand = useHasBrand();
  const queryClient = useQueryClient();
  const query = useQuery({
    ...inboxQueryOptions(),
    enabled: options.enabled !== false && hasBrand,
    refetchInterval: (query) =>
      query.state.data?.agent.presence.id === "working_now" ? 8_000 : false,
  });

  useEffect(() => {
    if (!query.data) return;
    const { agent, findings, integrations, automation, inboxCount } = query.data;
    seedIfOlder(queryClient, queryKeys.agentState, agent, query.dataUpdatedAt);
    seedIfOlder(queryClient, queryKeys.automation, automation, query.dataUpdatedAt);
    seedIfOlder(queryClient, queryKeys.integrations, { integrations }, query.dataUpdatedAt);
    seedIfOlder(queryClient, queryKeys.visibilityFindings, { findings }, query.dataUpdatedAt);
    seedIfOlder(queryClient, queryKeys.inboxSummary, { count: inboxCount }, query.dataUpdatedAt);
  }, [query.data, query.dataUpdatedAt, queryClient]);

  return query;
}

export function useAutomation() {
  return useQuery({
    ...automationQueryOptions(),
    enabled: useHasBrand(),
    // Soft-poll while her last daily run is still open so the status pill flips.
    refetchInterval: (q) => {
      const last = q.state.data?.lastRun?.status;
      return last === "running" || last === "pending" ? 8_000 : false;
    },
  });
}

/** AP3: Claudia's standing Overview brief, refreshed by the daily job. */
export type AgentBrief = { text: string; generatedAt: string };

export function useAgentBrief() {
  return useQuery({ ...agentBriefQueryOptions(), enabled: useHasBrand() });
}

export function useAgentState(enabled = true) {
  const hasBrand = useHasBrand();
  return useQuery({
    ...agentStateQueryOptions(),
    enabled: enabled && hasBrand,
    refetchInterval: (query) => {
      const presence = query.state.data?.presence.id;
      if (presence === "working_now") return 8_000;
      // Temporary owner pauses expire in durable memory; refresh without
      // requiring a navigation or focus change to show the resumed schedule.
      if (presence === "paused" || presence === "scheduled" || presence === "on_duty") {
        return 60_000;
      }
      return false;
    },
  });
}

export type AgentApprovalView = {
  id: string;
  taskId: string | null;
  actionType: string;
  resourceRef: string;
  beforeState: unknown;
  afterState: unknown;
  riskLevel: string;
  expectedBenefit: string;
  expiresAt: string | null;
  createdAt: string;
};

export type AgentActionView = {
  id: string;
  actionType: string;
  resourceRef: string;
  capability: string;
  beforeState: unknown;
  appliedChange: unknown;
  remoteRef: string | null;
  rollbackSupported: boolean;
  status: string;
  verificationStatus: string;
  verificationResult: unknown;
  createdAt: string;
  verifiedAt: string | null;
};

const agentActionsQueryOptions = () => queryOptions({
  ...queryPolicy.working,
  queryKey: queryKeys.agentActions,
  queryFn: apiQuery<{ actions: AgentActionView[] }>("/api/agent/actions"),
});

export function useAgentActions() {
  return useQuery({
    ...agentActionsQueryOptions(),
    enabled: useHasBrand(),
  });
}

export function useOnboarding() {
  return useQuery({ ...onboardingQueryOptions(), enabled: useHasBrand() });
}

const brandProfileQueryOptions = () => queryOptions({
  ...queryPolicy.configuration,
  queryKey: queryKeys.brandProfile,
  queryFn: apiQuery<{ profile: BrandProfile }>("/api/brand/profile"),
});

export function useBrandProfile() {
  return useQuery({
    ...brandProfileQueryOptions(),
    enabled: useHasBrand(),
  });
}

const brandIntelligenceQueryOptions = () => queryOptions({
  ...queryPolicy.snapshot,
  queryKey: queryKeys.brandIntelligence,
  queryFn: apiQuery<BrandIntelligenceResponse>("/api/brand/intelligence"),
});

export function useBrandIntelligence() {
  return useQuery({
    ...brandIntelligenceQueryOptions(),
    enabled: useHasBrand(),
  });
}

const competitorsQueryOptions = () => queryOptions({
  ...queryPolicy.configuration,
  queryKey: queryKeys.competitors,
  queryFn: apiQuery<{ competitors: Competitor[] }>("/api/brand/competitors"),
});

export function useCompetitors() {
  return useQuery({
    ...competitorsQueryOptions(),
    enabled: useHasBrand(),
  });
}

const brandUseCasesQueryOptions = () => queryOptions({
  ...queryPolicy.configuration,
  queryKey: queryKeys.useCases,
  queryFn: apiQuery<{ useCases: UseCase[] }>("/api/brand/use-cases"),
});

export function useUseCases() {
  return useQuery({
    ...brandUseCasesQueryOptions(),
    enabled: useHasBrand(),
  });
}

export function useTopics() {
  return useQuery({ ...topicsQueryOptions(), enabled: useHasBrand() });
}

export function useArticles() {
  return useQuery({ ...articlesQueryOptions(), enabled: useHasBrand() });
}

export function useArticle(id: string) {
  return useQuery({
    ...queryPolicy.working,
    queryKey: queryKeys.article(id),
    queryFn: ({ signal }) =>
      apiGet<{ article: Article; publications: Publication[] }>(`/api/articles/${id}`, { signal }),
    enabled: useHasBrand() && Boolean(id),
    // Keep the previously opened article on screen while the next one loads.
    placeholderData: keepPreviousData,
  });
}

export function activityHasInFlight(data: ActivityResponse | undefined): boolean {
  if (!data) return false;
  return (
    data.jobs.some((j) => j.status === "running" || j.status === "pending") ||
    data.runs.some((r) => r.status === "running" || r.status === "pending") ||
    data.competitors.some((c) => c.status === "running" || c.status === "pending")
  );
}

/**
 * Activity / work stream. Auto-polls every 8s while any job/run is in flight,
 * then stops: no permanent websocket needed for Phase 3.
 */
export function useActivity() {
  return useQuery({
    ...activityQueryOptions(),
    enabled: useHasBrand(),
    refetchInterval: (q) => (activityHasInFlight(q.state.data) ? 8_000 : false),
  });
}

/**
 * True when Setup is running or the activity feed shows in-flight work.
 * UI "live" chrome on the work stream. Uses the same signals as `getAgentPresence`.
 */
export function useAgentIsLive(): boolean {
  const setup = useSetupRun();
  const activity = useActivity();
  const automation = useAutomation();
  return isAgentLive({
    setupStatus: setup.data?.run?.status ?? null,
    automation: automation.data
      ? {
          enabled: automation.data.enabled,
          agentState: automation.data.agentState,
          lastRun: automation.data.lastRun,
        }
      : null,
    activityInFlight: activityHasInFlight(activity.data),
  });
}

/** Shell badge only: cheap count endpoint, not full article payloads. */
export function useInboxSummaryCount(enabled = true): number {
  const hasBrand = useHasBrand();
  const q = useQuery({
    ...queryPolicy.frequent,
    queryKey: queryKeys.inboxSummary,
    queryFn: apiQuery<{ count: number }>("/api/inbox/summary"),
    enabled: enabled && hasBrand,
  });
  return q.data?.count ?? 0;
}

/**
 * Shell status pill. Uses setup + automation only (cheap on every route).
 * Live work-stream chrome uses `useAgentIsLive` (includes activity poll).
 */
export function useAgentStatusLabel(): string | null {
  const setup = useSetupRun();
  const automation = useAutomation();
  return getAgentPresence({
    setupStatus: setup.data?.run?.status ?? null,
    automation: automation.data
      ? {
          enabled: automation.data.enabled,
          agentState: automation.data.agentState,
          lastRun: automation.data.lastRun,
        }
      : null,
    // lastRun running/pending is enough for shell; avoid activity poll site-wide.
    activityInFlight: false,
  })?.label ?? null;
}

export function useResearch() {
  return useQuery({ ...researchQueryOptions(), enabled: useHasBrand() });
}

const integrationsQueryOptions = () => queryOptions({
  ...queryPolicy.configuration,
  queryKey: queryKeys.integrations,
  queryFn: apiQuery<{ integrations: IntegrationView[] }>("/api/integrations"),
});

export function useIntegrations() {
  return useQuery({
    ...integrationsQueryOptions(),
    enabled: useHasBrand(),
  });
}

export type GoogleTrafficSourceState = {
  connected: boolean;
  siteUrl: string | null;
  propertyId: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
};

/** Status of the brand's Google traffic-proof connection (Search Console + GA4). */
export type GoogleTrafficStatus = {
  /** Whether the Connect button should be shown (no grant / missing scope). */
  needsConnect: boolean;
  /** The Google account is linked with the traffic-proof scopes. */
  granted: boolean;
  /** GSC sites the user can pick from (only populated before GSC is connected). */
  sites: { siteUrl: string; permissionLevel: string }[];
  gsc: GoogleTrafficSourceState;
  ga4: GoogleTrafficSourceState;
};

const googleTrafficQueryOptions = () => queryOptions({
  ...queryPolicy.configuration,
  queryKey: queryKeys.googleTraffic,
  queryFn: apiQuery<GoogleTrafficStatus>("/api/integrations/google"),
});

export function useGoogleTraffic() {
  return useQuery({
    ...googleTrafficQueryOptions(),
    enabled: useHasBrand(),
  });
}

export function useCredits() {
  return useQuery({ ...creditsQueryOptions(), enabled: useHasBrand() });
}

/** AP4: one fix category's effective autonomy level for the standing loop. */
export type AutonomyCategoryState = {
  category: string;
  label: string;
  level: 0 | 1 | 2;
  isOverride: boolean;
  defaultLevel: 0 | 1 | 2;
  verifiedLastCycle: number;
};

export type BrandAutonomyState = {
  mode: "FULL_AUTO" | "REVIEW";
  categories: AutonomyCategoryState[];
  lastRun: { message: string | null; at: string } | null;
};

/** AP5: one archived weekly report row. */
export type WeeklyReportRow = {
  id: string;
  weekStart: string;
  siteUrl: string;
  subject: string;
  emailedAt: string | null;
  createdAt: string;
  summary: {
    completedWork: number;
    publishedCount: number;
    answerMentions: number;
    visibilityScore: number | null;
    visibilityChangePercent: number | null;
  };
};

type WeeklyReportDetailRow = Omit<WeeklyReportRow, "summary" | "siteUrl">;

const reportsQueryOptions = () => queryOptions({
  ...queryPolicy.snapshot,
  queryKey: queryKeys.reports,
  queryFn: apiQuery<{ reports: WeeklyReportRow[] }>("/api/reports"),
});

export function useReports() {
  return useQuery({
    ...reportsQueryOptions(),
    enabled: useHasBrand(),
  });
}

export function useReport(id: string) {
  return useQuery({
    ...queryPolicy.immutable,
    queryKey: queryKeys.report(id),
    queryFn: ({ signal }) =>
      apiGet<{
        report: WeeklyReportDetailRow;
        lines: string[];
        story: {
          proof: {
            score: { current: number | null; baseline: number | null; delta: number } | null;
            firstWeek: boolean;
            answerShare: Array<{ engine: string; appeared: number; prompts: number }>;
            traffic: { clicks: number; prevClicks: number; aiReferrals: number } | null;
          };
          fixes: { applied: number; proposed: number; verified: number; awaiting: number; examples: string[] };
          content: {
            published: Array<{ title: string; externalUrl: string | null; thesis: string | null }>;
            performance: string[];
            nextWeek: Array<{ title: string; thesis: string | null }>;
            draftsAwaitingReview: number;
          };
          planChanges: string[];
        };
        ask: { what: string; href: string } | null;
      }>(`/api/reports/${id}`, { signal }),
    enabled: useHasBrand() && Boolean(id),
  });
}

export function useBrandAutonomy(brandId: string | null) {
  return useQuery({
    ...queryPolicy.configuration,
    queryKey: [...queryKeys.brandAutonomy, brandId] as const,
    queryFn: ({ signal }) =>
      apiGet<BrandAutonomyState>(`/api/brand/autonomy?brandId=${brandId}`, { signal }),
    enabled: Boolean(brandId),
  });
}

export type VisibilitySubScoreKey =
  | "citability"
  | "brand"
  | "eeat"
  | "technical"
  | "schema"
  | "platform";

/** Latest audit + its six sub-scores, the previous score (for the delta), and
 * the industry baseline: the payload behind the Overview visibility snapshot. */
export type VisibilitySummary = {
  hasAudit: boolean;
  latest: {
    id: string;
    overall: number | null;
    band: string | null;
    aiVisibility: number | null;
    businessType: string | null;
    completedAt: string | null;
    subScores: Record<VisibilitySubScoreKey, number | null>;
  } | null;
  previousOverall: number | null;
  baseline: { baseline: number | null; sample: number; scope: string };
};

export function useVisibilitySummary() {
  return useQuery({ ...visibilitySummaryQueryOptions(), enabled: useHasBrand() });
}

/** One open finding in the fix queue (V8.2). */
export type VisibilityFinding = {
  id: string;
  pillar: "seo" | "aeo" | "geo";
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  recommendation: string;
  fixCapability: "auto" | "artifact" | "guided" | null;
  fixPayload: unknown;
  proposedAt?: string | null;
};

export function useVisibilityFindings() {
  return useQuery({ ...visibilityFindingsQueryOptions(), enabled: useHasBrand() });
}

/** Site Health checklist (V9): freshest of last audit's snapshot vs a manual refresh. */
export type SiteHealthResponse = {
  hasData: boolean;
  snapshot: import("@/lib/visibility/site-health").SiteHealthSnapshot | null;
  lastAuditAt: string | null;
  refreshCooldownUntil: string | null;
  /** Manual rechecks the workspace has left this week (Claudia's weekly auto-check doesn't count). */
  refreshesLeft: number;
};

export function useSiteHealth() {
  return useQuery({ ...siteHealthQueryOptions(), enabled: useHasBrand() });
}

/** Share-of-answer per engine + the prompt × engine grid (V5.5). */
export type VisibilityAnswers = {
  prompts: { id: string; prompt: string; active: boolean }[];
  runs: {
    promptId: string;
    engine: string;
    brandMentioned: boolean;
    brandCited: boolean;
    mentions?: { name: string; mentioned: boolean; cited: boolean }[];
  }[];
  share: { engine: string; prompts: number; appeared: number; cited: number; share: number }[];
};

export function useVisibilityAnswers() {
  return useQuery({ ...visibilityAnswersQueryOptions(), enabled: useHasBrand() });
}

/** GSC clicks trend + per-engine AI referrals behind the proof panel (V6.6). */
export type VisibilityTraffic = {
  connected: { gsc: boolean; ga4: boolean };
  engines: string[];
  gsc: { date: string; clicks: number; impressions: number; position: number | null }[];
  aiReferrals: { date: string; byEngine: Record<string, number> }[];
  auditMarkers: { date: string; overall: number | null }[];
};

export function useVisibilityTraffic() {
  return useQuery({ ...visibilityTrafficQueryOptions(), enabled: useHasBrand() });
}

/** The rendered in-app report for one audit (V6.1). */
export type VisibilityReport = {
  model: {
    site: string;
    businessType: string | null;
    generatedAt: string;
    overall: number | null;
    band: string;
    aiVisibility: number | null;
    subScores: { key: string; label: string; score: number | null }[];
    platforms: { platform: string; score: number | null }[];
    severityCounts: Record<"critical" | "high" | "medium" | "low", number>;
    quickWins: {
      category: string;
      severity: "critical" | "high" | "medium" | "low";
      title: string;
      recommendation: string;
    }[];
    themes: {
      week: number;
      title: string;
      findings: {
        category: string;
        severity: "critical" | "high" | "medium" | "low";
        title: string;
        recommendation: string;
      }[];
    }[];
    impact: string;
  };
  markdown: string;
};

export function useVisibilityReport(auditId: string) {
  return useQuery({
    ...queryPolicy.immutable,
    queryKey: queryKeys.visibilityReport(auditId),
    queryFn: ({ signal }) =>
      apiGet<VisibilityReport>(`/api/visibility/${auditId}/report`, { signal }),
    enabled: useHasBrand() && Boolean(auditId),
  });
}

/** A finding persisted from a Toolbox run, as the tool page shows it. */
export type ToolRunFinding = {
  id: string;
  pillar: "seo" | "aeo" | "geo";
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  recommendation: string;
  isResolved: boolean;
};

/** Latest stored run of one Toolbox tool (V8.3): what the tool page opens on. */
export type ToolRunDetail = {
  id: string;
  score: number | null;
  input: string | null;
  data: unknown;
  createdAt: string;
  findings: ToolRunFinding[];
};

export function useToolRun(slug: string) {
  return useQuery({
    ...queryPolicy.working,
    queryKey: queryKeys.toolRun(slug),
    queryFn: ({ signal }) =>
      apiGet<{ run: ToolRunDetail | null }>(`/api/tools/${slug}`, { signal }),
    enabled: useHasBrand() && Boolean(slug),
  });
}

/** Latest run (score + time) per tool slug, for the Toolbox grid cards. */
export type ToolLatestRuns = Record<string, { score: number | null; createdAt: string }>;

const toolLatestRunsQueryOptions = () => queryOptions({
  ...queryPolicy.working,
  queryKey: queryKeys.toolLatestRuns,
  queryFn: apiQuery<{ latest: ToolLatestRuns }>("/api/tools"),
});

export function useToolLatestRuns() {
  return useQuery({
    ...toolLatestRunsQueryOptions(),
    enabled: useHasBrand(),
  });
}

export type SetupStepStatus = "pending" | "running" | "done" | "skipped" | "failed";
export type SetupStep = { key: string; status: SetupStepStatus; note?: string };
export type SetupRunResponse = {
  run: { id: string; status: string; steps: SetupStep[]; briefText?: string | null } | null;
  labels: Record<string, string>;
};

const setupRunQueryOptions = () => queryOptions({
  ...queryPolicy.live,
  queryKey: queryKeys.setupRun,
  queryFn: apiQuery<SetupRunResponse>("/api/setup-run"),
});

/** Claudia's one-time Setup Run: polled while running so the Overview hero can
 * show her steps checking off live. */
export function useSetupRun() {
  return useQuery({
    ...setupRunQueryOptions(),
    enabled: useHasBrand(),
    refetchInterval: (q) => (q.state.data?.run?.status === "running" ? 10_000 : false),
  });
}

/**
 * Whether Claudia's Setup Run is currently executing for the active brand.
 * Manual triggers that overlap her setup work (research, audits, article
 * generation, competitor discovery) disable themselves on this so the work
 * can't be duplicated while she's setting the brand up.
 */
export function useSetupInProgress(): boolean {
  const { data } = useSetupRun();
  return data?.run?.status === "running";
}

/**
 * Warm the exact queries a primary route mounts when the user shows navigation
 * intent. Fresh entries are skipped automatically by TanStack Query, so this
 * remains cheap when data is already cached.
 *
 * Dashboard and Inbox are hydrated by their Server Component routes and are
 * intentionally omitted here to avoid racing a duplicate browser request.
 */
export async function prefetchRouteQueries(
  queryClient: QueryClient,
  path: string,
  activeBrandId: string | null,
): Promise<void> {
  if (!activeBrandId) return;
  const pathname = path.split("?", 1)[0];

  switch (pathname) {
    case "/topics":
      await Promise.all([
        queryClient.prefetchQuery(topicsQueryOptions()),
        queryClient.prefetchQuery(creditsQueryOptions()),
        queryClient.prefetchQuery(setupRunQueryOptions()),
      ]);
      break;
    case "/articles":
      await Promise.all([
        queryClient.prefetchQuery(articlesQueryOptions()),
        queryClient.prefetchQuery(topicsQueryOptions()),
      ]);
      break;
    case "/visibility":
      await Promise.all([
        queryClient.prefetchQuery(visibilitySummaryQueryOptions()),
        queryClient.prefetchQuery(visibilityTrafficQueryOptions()),
        queryClient.prefetchQuery(setupRunQueryOptions()),
      ]);
      break;
    case "/reports":
      await queryClient.prefetchQuery(reportsQueryOptions());
      break;
    case "/activity":
      await Promise.all([
        queryClient.prefetchQuery(activityQueryOptions()),
        queryClient.prefetchQuery(setupRunQueryOptions()),
        queryClient.prefetchQuery(automationQueryOptions()),
      ]);
      break;
    case "/tools":
      await Promise.all([
        queryClient.prefetchQuery(topicsQueryOptions()),
        queryClient.prefetchQuery(visibilitySummaryQueryOptions()),
        queryClient.prefetchQuery(toolLatestRunsQueryOptions()),
        queryClient.prefetchQuery(activityQueryOptions()),
      ]);
      break;
    case "/settings":
      await Promise.all([
        queryClient.prefetchQuery(brandProfileQueryOptions()),
        queryClient.prefetchQuery(brandIntelligenceQueryOptions()),
        queryClient.prefetchQuery(competitorsQueryOptions()),
        queryClient.prefetchQuery(brandUseCasesQueryOptions()),
        queryClient.prefetchQuery(automationQueryOptions()),
        queryClient.prefetchQuery(agentStateQueryOptions()),
        queryClient.prefetchQuery(agentActionsQueryOptions()),
        queryClient.prefetchQuery(integrationsQueryOptions()),
        queryClient.prefetchQuery(googleTrafficQueryOptions()),
      ]);
      break;
    case "/account":
      await queryClient.prefetchQuery(creditsQueryOptions());
      break;
  }
}
