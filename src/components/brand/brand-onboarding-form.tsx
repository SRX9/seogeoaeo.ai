"use client";

import { Alert, Button, Card, Input, Label, ListBox, Select, TextArea } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import posthog from "posthog-js";
import { ClaudiaActivationScreen } from "@/components/brand/claudia-activation-screen";
import {
  OnboardingDiscovery,
  type DiscoveryStage,
} from "@/components/brand/onboarding-discovery";
import {
  OnboardingExitDialog,
  useOnboardingExitGuard,
} from "@/components/brand/onboarding-exit-guard";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArticlesIcon,
  ChartBarIcon,
  CheckIcon,
  ClaudiaIcon,
  GaugeIcon,
  GlobeIcon,
  LayersIcon,
  SearchIcon,
  UsersIcon,
  XIcon,
} from "@/components/icons";
import { LoadingButton } from "@/components/ui/loading-button";
import { apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys, useMe, type MeResponse } from "@/lib/api/queries";
import { isActiveSubscription, plans, type PlanId } from "@/lib/billing/plans";
import { MAX_COMPETITORS } from "@/lib/brand/schemas";
import { useBfcacheReset } from "@/lib/hooks/use-bfcache-reset";
import { useCheckoutConfirm } from "@/lib/hooks/use-checkout-confirm";
import {
  DEFAULT_FIRST_OUTCOME,
  FIRST_OUTCOME_IDS,
  type FirstOutcomeId,
} from "@/lib/onboarding/first-outcome";

type Competitor = { name: string; url: string; reason?: string };
type DiscoveredUseCase = { job: string; persona: string; industry: string | null };

type Fields = {
  name: string;
  website: string;
  productDescription: string;
  audience: string;
  customerOutcomes: string;
  tone: string;
  seedKeywords: string;
  competitors: Competitor[];
  firstOutcome: FirstOutcomeId;
};

type BrandCreatePayload = {
  name: string;
  website: string;
  productDescription: string;
  audience: string;
  tone: string;
  seedKeywords: string;
  competitors: Array<{ name: string; url: string }>;
  useCases: Array<{ job: string; persona: string; industry: string }>;
  autonomyMode: "FULL_AUTO";
  firstOutcome: FirstOutcomeId;
  resumeExisting?: boolean;
  checkoutSessionId?: string;
};

const INITIAL_FIELDS: Fields = {
  name: "",
  website: "",
  productDescription: "",
  audience: "",
  customerOutcomes: "",
  tone: "",
  seedKeywords: "",
  competitors: [],
  firstOutcome: DEFAULT_FIRST_OUTCOME,
};

const STEPS = [
  {
    title: "Where should Claudia start?",
    description: "Share your website. Claudia will learn the rest before asking you to confirm it.",
  },
  {
    title: "Here is what Claudia understood",
    description: "Correct anything important. You can change these details later in Settings.",
  },
  {
    title: "What should Claudia improve first?",
    description: "Choose the first priority. Claudia will still support the other outcomes as she works.",
  },
] as const;

const OUTCOMES: ReadonlyArray<{
  id: FirstOutcomeId;
  title: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  recommended?: boolean;
}> = [
  {
    id: "discovery",
    title: "Get discovered by more customers",
    description: "Find the strongest opportunities across search and AI answers.",
    Icon: SearchIcon,
    recommended: true,
  },
  {
    id: "consistent_content",
    title: "Publish useful content consistently",
    description: "Build a steady flow of useful, brand-grounded content.",
    Icon: ArticlesIcon,
  },
  {
    id: "priority_keywords",
    title: "Improve priority keyword performance",
    description: "Focus first on the search themes that matter most to your business.",
    Icon: ChartBarIcon,
  },
  {
    id: "ai_answers",
    title: "Appear more often in AI answers",
    description: "Improve the evidence and coverage AI assistants can cite.",
    Icon: ClaudiaIcon,
  },
  {
    id: "website_health",
    title: "Improve website search health",
    description: "Find important access, speed, metadata, and schema issues.",
    Icon: GaugeIcon,
  },
];

