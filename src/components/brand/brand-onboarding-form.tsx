"use client";

import {
  Accordion,
  Alert,
  Button,
  Card,
  Input,
  Label,
  ListBox,
  Select,
  TextArea,
} from "@heroui/react";
import { Stepper } from "@heroui-pro/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEventHandler,
} from "react";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import {
  OnboardingDiscovery,
  type DiscoveryStage,
} from "@/components/brand/onboarding-discovery";
import { ClaudiaActivationScreen } from "@/components/brand/claudia-activation-screen";
import {
  OnboardingExitDialog,
  useOnboardingExitGuard,
} from "@/components/brand/onboarding-exit-guard";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArticlesIcon,
  ChartBarIcon,
  CheckIcon,
  ChevronRightIcon,
  GlobeIcon,
  LayersIcon,
  PenIcon,
  SearchIcon,
  InsightIcon,
  TrendingUpIcon,
  UsersIcon,
} from "@/components/icons";
import { ToneText } from "@/components/ui/status-text";
import { LoadingButton } from "@/components/ui/loading-button";
import { TagInput } from "@/components/ui/tag-input";
import { apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys, useMe, type MeResponse } from "@/lib/api/queries";
import {
  isActiveSubscription,
  plans,
  type PlanId,
} from "@/lib/billing/plans";
import { MAX_COMPETITORS } from "@/lib/brand/schemas";
import { useBfcacheReset } from "@/lib/hooks/use-bfcache-reset";
import { useCheckoutConfirm } from "@/lib/hooks/use-checkout-confirm";
import type {
  IntegrationConfigKey,
  IntegrationProviderDefinition,
  IntegrationProviderId,
  IntegrationSecretKey,
} from "@/lib/integrations/providers";

type ProviderOption = IntegrationProviderDefinition;
type Competitor = { name: string; url: string; reason?: string };
type UseCase = {
  clientId: string;
  job: string;
  persona: string;
  industry: string;
  enabled: boolean;
};

type Fields = {
  name: string;
  website: string;
  productDescription: string;
  audience: string;
  tone: string;
  seedKeywords: string;
  competitors: Competitor[];
  useCases: UseCase[];
  integrationProvider: "" | IntegrationProviderId;
  integrationConfig: Record<string, string>;
  integrationSecrets: Record<string, string>;
  autonomyMode: "FULL_AUTO" | "REVIEW";
};

type BrandCreatePayload = Omit<Fields, "competitors" | "useCases"> & {
  competitors: Array<{ name: string; url: string }>;
  useCases: Array<{ job: string; persona: string; industry: string }>;
  resumeExisting?: boolean;
  checkoutSessionId?: string;
};

const INITIAL_FIELDS: Fields = {
  name: "",
  website: "",
  productDescription: "",
  audience: "",
  tone: "",
  seedKeywords: "",
  competitors: [],
  useCases: [],
  integrationProvider: "",
  integrationConfig: {},
  integrationSecrets: {},
  autonomyMode: "FULL_AUTO",
};

const MOMENTS = [
  {
    label: "Discover",
    title: "Turn your site into an operating brief",
    description: "Paste one URL. Claudia reads the positioning, audience, and market for you.",
  },
  {
    label: "Review",
    title: "Your first week, already planned",
    description: "Check the useful assumptions now. Everything stays editable after setup.",
  },
  {
    label: "Launch",
    title: "Choose how Claudia works",
    description: "Set her authority, connect publishing when useful, and choose your starting pace.",
  },
] as const;

const DRAFT_KEY = "claudia:onboarding-v2-draft";
const SKIP_PROVIDER_KEY = "__skip__";
const POPULAR_PLAN: PlanId = "startup";
const BRAND_CREATE_TIMEOUT_MS = 30_000;
const MAX_BUYER_PROFILES = 24;

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

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    // Connector credentials must never be restored from script-readable storage.
    return {
      ...draft,
      fields: {
        ...draft.fields,
        integrationSecrets: {},
        useCases: (draft.fields.useCases ?? []).map((item) => ({
          ...item,
          clientId: item.clientId || crypto.randomUUID(),
        })),
      },
    };
  } catch {
    return null;
  }
}

