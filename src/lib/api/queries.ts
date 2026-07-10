"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getAgentPresence, isAgentLive } from "@/lib/agent/presence";
import type { AgentState as AgentOperatingState } from "@/lib/agent/types";
import { apiGet } from "@/lib/api/fetcher";
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

/** Central query keys so mutations can invalidate the right caches. */
export const queryKeys = {
  me: ["me"] as const,
  automation: ["dashboard", "automation"] as const,
  agentBrief: ["dashboard", "brief"] as const,
  agentState: ["agent", "state"] as const,
  agentApprovals: ["agent", "approvals"] as const,
  agentActions: ["agent", "actions"] as const,
  onboarding: ["onboarding"] as const,
  brands: ["brands"] as const,
  brandProfile: ["brand", "profile"] as const,
  competitors: ["brand", "competitors"] as const,
  useCases: ["brand", "use-cases"] as const,
  topics: ["topics"] as const,
  articles: ["articles"] as const,
  article: (id: string) => ["articles", id] as const,
  activity: ["activity"] as const,
  research: ["research"] as const,
  integrations: ["integrations"] as const,
  googleTraffic: ["integrations", "google"] as const,
  brandAutonomy: ["brand", "autonomy"] as const,
  reports: ["reports"] as const,
  report: (id: string) => ["reports", id] as const,
  credits: ["credits"] as const,
  visibilitySummary: ["visibility", "summary"] as const,
  visibilityFindings: ["visibility", "findings"] as const,
  siteHealth: ["visibility", "site-health"] as const,
  visibilityAnswers: ["visibility", "answers"] as const,
  visibilityTraffic: ["visibility", "traffic"] as const,
  visibilityReport: (auditId: string) => ["visibility", "report", auditId] as const,
  setupRun: ["setup-run"] as const,
  toolLatestRuns: ["tools", "latest"] as const,
  toolRun: (slug: string) => ["tools", "run", slug] as const,
  inboxSummary: ["inbox", "summary"] as const,
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
  brands: { id: string; name: string; autonomyMode: string; badgePublic: boolean }[];
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
  /** C4 — the next topic she'll write and its traffic thesis. */
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
  /** Full body — present on detail GET; empty/absent on list. */
  bodyMarkdown: string;
  /** char_length of body from list endpoint (list omits bodyMarkdown payload). */
  bodyLength?: number;
  status: string;
  version: number;
  shape: string | null;
  gateResultsJson: string | null;
  updatedAt: string;
  createdAt: string;
  /** C4 — latest performance checkpoint verdict, when one has run. */
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
  queryFn: () => apiGet<{ topics: Topic[]; sourceWeights?: Record<string, number> }>("/api/topics"),
});
const articlesQueryOptions = () => ({
  queryKey: queryKeys.articles,
  queryFn: () => apiGet<{ articles: Article[] }>("/api/articles"),
});
const activityQueryOptions = () => ({
  queryKey: queryKeys.activity,
  queryFn: () => apiGet<ActivityResponse>("/api/activity"),
});
const agentBriefQueryOptions = () => ({
  queryKey: queryKeys.agentBrief,
  queryFn: () => apiGet<{ brief: AgentBrief }>("/api/dashboard/brief"),
});
const agentStateQueryOptions = () => ({
  queryKey: queryKeys.agentState,
  queryFn: () => apiGet<AgentOperatingState>("/api/agent/state"),
});
const visibilitySummaryQueryOptions = () => ({
  queryKey: queryKeys.visibilitySummary,
  queryFn: () => apiGet<VisibilitySummary>("/api/visibility/summary"),
});
const visibilityFindingsQueryOptions = () => ({
  queryKey: queryKeys.visibilityFindings,
  queryFn: () => apiGet<{ findings: VisibilityFinding[] }>("/api/visibility/findings"),
});
const siteHealthQueryOptions = () => ({
  queryKey: queryKeys.siteHealth,
  queryFn: () => apiGet<SiteHealthResponse>("/api/visibility/site-health"),
});
const visibilityAnswersQueryOptions = () => ({
  queryKey: queryKeys.visibilityAnswers,
  queryFn: () => apiGet<VisibilityAnswers>("/api/visibility/answers"),
});
const visibilityTrafficQueryOptions = () => ({
  queryKey: queryKeys.visibilityTraffic,
  // API returns the traffic payload at the top level (not wrapped in `{ data }`).
  queryFn: () => apiGet<VisibilityTraffic>("/api/visibility/traffic"),
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

/** Active brand id from the workspace bootstrap — null while `me` loads or the
 * workspace has no brand yet (mid-onboarding). */
export function useActiveBrandId(): string | null {
  return useMe().data?.activeBrandId ?? null;
}

/**
 * Gate for brand-scoped queries. Every section endpoint 404s (`NO_BRAND`) when
 * the workspace has no brand — during onboarding of the first brand that's the
 * normal state, so brand-scoped hooks must not fire until a brand exists.
 */
function useHasBrand(): boolean {
  return Boolean(useActiveBrandId());
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

/** AP3 — Claudia's standing Overview brief, refreshed by the daily job. */
export type AgentBrief = { text: string; generatedAt: string };

export function useAgentBrief() {
  return useQuery({ ...agentBriefQueryOptions(), enabled: useHasBrand() });
}

export function useAgentState() {
  return useQuery({
    ...agentStateQueryOptions(),
    enabled: useHasBrand(),
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

export function useAgentApprovals() {
  return useQuery({
    queryKey: queryKeys.agentApprovals,
    queryFn: () => apiGet<{ approvals: AgentApprovalView[] }>("/api/agent/approvals"),
    enabled: useHasBrand(),
  });
}

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

export function useAgentActions() {
  return useQuery({
    queryKey: queryKeys.agentActions,
    queryFn: () => apiGet<{ actions: AgentActionView[] }>("/api/agent/actions"),
    enabled: useHasBrand(),
  });
}

export function useOnboarding() {
  return useQuery({ ...onboardingQueryOptions(), enabled: useHasBrand() });
}

export function useBrandProfile() {
  return useQuery({
    queryKey: queryKeys.brandProfile,
    queryFn: () => apiGet<{ profile: BrandProfile }>("/api/brand/profile"),
    enabled: useHasBrand(),
  });
}

export function useCompetitors() {
  return useQuery({
    queryKey: queryKeys.competitors,
    queryFn: () => apiGet<{ competitors: Competitor[] }>("/api/brand/competitors"),
    enabled: useHasBrand(),
  });
}

export function useUseCases() {
  return useQuery({
    queryKey: queryKeys.useCases,
    queryFn: () => apiGet<{ useCases: UseCase[] }>("/api/brand/use-cases"),
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
    queryKey: queryKeys.article(id),
    queryFn: () =>
      apiGet<{ article: Article; publications: Publication[] }>(`/api/articles/${id}`),
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
 * then stops — no permanent websocket needed for Phase 3.
 */
export function useActivity() {
  return useQuery({
    ...activityQueryOptions(),
    enabled: useHasBrand(),
    refetchInterval: (q) => (activityHasInFlight(q.state.data) ? 8_000 : false),
  });
}

/**
 * True when Setup is running or the activity feed shows in-flight work —
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

/** Combined inbox data for home + /inbox — one place to update inputs. */
export function useInboxData() {
  const articles = useArticles();
  const findings = useVisibilityFindings();
  const traffic = useVisibilityTraffic();
  const integrations = useIntegrations();
  const automation = useAutomation();
  return {
    articles,
    findings,
    traffic,
    integrations,
    automation,
    combined: combineQueries(articles, findings, traffic, integrations, automation),
  };
}

/** Shell badge only — cheap count endpoint, not full article payloads. */
export function useInboxSummaryCount(): number {
  const q = useQuery({
    queryKey: queryKeys.inboxSummary,
    queryFn: () => apiGet<{ count: number }>("/api/inbox/summary"),
    enabled: useHasBrand(),
    staleTime: 30_000,
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
    queryClient.prefetchQuery(agentBriefQueryOptions());
    queryClient.prefetchQuery(agentStateQueryOptions());
    queryClient.prefetchQuery(onboardingQueryOptions());
    queryClient.prefetchQuery(researchQueryOptions());
    queryClient.prefetchQuery(visibilitySummaryQueryOptions());
    // Visibility pages, so sidebar navigation renders instantly from cache.
    queryClient.prefetchQuery(visibilityFindingsQueryOptions());
    queryClient.prefetchQuery(siteHealthQueryOptions());
    queryClient.prefetchQuery(visibilityAnswersQueryOptions());
    queryClient.prefetchQuery(visibilityTrafficQueryOptions());
    // Shared across pages.
    queryClient.prefetchQuery(topicsQueryOptions());
    queryClient.prefetchQuery(articlesQueryOptions());
    queryClient.prefetchQuery(activityQueryOptions());
  }, [enabled, queryClient]);
}

export function useResearch() {
  return useQuery({ ...researchQueryOptions(), enabled: useHasBrand() });
}

export function useIntegrations() {
  return useQuery({
    queryKey: queryKeys.integrations,
    queryFn: () => apiGet<{ integrations: IntegrationView[] }>("/api/integrations"),
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

export function useGoogleTraffic() {
  return useQuery({
    queryKey: queryKeys.googleTraffic,
    queryFn: () => apiGet<GoogleTrafficStatus>("/api/integrations/google"),
    enabled: useHasBrand(),
  });
}

export function useCredits() {
  return useQuery({ ...creditsQueryOptions(), enabled: useHasBrand() });
}

/** AP4 — one fix category's effective autonomy level for the standing loop. */
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

/** AP5 — one archived weekly report row. */
export type WeeklyReportRow = {
  id: string;
  weekStart: string;
  subject: string;
  emailedAt: string | null;
  createdAt: string;
};

export function useReports() {
  return useQuery({
    queryKey: queryKeys.reports,
    queryFn: () => apiGet<{ reports: WeeklyReportRow[] }>("/api/reports"),
    enabled: useHasBrand(),
  });
}

export function useReport(id: string) {
  return useQuery({
    queryKey: queryKeys.report(id),
    queryFn: () =>
      apiGet<{
        report: WeeklyReportRow;
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
      }>(`/api/reports/${id}`),
    enabled: useHasBrand() && Boolean(id),
  });
}

export function useBrandAutonomy(brandId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.brandAutonomy, brandId] as const,
    queryFn: () => apiGet<BrandAutonomyState>(`/api/brand/autonomy?brandId=${brandId}`),
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
 * the industry baseline — the payload behind the Overview visibility snapshot. */
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

/** Site Health checklist (V9) — freshest of last audit's snapshot vs a manual refresh. */
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
    overall: number | null;
    band: string;
    aiVisibility: number | null;
    subScores: { key: string; label: string; score: number | null }[];
    platforms: { platform: string; score: number | null }[];
    quickWins: { title: string; recommendation: string }[];
    themes: {
      week: number;
      title: string;
      findings: { title: string; recommendation: string }[];
    }[];
    impact: string;
  };
  markdown: string;
};

export function useVisibilityReport(auditId: string) {
  return useQuery({
    queryKey: queryKeys.visibilityReport(auditId),
    queryFn: () => apiGet<VisibilityReport>(`/api/visibility/${auditId}/report`),
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

/** Latest stored run of one Toolbox tool (V8.3) — what the tool page opens on. */
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
    queryKey: queryKeys.toolRun(slug),
    queryFn: () => apiGet<{ run: ToolRunDetail | null }>(`/api/tools/${slug}`),
    enabled: useHasBrand() && Boolean(slug),
  });
}

/** Latest run (score + time) per tool slug, for the Toolbox grid cards. */
export type ToolLatestRuns = Record<string, { score: number | null; createdAt: string }>;

export function useToolLatestRuns() {
  return useQuery({
    queryKey: queryKeys.toolLatestRuns,
    queryFn: () => apiGet<{ latest: ToolLatestRuns }>("/api/tools"),
    enabled: useHasBrand(),
  });
}

export type SetupStepStatus = "pending" | "running" | "done" | "skipped" | "failed";
export type SetupStep = { key: string; status: SetupStepStatus; note?: string };
export type SetupRunResponse = {
  run: { id: string; status: string; steps: SetupStep[]; briefText?: string | null } | null;
  labels: Record<string, string>;
};

/** Claudia's one-time Setup Run — polled while running so the Overview hero can
 * show her steps checking off live. */
export function useSetupRun() {
  return useQuery({
    queryKey: queryKeys.setupRun,
    queryFn: () => apiGet<SetupRunResponse>("/api/setup-run"),
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