const DRAFT_KEY = "claudia:onboarding-v3-draft";
const LEGACY_DRAFT_KEY = "claudia:onboarding-v2-draft";
const POPULAR_PLAN: PlanId = "startup";
const BRAND_CREATE_TIMEOUT_MS = 30_000;

type Draft = { fields: Fields; moment: number; checkoutSessionId?: string | null };
type Bootstrap = {
  fields: Fields;
  moment: number;
  phase: "form" | "finalizing";
  checkoutSessionId: string | null;
  error: string | null;
  cleanUrl: boolean;
};

const subscribeToClient = () => () => undefined;

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeFields(value: unknown): Fields {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const legacyUseCases = Array.isArray(candidate.useCases) ? candidate.useCases : [];
  const competitors = Array.isArray(candidate.competitors)
    ? candidate.competitors.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const entry = item as Record<string, unknown>;
        const name = stringValue(entry.name);
        const url = stringValue(entry.url);
        return name && url ? [{ name, url, reason: stringValue(entry.reason) }] : [];
      })
    : [];
  const storedOutcome = stringValue(candidate.firstOutcome);
  const firstOutcome = FIRST_OUTCOME_IDS.includes(storedOutcome as FirstOutcomeId)
    ? (storedOutcome as FirstOutcomeId)
    : DEFAULT_FIRST_OUTCOME;
  const legacyOutcomes = legacyUseCases
    .flatMap((item) =>
      item && typeof item === "object" ? [stringValue((item as Record<string, unknown>).job)] : [],
    )
    .filter(Boolean)
    .join("\n");

  return {
    ...INITIAL_FIELDS,
    name: stringValue(candidate.name),
    website: stringValue(candidate.website),
    productDescription: stringValue(candidate.productDescription),
    audience: stringValue(candidate.audience),
    customerOutcomes: stringValue(candidate.customerOutcomes) || legacyOutcomes,
    tone: stringValue(candidate.tone),
    seedKeywords: stringValue(candidate.seedKeywords),
    competitors: competitors.slice(0, MAX_COMPETITORS),
    firstOutcome,
  };
}

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY) ?? localStorage.getItem(LEGACY_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Record<string, unknown>;
    return {
      fields: normalizeFields(draft.fields),
      moment: typeof draft.moment === "number" ? draft.moment : 0,
      checkoutSessionId:
        typeof draft.checkoutSessionId === "string" ? draft.checkoutSessionId : null,
    };
  } catch {
    return null;
  }
}

function saveDraft(draft: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // A blocked storage layer only disables checkout-return resume.
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(LEGACY_DRAFT_KEY);
  } catch {
    // No-op.
  }
}

function readBootstrap(): Bootstrap {
  const draft = loadDraft();
  const params = new URLSearchParams(window.location.search);
  const checkout = params.get("checkout");
  const sessionId = params.get("session_id");
  const checkoutSessionId = sessionId ?? draft?.checkoutSessionId ?? null;
  const finalizing = checkout === "success" || (!checkout && Boolean(checkoutSessionId));
  const canceled = checkout === "canceled";

  return {
    fields: draft?.fields ?? INITIAL_FIELDS,
    moment: canceled ? 2 : Math.min(2, Math.max(0, draft?.moment ?? 0)),
    phase: finalizing ? "finalizing" : "form",
    checkoutSessionId,
    error: canceled ? "Checkout was canceled. Your setup is still saved." : null,
    cleanUrl: checkout === "success" || canceled,
  };
}