function saveDraft(draft: Draft) {
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        ...draft,
        fields: { ...draft.fields, integrationSecrets: {} },
      }),
    );
  } catch {
    // A blocked storage layer only disables checkout-return resume.
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
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
    moment: canceled ? 2 : Math.min(2, draft?.moment ?? 0),
    phase: finalizing ? "finalizing" : "form",
    checkoutSessionId,
    error: canceled ? "Checkout canceled. Your operating brief is saved." : null,
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
  return {
    name: fields.name.trim(),
    website: fields.website.trim(),
    productDescription: fields.productDescription.trim(),
    audience: fields.audience.trim(),
    tone: fields.tone.trim(),
    seedKeywords: fields.seedKeywords.trim(),
    competitors: fields.competitors.map(({ name, url }) => ({ name, url })),
    useCases: fields.useCases.reduce<BrandCreatePayload["useCases"]>((result, item) => {
      if (item.job.trim() && item.persona.trim()) {
        result.push({ job: item.job, persona: item.persona, industry: item.industry });
      }
      return result;
    }, []),
    integrationProvider: fields.integrationProvider,
    integrationConfig: Object.fromEntries(
      Object.entries(fields.integrationConfig).map(([key, value]) => [key, value.trim()]),
    ),
    integrationSecrets: Object.fromEntries(
      Object.entries(fields.integrationSecrets).map(([key, value]) => [key, value.trim()]),
    ),
    autonomyMode: fields.autonomyMode,
  };
}

async function discoverOperatingBrief(
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
    // The brief remains editable when enrichment is unavailable.
  }

  onStageChange("market");

  const [competitors, useCases] = await Promise.all([
    apiPost<{ suggestions: Competitor[] }>("/api/brand/competitors/preview", {
      name,
      website,
      productDescription: profile.productDescription,
      seedKeywords: profile.seedKeywords,
    }).catch(() => ({ suggestions: [] })),
    apiPost<{ useCases: Array<{ job: string; persona: string; industry: string | null }> }>(
      "/api/brand/use-cases/preview",
      {
        name,
        website,
        productDescription: profile.productDescription,
        audience: profile.audience,
        seedKeywords: profile.seedKeywords,
      },
    ).catch(() => ({ useCases: [] })),
  ]);

  return {
    profile,
    competitors: competitors.suggestions.slice(0, MAX_COMPETITORS),
    useCases: useCases.useCases.map((item) => ({
      clientId: crypto.randomUUID(),
      job: item.job,
      persona: item.persona,
      industry: item.industry ?? "",
      enabled: true,
    })),
  };
}

export function BrandOnboardingForm({
  providers,
  showDashboardEscape = false,
}: {
  providers: ProviderOption[];
  showDashboardEscape?: boolean;
}) {
  const isClient = useSyncExternalStore(subscribeToClient, () => true, () => false);
  if (!isClient) {
    return (
      <CenteredFrame>
        <p className="text-sm text-muted">Preparing Claudia setup&hellip;</p>
      </CenteredFrame>
    );
  }
  return (
    <BrandOnboardingClient
      providers={providers}
      showDashboardEscape={showDashboardEscape}
    />
  );
}