function isValidUrl(value: string) {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function inferredName(website: string) {
  try {
    const label = new URL(website).hostname.replace(/^www\./, "").split(".")[0] ?? "";
    return label
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch {
    return "";
  }
}

function buildPayload(fields: Fields): BrandCreatePayload {
  const persona = fields.audience.trim() || "Customer";
  return {
    name: fields.name.trim(),
    website: fields.website.trim(),
    productDescription: fields.productDescription.trim(),
    audience: fields.audience.trim(),
    tone: fields.tone.trim(),
    seedKeywords: fields.seedKeywords.trim(),
    competitors: fields.competitors.map(({ name, url }) => ({ name, url })),
    useCases: fields.customerOutcomes
      .split("\n")
      .map((job) => job.trim())
      .filter(Boolean)
      .slice(0, 24)
      .map((job) => ({ job, persona, industry: "" })),
    autonomyMode: "FULL_AUTO",
    firstOutcome: fields.firstOutcome,
  };
}

async function discoverBrand(
  name: string,
  website: string,
  onStageChange: (stage: DiscoveryStage) => void,
) {
  let profile = { productDescription: "", audience: "", tone: "", seedKeywords: "" };
  try {
    const result = await apiPost<{ profile: typeof profile }>("/api/brand/prefill", {
      name,
      website,
    });
    profile = result.profile;
  } catch {
    // Every inferred field remains editable when enrichment is unavailable.
  }

  onStageChange("opportunities");
  const [competitors, useCases] = await Promise.all([
    apiPost<{ suggestions: Competitor[] }>("/api/brand/competitors/preview", {
      name,
      website,
      productDescription: profile.productDescription,
      seedKeywords: profile.seedKeywords,
    }).catch(() => ({ suggestions: [] })),
    apiPost<{ useCases: DiscoveredUseCase[] }>("/api/brand/use-cases/preview", {
      name,
      website,
      productDescription: profile.productDescription,
      audience: profile.audience,
      seedKeywords: profile.seedKeywords,
    }).catch(() => ({ useCases: [] })),
  ]);

  return {
    profile,
    competitors: competitors.suggestions.slice(0, MAX_COMPETITORS),
    customerOutcomes: useCases.useCases
      .flatMap((item) => (item.job ? [item.job] : []))
      .join("\n"),
  };
}

export function BrandOnboardingForm({ showDashboardEscape = false }: { showDashboardEscape?: boolean }) {
  const isClient = useSyncExternalStore(subscribeToClient, () => true, () => false);
  if (!isClient) {
    return (
      <CenteredFrame>
        <p className="text-sm text-muted">Preparing Claudia setup&hellip;</p>
      </CenteredFrame>
    );
  }
  return <BrandOnboardingClient showDashboardEscape={showDashboardEscape} />;
}

function BrandOnboardingClient({ showDashboardEscape }: { showDashboardEscape: boolean }) {
  const [bootstrap] = useState(readBootstrap);
  const router = useProgressRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const subscribed = isActiveSubscription(me.data?.subscription?.status);
  const [moment, setMoment] = useState(bootstrap.moment);
  const [fields, setFields] = useState<Fields>(bootstrap.fields);
  const [manualCompetitor, setManualCompetitor] = useState({ name: "", url: "" });
  const [error, setError] = useState<string | null>(bootstrap.error);
  const [phase, setPhase] = useState<"form" | "finalizing">(bootstrap.phase);
  const checkoutSessionId = bootstrap.checkoutSessionId;
  const [checkoutLoading, setCheckoutLoading] = useState<PlanId | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>(POPULAR_PLAN);
  const [discoveryStage, setDiscoveryStage] = useState<DiscoveryStage>("brand");
  const [finalizeTimedOut, setFinalizeTimedOut] = useState(false);
  const finalizeStarted = useRef(false);
  const isFirstBrand = (me.data?.brands.length ?? 0) === 0;
  const {
    isOpen: isExitDialogOpen,
    open: openExitDialog,
    stay: stayInOnboarding,
    disarm: disarmExitGuard,
    rearm: rearmExitGuard,
    release: releaseExitGuard,
    leave: leaveOnboarding,
  } = useOnboardingExitGuard({
    active: phase === "form",
    fallbackHref: showDashboardEscape ? "/dashboard" : "/",
  });

  useBfcacheReset(() => setCheckoutLoading(null));

  const discover = useMutation({
    mutationFn: ({ name, website }: { name: string; website: string }) =>
      discoverBrand(name, website, setDiscoveryStage),
    onSuccess: (result) => {
      setFields((current) => ({
        ...current,
        productDescription: result.profile.productDescription,
        audience: result.profile.audience,
        tone: result.profile.tone,
        seedKeywords: result.profile.seedKeywords,
        competitors: result.competitors,
        customerOutcomes: result.customerOutcomes,
      }));
      setMoment(1);
    },
    onError: () => {
      setError("Claudia could not read the site yet. Add what you know and continue.");
      setMoment(1);
    },
  });

  const create = useMutation({
    mutationFn: (payload: BrandCreatePayload) =>
      apiPost<{ brand: { id: string; name: string }; canIgnite: boolean }>(
        "/api/brands",
        payload,
        { signal: AbortSignal.timeout(BRAND_CREATE_TIMEOUT_MS) },
      ),
    onSuccess: async ({ brand, canIgnite }) => {
      clearDraft();
      queryClient.setQueryData<MeResponse>(queryKeys.me, (current) =>
        current
          ? {
              ...current,
              brands: current.brands.some((item) => item.id === brand.id)
                ? current.brands
                : [
                    ...current.brands,
                    {
                      id: brand.id,
                      name: brand.name,
                      autonomyMode: "FULL_AUTO",
                      badgePublic: false,
                      identity: null,
                    },
                  ],
              activeBrandId: brand.id,
            }
          : current,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentState });
      void queryClient.invalidateQueries({ queryKey: queryKeys.integrations });
      await releaseExitGuard();
      router.replace(canIgnite ? "/dashboard" : "/settings?tab=billing&next=ignition");
    },
    onError: (failure) => {
      rearmExitGuard();
      setError(
        getErrorMessage(
          failure,
          "Claudia could not finish setup. Your payment and saved answers are safe.",
        ),
      );
    },
  });

  const submitCreate = useCallback(() => {
    if (!fields.name.trim()) {
      setError("Add the brand name Claudia should use.");
      setPhase("form");
      setMoment(1);
      return;
    }
    setError(null);
    posthog.capture("brand_activation_started", {
      first_outcome: fields.firstOutcome,
      is_checkout_finalization: phase === "finalizing",
    });
    disarmExitGuard();
    create.mutate({
      ...buildPayload(fields),
      resumeExisting: phase === "finalizing",
      checkoutSessionId: phase === "finalizing" ? checkoutSessionId ?? undefined : undefined,
    });
  }, [checkoutSessionId, create, disarmExitGuard, fields, phase]);

  useEffect(() => {
    if (phase === "finalizing" && checkoutSessionId) {
      saveDraft({ fields, moment, checkoutSessionId });
    } else if (phase === "form") {
      saveDraft({ fields, moment });
    }
  }, [checkoutSessionId, fields, moment, phase]);

  useEffect(() => {
    if (bootstrap.cleanUrl) window.history.replaceState(null, "", "/onboarding");
  }, [bootstrap.cleanUrl]);

  const refetchMe = me.refetch;
  const checkoutConfirm = useCheckoutConfirm({
    sessionId: checkoutSessionId,
    enabled: phase === "finalizing" && !subscribed,
    onSettled: () => void refetchMe(),
  });

  useEffect(() => {
    if (phase !== "finalizing" || subscribed) return;
    const poll = window.setInterval(() => void refetchMe(), 2_500);
    const timeout = window.setTimeout(() => setFinalizeTimedOut(true), 45_000);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(timeout);
    };
  }, [phase, refetchMe, subscribed]);

  useEffect(() => {
    if (phase === "finalizing" && subscribed && !finalizeStarted.current) {
      finalizeStarted.current = true;
      submitCreate();
    }
  }, [phase, submitCreate, subscribed]);

  function beginDiscovery() {
    const website = fields.website.trim();
    if (!isValidUrl(website)) {
      setError("Enter a full website URL, including https://");
      return;
    }
    const name = fields.name.trim() || inferredName(website);
    if (!name) {
      setError("Claudia could not infer a brand name from that address.");
      return;
    }
    setError(null);
    posthog.capture("onboarding_discovery_started");
    setDiscoveryStage("brand");
    setFields((current) => ({ ...current, name, website }));
    discover.mutate({ name, website });
  }

  async function startCheckout(planId: PlanId) {
    setError(null);
    setCheckoutLoading(planId);
    disarmExitGuard();
    saveDraft({ fields, moment: 2, checkoutSessionId: null });
    try {
      const result = await apiPost<{ url: string }>("/api/billing/checkout", {
        planId,
        returnTo: "onboarding",
      });
      await releaseExitGuard();
      window.location.href = result.url;
    } catch (failure) {
      rearmExitGuard();
      setError(getErrorMessage(failure, "Could not start checkout."));
      setCheckoutLoading(null);
    }
  }

  function addCompetitor() {
    const name = manualCompetitor.name.trim();
    const url = manualCompetitor.url.trim();
    if (!name || !isValidUrl(url)) {
      setError("Add a competitor name and full URL.");
      return;
    }
    setError(null);
    setFields((current) => ({
      ...current,
      competitors: current.competitors.some((item) => item.url === url)
        ? current.competitors
        : [...current.competitors, { name, url }].slice(0, MAX_COMPETITORS),
    }));
    setManualCompetitor({ name: "", url: "" });
  }

  if (phase === "finalizing") {
    const activationFailed = create.isError;
    const confirmationFailed = Boolean(me.error) && !subscribed;
    const needsRetry = activationFailed || confirmationFailed || finalizeTimedOut;
    return (
      <ClaudiaActivationScreen
        brandName={fields.name}
        subscribed={subscribed}
        isCreating={create.isPending}
        needsRetry={needsRetry}
        errorMessage={
          error ??
          "We could not confirm the latest account state. Your payment and saved answers are safe."
        }
        onRetry={() => {
          setError(null);
          setFinalizeTimedOut(false);
          if (activationFailed) submitCreate();
          else {
            checkoutConfirm.reset();
            void refetchMe();
          }
        }}
        onExit={() => {
          saveDraft({ fields, moment, checkoutSessionId });
          router.replace(showDashboardEscape ? "/dashboard" : "/");
        }}
      />
    );
  }

  if (discover.isPending) {
    return (
      <div className="min-h-dvh bg-background px-5 sm:px-8">
        <OnboardingDiscovery
          brandName={fields.name}
          website={fields.website}
          stage={discoveryStage}
        />
      </div>
    );
  }

  return (
    <OnboardingFormShell
      moment={moment}
      fields={fields}
      setFields={setFields}
      error={error}
      busy={create.isPending || checkoutLoading !== null}
      createPending={create.isPending}
      checkoutPending={checkoutLoading !== null}
      subscribed={subscribed}
      selectedPlanId={selectedPlanId}
      setSelectedPlanId={setSelectedPlanId}
      manualCompetitor={manualCompetitor}
      setManualCompetitor={setManualCompetitor}
      isExitDialogOpen={isExitDialogOpen}
      isFirstBrand={isFirstBrand}
      onExit={openExitDialog}
      onStay={stayInOnboarding}
      onLeave={() => void leaveOnboarding()}
      onBeginDiscovery={beginDiscovery}
      onAddCompetitor={addCompetitor}
      onBack={() => {
        setError(null);
        setMoment((value) => Math.max(0, value - 1));
      }}
      onConfirm={() => {
        if (!fields.name.trim()) {
          setError("Add the brand name Claudia should use.");
          return;
        }
        setError(null);
        setMoment(2);
      }}
      onSubmit={submitCreate}
      onCheckout={() => void startCheckout(selectedPlanId)}
    />
  );
}

function OnboardingFormShell({
  moment,
  fields,
  setFields,
  error,
  busy,
  createPending,
  checkoutPending,
  subscribed,
  selectedPlanId,
  setSelectedPlanId,
  manualCompetitor,
  setManualCompetitor,
  isExitDialogOpen,
  isFirstBrand,
  onExit,
  onStay,
  onLeave,
  onBeginDiscovery,
  onAddCompetitor,
  onBack,
  onConfirm,
  onSubmit,
  onCheckout,
}: {
  moment: number;
  fields: Fields;
  setFields: React.Dispatch<React.SetStateAction<Fields>>;
  error: string | null;
  busy: boolean;
  createPending: boolean;
  checkoutPending: boolean;
  subscribed: boolean;
  selectedPlanId: PlanId;
  setSelectedPlanId: React.Dispatch<React.SetStateAction<PlanId>>;
  manualCompetitor: { name: string; url: string };
  setManualCompetitor: React.Dispatch<React.SetStateAction<{ name: string; url: string }>>;
  isExitDialogOpen: boolean;
  isFirstBrand: boolean;
  onExit: () => void;
  onStay: () => void;
  onLeave: () => void;
  onBeginDiscovery: () => void;
  onAddCompetitor: () => void;
  onBack: () => void;
  onConfirm: () => void;
  onSubmit: () => void;
  onCheckout: () => void;
}) {
  const current = STEPS[moment];
  return (
    <div className="min-h-dvh bg-background">
      <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 py-8 sm:px-8 sm:py-12">
        <header className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-muted">Step {moment + 1} of 3</span>
          <Button variant="ghost" isDisabled={busy} onPress={onExit}>
            Save and exit
          </Button>
        </header>

        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center py-10 sm:py-14">
          <div className="max-w-2xl">
            <h1 className="type-display text-3xl text-foreground text-pretty sm:text-5xl">
              {current.title}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted text-pretty">
              {current.description}
            </p>
          </div>

          {error ? (
            <Alert status="danger" className="mt-6">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Setup needs attention</Alert.Title>
                <Alert.Description>{error}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}

          {moment === 0 ? (
            <WebsiteStep fields={fields} setFields={setFields} onContinue={onBeginDiscovery} />
          ) : null}
          {moment === 1 ? (
            <ConfirmStep
              fields={fields}
              setFields={setFields}
              manualCompetitor={manualCompetitor}
              setManualCompetitor={setManualCompetitor}
              onAddCompetitor={onAddCompetitor}
            />
          ) : null}
          {moment === 2 ? (
            <OutcomeStep
              fields={fields}
              setFields={setFields}
              subscribed={subscribed}
              selectedPlanId={selectedPlanId}
              setSelectedPlanId={setSelectedPlanId}
            />
          ) : null}

          {moment > 0 ? (
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="ghost" isDisabled={busy} onPress={onBack}>
                <ArrowLeftIcon className="size-4" />
                Back
              </Button>
              {moment === 1 ? (
                <Button className="min-h-11" isDisabled={busy} onPress={onConfirm}>
                  Yes, this is right
                  <ArrowRightIcon className="size-4" />
                </Button>
              ) : subscribed ? (
                <LoadingButton
                  className="min-h-11"
                  isPending={createPending}
                  pendingLabel="Starting Claudia…"
                  onPress={onSubmit}
                >
                  Start Claudia
                  <ArrowRightIcon className="size-4" />
                </LoadingButton>
              ) : (
                <LoadingButton
                  className="min-h-11"
                  isPending={checkoutPending}
                  pendingLabel="Opening checkout…"
                  onPress={onCheckout}
                >
                  Continue to checkout
                  <ArrowRightIcon className="size-4" />
                </LoadingButton>
              )}
            </div>
          ) : null}
        </div>
      </main>

      <OnboardingExitDialog
        isOpen={isExitDialogOpen}
        isFirstBrand={isFirstBrand}
        remainingSteps={STEPS.length - moment}
        onStay={onStay}
        onLeave={onLeave}
      />
    </div>
  );
}

function WebsiteStep({
  fields,
  setFields,
  onContinue,
}: {
  fields: Fields;
  setFields: React.Dispatch<React.SetStateAction<Fields>>;
  onContinue: () => void;
}) {
  return (
    <Card className="mt-8 max-w-2xl rounded-3xl p-0">
      <Card.Content className="p-6 sm:p-8">
        <Label htmlFor="onboarding-website">Website URL</Label>
        <div className="mt-2 flex items-center gap-3">
          <GlobeIcon className="hidden size-5 shrink-0 text-muted sm:block" aria-hidden />
          <Input
            id="onboarding-website"
            autoFocus
            autoComplete="url"
            fullWidth
            type="url"
            variant="secondary"
            placeholder="https://your-site.com"
            value={fields.website}
            onChange={(event) =>
              setFields((current) => ({ ...current, website: event.target.value }))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") onContinue();
            }}
          />
        </div>
        <p className="mt-4 text-sm leading-6 text-muted">
          Claudia will read your public site to understand what you sell, who it helps, and where
          the best opportunities may be.
        </p>
      </Card.Content>
      <Card.Footer className="justify-end border-t border-separator px-6 py-5 sm:px-8">
        <Button className="min-h-11" onPress={onContinue}>
          Learn about my brand
          <ArrowRightIcon className="size-4" />
        </Button>
      </Card.Footer>
    </Card>
  );
}