function BrandOnboardingClient({
  providers,
  showDashboardEscape,
}: {
  providers: ProviderOption[];
  showDashboardEscape: boolean;
}) {
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
  const [discoveryStage, setDiscoveryStage] = useState<DiscoveryStage>("site");
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
      discoverOperatingBrief(name, website, setDiscoveryStage),
    onSuccess: (result) => {
      setFields((current) => ({
        ...current,
        productDescription: result.profile.productDescription,
        audience: result.profile.audience,
        tone: result.profile.tone,
        seedKeywords: result.profile.seedKeywords,
        competitors: result.competitors,
        useCases: result.useCases,
      }));
      setMoment(1);
    },
    onError: () => {
      setError("I couldn't read the site yet. Add the brief manually and continue.");
      setMoment(1);
    },
  });

  const create = useMutation({
    mutationFn: (payload: BrandCreatePayload) =>
      apiPost<{ brand: { id: string; name: string }; canIgnite: boolean }>("/api/brands", payload, {
        signal: AbortSignal.timeout(BRAND_CREATE_TIMEOUT_MS),
      }),
    onSuccess: async ({ brand, canIgnite }) => {
      clearDraft();
      // The create response and active-brand cookie are authoritative. Update
      // the bootstrap cache before navigating so the app layout cannot observe
      // the old empty brand list and bounce the user back to onboarding.
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
                      autonomyMode: fields.autonomyMode,
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
      router.replace(canIgnite ? "/dashboard" : "/account?tab=billing&next=ignition");
    },
    onError: (failure) => {
      rearmExitGuard();
      setError(
        getErrorMessage(
          failure,
          "Claudia could not finish activation. Your payment and saved brief are safe.",
        ),
      );
    },
  });

  const submitCreate = useCallback(() => {
    if (!fields.name.trim()) {
      setError("Add a brand name before starting.");
      setPhase("form");
      setMoment(1);
      return;
    }
    setError(null);
    disarmExitGuard();
    create.mutate({
      ...buildPayload(fields),
      resumeExisting: phase === "finalizing",
      checkoutSessionId: phase === "finalizing" ? checkoutSessionId ?? undefined : undefined,
    });
  }, [checkoutSessionId, create, disarmExitGuard, fields, phase]);

  useEffect(() => {
    // Save Stripe's replay token before removing it from the address bar. A
    // refresh/crash during activation can then resume confirmation safely.
    if (phase === "finalizing" && checkoutSessionId) {
      saveDraft({ fields, moment, checkoutSessionId });
    } else if (phase === "form") {
      saveDraft({ fields, moment });
    }
  }, [checkoutSessionId, fields, moment, phase]);

  useEffect(() => {
    if (bootstrap.cleanUrl) {
      window.history.replaceState(null, "", "/onboarding");
    }
  }, [bootstrap.cleanUrl]);

  const refetchMe = me.refetch;
  const checkoutConfirm = useCheckoutConfirm({
    sessionId: checkoutSessionId,
    enabled: phase === "finalizing" && !subscribed,
    onSettled: () => void refetchMe(),
  });

  useEffect(() => {
    if (phase !== "finalizing" || subscribed) return;
    const poll = setInterval(() => void refetchMe(), 2_500);
    const timeout = setTimeout(() => setFinalizeTimedOut(true), 45_000);
    return () => {
      clearInterval(poll);
      clearTimeout(timeout);
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
      setError("Add a brand name so Claudia knows what to look for.");
      return;
    }
    setError(null);
    setDiscoveryStage("site");
    setFields((current) => ({ ...current, name }));
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
        website={fields.website}
        autonomyMode={fields.autonomyMode}
        subscribed={subscribed}
        isCreating={create.isPending}
        needsRetry={needsRetry}
        errorMessage={error ?? "We could not confirm the latest account state. Your payment and saved brief are safe."}
        onRetry={() => {
          setError(null);
          setFinalizeTimedOut(false);
          if (activationFailed) {
            submitCreate();
          } else {
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

  const current = MOMENTS[moment];
  const isDiscovering = moment === 0 && discover.isPending;
  return (
    <div className="relative min-h-dvh overflow-x-clip bg-background">
      <main className="mx-auto min-h-dvh w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <OnboardingStepPanel
          current={current}
          moment={moment}
          fields={fields}
          setFields={setFields}
          providers={providers}
          manualCompetitor={manualCompetitor}
          setManualCompetitor={setManualCompetitor}
          error={error}
          isDiscovering={isDiscovering}
          discoveryStage={discoveryStage}
          subscribed={subscribed}
          createPending={create.isPending}
          checkoutLoading={checkoutLoading}
          selectedPlanId={selectedPlanId}
          setSelectedPlanId={setSelectedPlanId}
          onBeginDiscovery={beginDiscovery}
          onAddCompetitor={addCompetitor}
          onContinueBrief={() => setMoment(2)}
          onBack={() => setMoment((value) => value - 1)}
          onExit={openExitDialog}
          onSubmit={submitCreate}
          onStartCheckout={startCheckout}
        />
      </main>

      <OnboardingExitDialog
        isOpen={isExitDialogOpen}
        isFirstBrand={isFirstBrand}
        remainingSteps={MOMENTS.length - moment}
        onStay={stayInOnboarding}
        onLeave={() => void leaveOnboarding()}
      />
    </div>
  );
}


function OnboardingStepPanel({
  current, moment, fields, setFields, providers, manualCompetitor, setManualCompetitor,
  error, isDiscovering, discoveryStage, subscribed, createPending, checkoutLoading,
  selectedPlanId, setSelectedPlanId, onBeginDiscovery, onAddCompetitor,
  onContinueBrief, onBack, onExit, onSubmit, onStartCheckout,
}: {
  current: (typeof MOMENTS)[number]; moment: number; fields: Fields;
  setFields: React.Dispatch<React.SetStateAction<Fields>>; providers: ProviderOption[];
  manualCompetitor: { name: string; url: string };
  setManualCompetitor: React.Dispatch<React.SetStateAction<{ name: string; url: string }>>;
  error: string | null; isDiscovering: boolean; discoveryStage: DiscoveryStage;
  subscribed: boolean; createPending: boolean; checkoutLoading: PlanId | null;
  selectedPlanId: PlanId; setSelectedPlanId: React.Dispatch<React.SetStateAction<PlanId>>;
  onBeginDiscovery: () => void; onAddCompetitor: () => void; onContinueBrief: () => void;
  onBack: () => void; onExit: () => void; onSubmit: () => void;
  onStartCheckout: (planId: PlanId) => void;
}) {
  const launch = () => subscribed ? onSubmit() : onStartCheckout(selectedPlanId);

  if (isDiscovering) {
    return (
      <div className="min-h-[calc(100dvh-13rem)]">
        <OnboardingDiscovery brandName={fields.name} website={fields.website} stage={discoveryStage} />
        {error ? <OnboardingError message={error} /> : null}
        <OnboardingActions moment={moment} label={current.label} isWorking selectedPlanId={selectedPlanId} onBack={onBack} onExit={onExit} onPrimary={onContinueBrief} />
      </div>
    );
  }

  return (
    <section key={moment} className="min-w-0">
      {moment === 0 ? (
        <div className="flex min-h-[calc(100dvh-13rem)] items-center">
          <div className="w-full max-w-2xl">
            <StepIndicator moment={moment} label={current.label} />
            <h1 className="type-display mt-8 max-w-xl text-3xl text-foreground sm:text-4xl">Turn Your Site Into an Operating Brief</h1>
            <SiteMoment fields={fields} setFields={setFields} onContinue={onBeginDiscovery} />
            {error ? <OnboardingError message={error} /> : null}
          </div>
        </div>
      ) : moment === 1 ? (
        <div className="mx-auto w-full max-w-5xl pt-6">
          <div>
            <StepIndicator moment={moment} label={current.label} />
            <h1 className="type-display mt-8 max-w-2xl text-3xl text-foreground sm:text-4xl">Your First Week, Already Planned</h1>
            <p className="mt-3 text-base text-muted">Here&apos;s your operating brief. You can edit anything.</p>
            <BriefMoment fields={fields} setFields={setFields} manualCompetitor={manualCompetitor} setManualCompetitor={setManualCompetitor} addCompetitor={onAddCompetitor} />
            {error ? <OnboardingError message={error} /> : null}
          </div>
        </div>
      ) : (
        <div className="mx-auto flex min-h-[calc(100dvh-13rem)] w-full max-w-5xl flex-col justify-center py-10">
          <StepIndicator moment={moment} label={current.label} />
          <h1 className="type-display mt-8 text-3xl text-foreground sm:text-4xl">Choose How Claudia Works</h1>
          <AuthorityMoment fields={fields} setFields={setFields} providers={providers} subscribed={subscribed} selectedPlanId={selectedPlanId} setSelectedPlanId={setSelectedPlanId} />
          {error ? <OnboardingError message={error} /> : null}
        </div>
      )}
      <OnboardingActions moment={moment} label={current.label} selectedPlanId={selectedPlanId} autonomyMode={fields.autonomyMode} isPending={createPending || checkoutLoading !== null} onBack={onBack} onExit={onExit} onPrimary={moment === 1 ? onContinueBrief : launch} />
    </section>
  );
}

function StepIndicator({ moment, label }: { moment: number; label: string }) {
  return (
    <Stepper currentStep={moment} aria-label={`${label}, step ${moment + 1} of ${MOMENTS.length}`}>
      {MOMENTS.map((item) => (
        <Stepper.Step key={item.label}>
          <Stepper.Indicator />
          <Stepper.Content><Stepper.Title>{item.label}</Stepper.Title></Stepper.Content>
          <Stepper.Separator />
        </Stepper.Step>
      ))}
    </Stepper>
  );
}

function displayHost(website: string) {
  try { return new URL(website).hostname.replace(/^www\./, ""); }
  catch { return website.replace(/^https?:\/\//, "") || "your-site.com"; }
}

const ONBOARDING_WEEK = [
  { label: "Align", Icon: InsightIcon },
  { label: "Audit", Icon: SearchIcon },
  { label: "Plan", Icon: ArticlesIcon },
  { label: "Optimize", Icon: TrendingUpIcon },
  { label: "Review", Icon: CheckIcon },
] as const;

function OnboardingError({ message }: { message: string }) {
  return (
    <Alert status="danger" className="mt-5 max-w-xl">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>Setup Needs Attention</Alert.Title>
        <Alert.Description>{message}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function OnboardingActions({
  moment, label, selectedPlanId, autonomyMode = "FULL_AUTO", isWorking = false,
  isPending = false, onBack, onExit, onPrimary,
}: {
  moment: number; label: string; selectedPlanId: PlanId; autonomyMode?: Fields["autonomyMode"];
  isWorking?: boolean; isPending?: boolean; onBack: () => void; onExit: () => void; onPrimary: () => void;
}) {
  const plan = plans[selectedPlanId];
  return (
    <Card className="mt-10" role="region" aria-label="Onboarding actions">
      <Card.Content className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="hidden min-w-0 flex-1 items-center gap-3 sm:flex">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-secondary text-muted" aria-hidden><InsightIcon className="size-4" /></span>
          {moment === 2 ? (
            <p><span className="text-accent">{autonomyMode === "FULL_AUTO" ? "Autopilot" : "Copilot"}</span><span>·</span><span>{plan.name}</span></p>
          ) : (
            <p><span className="text-accent">{label}</span><span>·</span><span className="tabular-nums">{moment + 1} of 3</span></p>
          )}
        </div>
        <div className="flex w-full flex-col-reverse gap-2 sm:ml-auto sm:w-auto sm:flex-row">
          <Button className="w-full sm:w-auto" variant="ghost" isDisabled={moment === 0 || isPending} onPress={onBack}><ArrowLeftIcon className="size-4" /> Back</Button>
          {moment === 0 ? (
            <Button className="w-full sm:w-auto" variant="secondary" isDisabled={isWorking} onPress={onExit}>Save and exit</Button>
          ) : (
            <LoadingButton className="w-full sm:w-auto" isPending={isPending} pendingLabel={moment === 2 ? "Starting…" : "Saving…"} onPress={onPrimary}>
              {moment === 1 ? <InsightIcon className="size-4" /> : <ArrowRightIcon className="size-4" />}
              {moment === 1 ? "Looks right" : "Start first day"}
            </LoadingButton>
          )}
        </div>
      </Card.Content>
    </Card>
  );
}

function SiteMoment({ fields, setFields, onContinue }: {
  fields: Fields; setFields: React.Dispatch<React.SetStateAction<Fields>>; onContinue: () => void;
}) {
  const valid = isValidUrl(fields.website.trim());
  return (
    <Card className="mt-10 max-w-xl">
      <Card.Header>
        <Card.Title>Start With Your Website</Card.Title>
        <Card.Description>Claudia will read the site and draft the rest of your operating brief.</Card.Description>
      </Card.Header>
      <Card.Content className="space-y-4">
        <div className="flex items-center gap-3">
          <GlobeIcon className="size-5 shrink-0 text-muted" />
          <Input id="onboarding-website" aria-label="Website URL" autoFocus autoComplete="url" fullWidth type="url" variant="secondary" placeholder="https://your-site.com" value={fields.website} onChange={(event) => setFields((current) => ({ ...current, website: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") onContinue(); }} />
          {valid ? <ToneText tone="success" className="inline-flex items-center gap-1.5 text-xs"><CheckIcon className="size-3.5" />Valid</ToneText> : null}
        </div>
        <div className="flex items-center gap-3">
          <LayersIcon className="size-5 shrink-0 text-muted" />
          <Input id="onboarding-name" aria-label="Brand name" variant="secondary" fullWidth placeholder={inferredName(fields.website) || "Brand name"} value={fields.name} onChange={(event) => setFields((current) => ({ ...current, name: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") onContinue(); }} />
        </div>
      </Card.Content>
      <Card.Footer>
        <Button size="lg" onPress={onContinue}><InsightIcon className="size-5" />Investigate Site</Button>
      </Card.Footer>
    </Card>
  );
}

function BriefMoment({
  fields,
  setFields,
  manualCompetitor,
  setManualCompetitor,
  addCompetitor,
}: {
  fields: Fields;
  setFields: React.Dispatch<React.SetStateAction<Fields>>;
  manualCompetitor: { name: string; url: string };
  setManualCompetitor: React.Dispatch<React.SetStateAction<{ name: string; url: string }>>;
  addCompetitor: () => void;
}) {
  const set =
    (key: keyof Pick<Fields, "name" | "productDescription" | "audience" | "tone">) =>
    (event: { target: { value: string } }) =>
      setFields((current) => ({ ...current, [key]: event.target.value }));

  const updateUseCase = (
    clientId: string,
    key: keyof Pick<UseCase, "persona" | "job" | "industry">,
    value: string,
  ) => setFields((current) => ({
    ...current,
    useCases: current.useCases.map((item) =>
      item.clientId === clientId ? { ...item, [key]: value, enabled: true } : item,
    ),
  }));

  const addUseCase = () => setFields((current) => ({
    ...current,
    useCases: current.useCases.length >= MAX_BUYER_PROFILES ? current.useCases : [
      ...current.useCases,
      { clientId: crypto.randomUUID(), persona: "", job: "", industry: "", enabled: true },
    ],
  }));

  return (
    <div className="mt-10 max-w-[78rem]">
      <div className="max-w-xl divide-y divide-separator/70">
        <BriefFieldRow label="Brand" Icon={LayersIcon}>
          <Input aria-label="Brand" fullWidth variant="secondary" value={fields.name} onChange={set("name")} />
        </BriefFieldRow>
        <BriefFieldRow label="Audience" Icon={UsersIcon}>
          <Input aria-label="Audience" fullWidth variant="secondary" value={fields.audience} onChange={set("audience")} />
        </BriefFieldRow>
        <BriefFieldRow label="Tone" Icon={PenIcon}>
          <Input aria-label="Tone" fullWidth variant="secondary" value={fields.tone} onChange={set("tone")} />
        </BriefFieldRow>
      </div>

      <section className="mt-7" aria-labelledby="competitors-title">
        <h2 id="competitors-title" className="text-sm font-medium text-muted">Competitors</h2>
        <div className="mt-3 flex max-w-4xl gap-3 overflow-x-auto pb-2">
          {fields.competitors.map((competitor) => (
            <Button
              key={competitor.url}
              size="sm"
              variant="secondary"
              onPress={() => setFields((current) => ({
                ...current,
                competitors: current.competitors.filter((item) => item.url !== competitor.url),
              }))}
              aria-label={"Remove " + competitor.name}
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-surface-secondary text-xs font-semibold" aria-hidden>{competitor.name.slice(0, 2).toUpperCase()}</span>
              <span className="max-w-36 truncate">{displayHost(competitor.url)}</span>
              <span className="text-muted" aria-hidden>&times;</span>
            </Button>
          ))}
          {!fields.competitors.length ? <p className="py-3 text-sm text-muted">No confident matches yet.</p> : null}
        </div>
      </section>

      <section className="mt-7" aria-labelledby="week-title">
        <h2 id="week-title" className="text-sm font-medium text-muted">Your first week</h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-5">
          {ONBOARDING_WEEK.map(({ label, Icon }, index) => (
            <li key={label}>
              <Card variant="secondary" className="h-full">
                <Card.Content>
                  <span className="flex size-9 items-center justify-center rounded-lg bg-background text-muted"><Icon className="size-4" /></span>
                  <p className="mt-3 text-sm font-medium text-foreground"><strong className="mr-2 font-normal text-muted tabular-nums">{index + 1}</strong>{label}</p>
                </Card.Content>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-5 max-w-[78rem] space-y-2">
        <Accordion variant="surface">
          <Accordion.Item id="buyer-profiles">
          <Accordion.Heading>
            <Accordion.Trigger><UsersIcon className="size-5 text-muted" />Buyer Profiles<span className="text-sm font-medium text-accent tabular-nums">{fields.useCases.length}</span><Accordion.Indicator><ChevronRightIcon /></Accordion.Indicator></Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
          <Accordion.Body className="grid gap-4 md:grid-cols-2">
            {fields.useCases.map((useCase, index) => (
              <article key={useCase.clientId} className="rounded-2xl bg-surface-secondary/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">Buyer {index + 1}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => setFields((current) => ({
                      ...current,
                      useCases: current.useCases.filter((item) => item.clientId !== useCase.clientId),
                    }))}
                  >
                    Remove
                  </Button>
                </div>
                <div className="mt-3 space-y-3">
                  <Input
                    aria-label={"Buyer " + (index + 1) + " role"}
                    fullWidth
                    variant="secondary"
                    placeholder="Buyer or role"
                    value={useCase.persona}
                    onChange={(event) => updateUseCase(useCase.clientId, "persona", event.target.value)}
                  />
                  <TextArea
                    aria-label={"Buyer " + (index + 1) + " goal"}
                    fullWidth
                    rows={2}
                    variant="secondary"
                    placeholder="What they need to achieve"
                    value={useCase.job}
                    onChange={(event) => updateUseCase(useCase.clientId, "job", event.target.value)}
                  />
                  <Input
                    aria-label={"Buyer " + (index + 1) + " industry"}
                    fullWidth
                    variant="secondary"
                    placeholder="Industry (optional)"
                    value={useCase.industry}
                    onChange={(event) => updateUseCase(useCase.clientId, "industry", event.target.value)}
                  />
                </div>
              </article>
            ))}
            <Button variant="secondary" isDisabled={fields.useCases.length >= MAX_BUYER_PROFILES} onPress={addUseCase}>
              Add buyer profile
            </Button>
          </Accordion.Body>
          </Accordion.Panel>
          </Accordion.Item>
        </Accordion>

        <Accordion variant="surface">
          <Accordion.Item id="advanced-fields">
          <Accordion.Heading>
            <Accordion.Trigger><ChartBarIcon className="size-5 text-muted" />Advanced Fields<Accordion.Indicator><ChevronRightIcon /></Accordion.Indicator></Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
          <Accordion.Body className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="brief-product">What the brand sells</Label>
              <TextArea id="brief-product" fullWidth rows={4} variant="secondary" value={fields.productDescription} onChange={set("productDescription")} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="brief-keywords">Initial query themes</Label>
              <TagInput
                id="brief-keywords"
                ariaLabel="Initial query themes"
                placeholder="AI visibility, answer engine optimization"
                value={fields.seedKeywords}
                onChange={(value) => setFields((current) => ({ ...current, seedKeywords: value }))}
              />
            </div>
            <Input
              aria-label="Competitor name"
              variant="secondary"
              placeholder="Competitor"
              value={manualCompetitor.name}
              onChange={(event) => setManualCompetitor((current) => ({ ...current, name: event.target.value }))}
            />
            <div className="flex gap-2">
              <Input
                aria-label="Competitor URL"
                type="url"
                variant="secondary"
                placeholder="https://competitor.com"
                value={manualCompetitor.url}
                onChange={(event) => setManualCompetitor((current) => ({ ...current, url: event.target.value }))}
              />
              <Button variant="secondary" isDisabled={fields.competitors.length >= MAX_COMPETITORS} onPress={addCompetitor}>Add</Button>
            </div>
          </Accordion.Body>
          </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </div>
    </div>
  );
}

function BriefFieldRow({
  label,
  Icon,
  children,
}: {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[3rem_1fr_2rem] items-center gap-4 py-3">
      <span className="grid size-11 place-items-center rounded-2xl bg-surface/75 text-muted ring-1 ring-border/50"><Icon className="size-5" /></span>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        {children}
      </div>
      <PenIcon className="size-4 text-muted" aria-hidden />
    </div>
  );
}

function AuthorityMoment({
  fields, setFields, providers, subscribed, selectedPlanId, setSelectedPlanId,
}: {
  fields: Fields;
  setFields: React.Dispatch<React.SetStateAction<Fields>>;
  providers: ProviderOption[];
  subscribed: boolean;
  selectedPlanId: PlanId;
  setSelectedPlanId: React.Dispatch<React.SetStateAction<PlanId>>;
}) {
  const provider = providers.find((item) => item.id === fields.integrationProvider) ?? null;
  const setConfig =
    (key: IntegrationConfigKey): ChangeEventHandler<HTMLInputElement> =>
    (event) => setFields((current) => ({ ...current, integrationConfig: { ...current.integrationConfig, [key]: event.target.value } }));
  const setSecret =
    (key: IntegrationSecretKey): ChangeEventHandler<HTMLInputElement> =>
    (event) => setFields((current) => ({ ...current, integrationSecrets: { ...current.integrationSecrets, [key]: event.target.value } }));

  return (
    <div className="mt-14">
      <section className="grid gap-4 md:grid-cols-2" aria-label="Claudia authority">
        <Button
          aria-pressed={fields.autonomyMode === "FULL_AUTO"}
          variant={fields.autonomyMode === "FULL_AUTO" ? "secondary" : "outline"}
          onPress={() => setFields((current) => ({ ...current, autonomyMode: "FULL_AUTO" }))}
          className="h-auto min-h-28 justify-start gap-4 whitespace-normal p-6 text-left"
        >
          <span className="flex size-11 items-center justify-center rounded-xl bg-surface-secondary"><InsightIcon className="size-5" /></span>
          <span><strong className="block text-base">Autopilot</strong><small className="mt-1 block text-sm text-muted">Automate approved work</small></span>
        </Button>
        <Button
          aria-pressed={fields.autonomyMode === "REVIEW"}
          variant={fields.autonomyMode === "REVIEW" ? "secondary" : "outline"}
          onPress={() => setFields((current) => ({ ...current, autonomyMode: "REVIEW" }))}
          className="h-auto min-h-28 justify-start gap-4 whitespace-normal p-6 text-left"
        >
          <span className="flex size-11 items-center justify-center rounded-xl bg-surface-secondary"><UsersIcon className="size-5" /></span>
          <span><strong className="block text-base">Copilot</strong><small className="mt-1 block text-sm text-muted">You approve every step</small></span>
        </Button>
      </section>

      <div className="mx-auto mt-14 grid max-w-4xl gap-5 md:grid-cols-2">
        <div className="flex items-center gap-4 rounded-2xl bg-surface p-5">
          <span className="grid size-11 place-items-center rounded-xl bg-surface-secondary text-foreground"><GlobeIcon className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">Publishing destination</p>
            <Select
              aria-label="Publishing destination"
              fullWidth
              variant="secondary"
              placeholder="Connect later"
              value={fields.integrationProvider || SKIP_PROVIDER_KEY}
              onChange={(value) => setFields((current) => ({
                ...current,
                integrationProvider: value && value !== SKIP_PROVIDER_KEY ? (String(value) as IntegrationProviderId) : "",
                integrationConfig: {},
                integrationSecrets: {},
              }))}
            >
              <Select.Trigger className="border-0 bg-transparent p-0 shadow-none"><Select.Value /><Select.Indicator /></Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id={SKIP_PROVIDER_KEY} textValue="Connect later">Connect later<ListBox.ItemIndicator /></ListBox.Item>
                  {providers.map((item) => item.status === "available" ? (
                    <ListBox.Item key={item.id} id={item.id} textValue={item.name}>{item.name}<ListBox.ItemIndicator /></ListBox.Item>
                  ) : null)}
                </ListBox>
              </Select.Popover>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl bg-surface p-5">
          <span className="grid size-11 place-items-center rounded-xl bg-surface-secondary text-foreground"><ChartBarIcon className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">Pace</p>
            <Select
              aria-label="Starting pace"
              fullWidth
              variant="secondary"
              value={selectedPlanId}
              isDisabled={subscribed}
              onChange={(value) => value ? setSelectedPlanId(String(value) as PlanId) : undefined}
            >
              <Select.Trigger className="border-0 bg-transparent p-0 shadow-none"><Select.Value /><Select.Indicator /></Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {Object.values(plans).map((plan) => (
                    <ListBox.Item key={plan.id} id={plan.id} textValue={plan.name}>
                      <span>{plan.name}</span>
                      <span className="ml-auto text-xs text-muted">{"$" + plan.price + "/mo"}</span>
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          </div>
        </div>
      </div>

      {provider ? (
        <div className="mx-auto mt-5 max-w-4xl rounded-2xl bg-surface p-5">
          <ConnectionFields provider={provider} config={fields.integrationConfig} secrets={fields.integrationSecrets} onConfig={setConfig} onSecret={setSecret} />
        </div>
      ) : null}

      <p className="mt-12 flex items-center justify-center gap-3 text-base text-muted">
        <CheckIcon className="size-6" /> Every action logged.
      </p>
    </div>
  );
}

function ConnectionFields({
  provider,
  config,
  secrets,
  onConfig,
  onSecret,
}: {
  provider: ProviderOption;
  config: Record<string, string>;
  secrets: Record<string, string>;
  onConfig: (key: IntegrationConfigKey) => ChangeEventHandler<HTMLInputElement>;
  onSecret: (key: IntegrationSecretKey) => ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <div className="space-y-3">
      {provider.fields.map((field) =>
        field.required ? (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={`connection-${field.key}`}>{field.label}</Label>
            <Input id={`connection-${field.key}`} fullWidth type={field.validation === "url" ? "url" : "text"} variant="secondary" placeholder={field.placeholder} value={config[field.key] ?? ""} onChange={onConfig(field.key)} />
          </div>
        ) : null,
      )}
      {provider.secrets.map((secret) =>
        secret.required ? (
          <div key={secret.key} className="space-y-2">
            <Label htmlFor={`connection-${secret.key}`}>{secret.label}</Label>
            <Input id={`connection-${secret.key}`} fullWidth type="password" autoComplete="new-password" variant="secondary" placeholder={secret.placeholder} value={secrets[secret.key] ?? ""} onChange={onSecret(secret.key)} />
          </div>
        ) : null,
      )}
    </div>
  );
}


function CenteredFrame({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">{children}</div>;
}