function ConfirmStep({
  fields,
  setFields,
  manualCompetitor,
  setManualCompetitor,
  onAddCompetitor,
}: {
  fields: Fields;
  setFields: React.Dispatch<React.SetStateAction<Fields>>;
  manualCompetitor: { name: string; url: string };
  setManualCompetitor: React.Dispatch<React.SetStateAction<{ name: string; url: string }>>;
  onAddCompetitor: () => void;
}) {
  return (
    <div className="mt-8 space-y-4">
      <SummaryField label="What you sell" Icon={LayersIcon}>
        <TextArea
          aria-label="What you sell"
          fullWidth
          rows={3}
          variant="secondary"
          placeholder="Describe the product or service"
          value={fields.productDescription}
          onChange={(event) =>
            setFields((current) => ({ ...current, productDescription: event.target.value }))
          }
        />
      </SummaryField>
      <SummaryField label="Who it helps" Icon={UsersIcon}>
        <TextArea
          aria-label="Who it helps"
          fullWidth
          rows={2}
          variant="secondary"
          placeholder="The customers Claudia should focus on"
          value={fields.audience}
          onChange={(event) =>
            setFields((current) => ({ ...current, audience: event.target.value }))
          }
        />
      </SummaryField>
      <SummaryField label="Most important customer outcomes" Icon={CheckIcon}>
        <TextArea
          aria-label="Most important customer outcomes"
          fullWidth
          rows={4}
          variant="secondary"
          placeholder={"Save time on reporting\nFind better growth opportunities"}
          value={fields.customerOutcomes}
          onChange={(event) =>
            setFields((current) => ({ ...current, customerOutcomes: event.target.value }))
          }
        />
        <p className="mt-2 text-xs leading-5 text-muted">One outcome per line.</p>
      </SummaryField>
      <SummaryField label="Competitors Claudia found" Icon={SearchIcon}>
        {fields.competitors.length ? (
          <ul className="divide-y divide-separator">
            {fields.competitors.map((competitor) => (
              <li key={competitor.url} className="flex min-h-14 items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{competitor.name}</span>
                  <span className="block truncate text-xs text-muted">{competitor.url}</span>
                </span>
                <Button
                  isIconOnly
                  variant="ghost"
                  aria-label={`Remove ${competitor.name}`}
                  onPress={() =>
                    setFields((current) => ({
                      ...current,
                      competitors: current.competitors.filter(
                        (item) => item.url !== competitor.url,
                      ),
                    }))
                  }
                >
                  <XIcon className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-3 text-sm text-muted">No confident matches yet. Claudia can keep looking.</p>
        )}
      </SummaryField>

      <details className="rounded-2xl bg-surface p-5 open:pb-6">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-foreground">
          Review more details
        </summary>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="onboarding-name">Brand name</Label>
            <Input
              id="onboarding-name"
              fullWidth
              variant="secondary"
              value={fields.name}
              onChange={(event) =>
                setFields((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="onboarding-tone">Brand voice</Label>
            <Input
              id="onboarding-tone"
              fullWidth
              variant="secondary"
              placeholder="Clear, practical, confident"
              value={fields.tone}
              onChange={(event) =>
                setFields((current) => ({ ...current, tone: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="onboarding-keywords">Important search themes</Label>
            <TextArea
              id="onboarding-keywords"
              fullWidth
              rows={2}
              variant="secondary"
              placeholder="Invoice automation, payment reminders"
              value={fields.seedKeywords}
              onChange={(event) =>
                setFields((current) => ({ ...current, seedKeywords: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="competitor-name">Add a competitor</Label>
            <Input
              id="competitor-name"
              fullWidth
              variant="secondary"
              placeholder="Competitor name"
              value={manualCompetitor.name}
              onChange={(event) =>
                setManualCompetitor((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="competitor-url">Competitor website</Label>
            <div className="flex gap-2">
              <Input
                id="competitor-url"
                fullWidth
                type="url"
                variant="secondary"
                placeholder="https://competitor.com"
                value={manualCompetitor.url}
                onChange={(event) =>
                  setManualCompetitor((current) => ({ ...current, url: event.target.value }))
                }
              />
              <Button
                variant="secondary"
                isDisabled={fields.competitors.length >= MAX_COMPETITORS}
                onPress={onAddCompetitor}
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

function SummaryField({
  label,
  Icon,
  children,
}: {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-2xl p-0">
      <Card.Content className="p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-secondary text-muted"
            aria-hidden
          >
            <Icon className="size-5" />
          </span>
          <h2 className="text-sm font-semibold text-foreground">{label}</h2>
        </div>
        {children}
      </Card.Content>
    </Card>
  );
}

function OutcomeStep({
  fields,
  setFields,
  subscribed,
  selectedPlanId,
  setSelectedPlanId,
}: {
  fields: Fields;
  setFields: React.Dispatch<React.SetStateAction<Fields>>;
  subscribed: boolean;
  selectedPlanId: PlanId;
  setSelectedPlanId: React.Dispatch<React.SetStateAction<PlanId>>;
}) {
  return (
    <div className="mt-8 space-y-8">
      <div className="grid gap-3 sm:grid-cols-2">
        {OUTCOMES.map(({ id, title, description, Icon, recommended }) => {
          const selected = fields.firstOutcome === id;
          return (
            <Button
              key={id}
              aria-pressed={selected}
              variant={selected ? "secondary" : "outline"}
              className="h-auto min-h-28 justify-start gap-4 whitespace-normal p-5 text-left active:scale-[0.96]"
              onPress={() => setFields((current) => ({ ...current, firstOutcome: id }))}
            >
              <span
                className="grid size-11 shrink-0 place-items-center rounded-xl bg-background text-muted"
                aria-hidden
              >
                <Icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <strong className="text-sm font-semibold text-foreground">{title}</strong>
                  {recommended ? (
                    <span className="text-xs font-medium text-success">Recommended</span>
                  ) : null}
                </span>
                <small className="mt-1 block text-sm leading-5 text-muted">{description}</small>
              </span>
            </Button>
          );
        })}
      </div>

      {!subscribed ? (
        <section className="border-t border-separator pt-8" aria-labelledby="capacity-title">
          <h2 id="capacity-title" className="text-lg font-semibold text-foreground">
            Choose Claudia&apos;s work capacity
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            This controls how much work Claudia can complete each month. You can change it later.
          </p>
          <div className="mt-4 max-w-md">
            <Select
              aria-label="Work capacity"
              fullWidth
              variant="secondary"
              value={selectedPlanId}
              onChange={(value) => {
                if (value) setSelectedPlanId(String(value) as PlanId);
              }}
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {Object.values(plans).map((plan) => (
                    <ListBox.Item key={plan.id} id={plan.id} textValue={plan.name}>
                      <span>{plan.name}</span>
                      <span className="ml-auto text-sm text-muted">${plan.price}/month</span>
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <p className="mt-3 text-sm text-muted">
              {plans[selectedPlanId].monthlyCredits.toLocaleString()} work credits each month · up
              to {plans[selectedPlanId].dailyArticleCap} article draft
              {plans[selectedPlanId].dailyArticleCap === 1 ? "" : "s"} per day
            </p>
          </div>
        </section>
      ) : (
        <p className="flex items-center gap-2 text-sm text-success">
          <CheckIcon className="size-4" /> Your current plan is ready.
        </p>
      )}
    </div>
  );
}

function CenteredFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      {children}
    </div>
  );
}
