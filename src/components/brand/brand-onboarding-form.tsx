"use client";

import {
  Button,
  Input,
  Label,
  ListBox,
  ProgressBar,
  Select,
  TextArea,
} from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEventHandler,
} from "react";
import {
  OnboardingDiscovery,
  type DiscoveryStage,
} from "@/components/brand/onboarding-discovery";
import {
  OnboardingExitDialog,
  useOnboardingExitGuard,
} from "@/components/brand/onboarding-exit-guard";
import { CheckIcon, SparklesIcon, SgaLogo } from "@/components/icons";
import { LoadingButton } from "@/components/ui/loading-button";
import { apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys, useMe } from "@/lib/api/queries";
import {
  articlesPerMonth,
  isActiveSubscription,
  plans,
  type PlanId,
} from "@/lib/billing/plans";
import { SIGNUP_GRANT_CREDITS } from "@/lib/billing/credits";
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
type UseCase = { job: string; persona: string; industry: string; enabled: boolean };

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

const PLAN_CHOICE_COPY: Record<PlanId, { fit: string; eyebrow: string }> = {
  indie: {
    eyebrow: "Focused start",
    fit: "For solo operators proving a repeatable growth channel.",
  },
  startup: {
    eyebrow: "Most popular",
    fit: "For growing teams that want consistent weekly momentum.",
  },
  scale: {
    eyebrow: "Category growth",
    fit: "For established teams ready to increase output and coverage.",
  },
  enterprise: {
    eyebrow: "High-volume",
    fit: "For large programs that need serious publishing capacity.",
  },
};

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
    return raw ? (JSON.parse(raw) as Draft) : null;
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
    return new URL(value).protocol.startsWith("http");
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
      if (item.enabled && item.job.trim() && item.persona.trim()) {
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
        <p className="text-sm text-muted">Preparing Claudia setup…</p>
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
  const router = useRouter();
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
      apiPost<{ brand: { id: string }; canIgnite: boolean }>("/api/brands", payload),
    onSuccess: async ({ canIgnite }) => {
      clearDraft();
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentState });
      void queryClient.invalidateQueries({ queryKey: queryKeys.integrations });
      await releaseExitGuard();
      router.replace(canIgnite ? "/dashboard" : "/account?tab=billing&next=ignition");
    },
    onError: (failure) => {
      rearmExitGuard();
      setError(getErrorMessage(failure, "Could not create this brand."));
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
    if (bootstrap.cleanUrl) {
      window.history.replaceState(null, "", "/onboarding");
    }
  }, [bootstrap.cleanUrl]);

  useEffect(() => {
    if (phase === "form") saveDraft({ fields, moment });
  }, [fields, moment, phase]);

  const refetchMe = me.refetch;
  useCheckoutConfirm({
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
    return (
      <CenteredFrame>
        <p className="text-sm font-medium text-muted">Activating Claudia</p>
        <h1 className="mt-3 text-3xl text-foreground">
          {create.isPending ? "Starting the first day…" : finalizeTimedOut ? "Still activating…" : "Confirming your plan…"}
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-7 text-muted">
          {finalizeTimedOut
            ? "Payment is safe. Refresh the activation check and the saved brief will resume."
            : "The operating brief is saved. Claudia starts Setup Run as soon as the plan is active."}
        </p>
        {finalizeTimedOut && !create.isPending ? (
          <Button className="mt-6" onPress={() => void refetchMe()}>Check again</Button>
        ) : null}
      </CenteredFrame>
    );
  }

  const current = MOMENTS[moment];
  const isDiscovering = moment === 0 && discover.isPending;
  return (
    <div className="onboarding-canvas relative isolate min-h-dvh overflow-x-clip">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 pb-12 pt-6 sm:px-8 sm:pb-16 sm:pt-8 lg:px-10">
        <OnboardingHeader
          current={current}
          moment={moment}
          isFirstBrand={isFirstBrand}
          showDashboardEscape={showDashboardEscape}
          onExit={openExitDialog}
        />

        <main className="mt-10 grid flex-1 items-start gap-12 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:gap-16">
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
            onBeginDiscovery={beginDiscovery}
            onAddCompetitor={addCompetitor}
            onContinueBrief={() => setMoment(2)}
            onBack={() => setMoment((value) => value - 1)}
            onSubmit={submitCreate}
            onStartCheckout={startCheckout}
          />

          <OnboardingValueRail isFirstBrand={isFirstBrand} moment={moment} />
        </main>
      </div>

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

function OnboardingHeader({
  current,
  moment,
  isFirstBrand,
  showDashboardEscape,
  onExit,
}: {
  current: (typeof MOMENTS)[number];
  moment: number;
  isFirstBrand: boolean;
  showDashboardEscape: boolean;
  onExit: () => void;
}) {
  return (
    <>
      <header className="flex items-center justify-between gap-4">
        <SgaLogo className="flex items-center gap-2.5" iconClassName="size-8" />
        <div className="flex items-center gap-2 sm:gap-3">
          {isFirstBrand ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent-soft-foreground lg:hidden">
              <SparklesIcon className="size-3.5" />
              {SIGNUP_GRANT_CREDITS} free credits
            </span>
          ) : (
            <span className="hidden items-center gap-1.5 text-xs font-medium text-muted sm:inline-flex">
              <CheckIcon className="size-3.5" />
              Draft saved
            </span>
          )}
          {showDashboardEscape ? (
            <Button size="sm" variant="ghost" onPress={onExit}>
              Back to Claudia
            </Button>
          ) : null}
        </div>
      </header>

      <div className="mt-8 sm:mt-10">
        <ProgressBar
          aria-label={`Onboarding progress: ${current.label}`}
          value={((moment + 1) / MOMENTS.length) * 100}
        >
          <ProgressBar.Track className="h-1 bg-surface-secondary/80">
            <ProgressBar.Fill className="bg-accent transition-transform duration-ui ease-out-strong" />
          </ProgressBar.Track>
        </ProgressBar>
        <ol className="mt-3 grid grid-cols-3 gap-3" aria-label="Onboarding steps">
          {MOMENTS.map((item, index) => (
            <li
              key={item.label}
              aria-current={index === moment ? "step" : undefined}
              className={`text-xs font-medium sm:text-sm ${
                index <= moment ? "text-foreground" : "text-muted/65"
              }`}
            >
              <span className="mr-1 tabular-nums text-muted">0{index + 1}</span>
              {item.label}
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

function OnboardingStepPanel({
  current,
  moment,
  fields,
  setFields,
  providers,
  manualCompetitor,
  setManualCompetitor,
  error,
  isDiscovering,
  discoveryStage,
  subscribed,
  createPending,
  checkoutLoading,
  onBeginDiscovery,
  onAddCompetitor,
  onContinueBrief,
  onBack,
  onSubmit,
  onStartCheckout,
}: {
  current: (typeof MOMENTS)[number];
  moment: number;
  fields: Fields;
  setFields: React.Dispatch<React.SetStateAction<Fields>>;
  providers: ProviderOption[];
  manualCompetitor: { name: string; url: string };
  setManualCompetitor: React.Dispatch<React.SetStateAction<{ name: string; url: string }>>;
  error: string | null;
  isDiscovering: boolean;
  discoveryStage: DiscoveryStage;
  subscribed: boolean;
  createPending: boolean;
  checkoutLoading: PlanId | null;
  onBeginDiscovery: () => void;
  onAddCompetitor: () => void;
  onContinueBrief: () => void;
  onBack: () => void;
  onSubmit: () => void;
  onStartCheckout: (planId: PlanId) => void;
}) {
  return (
    <section className="min-w-0">
      <div
        key={`${moment}-${isDiscovering ? "working" : "ready"}`}
        className="onboarding-step"
      >
        <p className="text-sm font-semibold text-accent">{current.label}</p>
        <h1 className="type-display mt-2 max-w-3xl text-4xl text-foreground sm:text-5xl">
          {isDiscovering ? "Claudia is building your brief" : current.title}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-muted sm:text-base">
          {isDiscovering
            ? "She is turning the site into a practical first-week plan. Watch the useful pieces come together while research runs."
            : current.description}
        </p>

        <div className="mt-8 sm:mt-10">
          {isDiscovering ? (
            <OnboardingDiscovery
              brandName={fields.name}
              website={fields.website}
              stage={discoveryStage}
            />
          ) : moment === 0 ? (
            <SiteMoment fields={fields} setFields={setFields} onContinue={onBeginDiscovery} />
          ) : moment === 1 ? (
            <BriefMoment
              fields={fields}
              setFields={setFields}
              manualCompetitor={manualCompetitor}
              setManualCompetitor={setManualCompetitor}
              addCompetitor={onAddCompetitor}
            />
          ) : (
            <AuthorityMoment fields={fields} setFields={setFields} providers={providers} />
          )}
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-6 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground"
          >
            {error}
          </p>
        ) : null}

        {!isDiscovering ? (
          <div className="mt-8">
            <div className="flex flex-wrap items-center gap-3">
              {moment === 0 ? (
                <Button onPress={onBeginDiscovery}>Build my brief</Button>
              ) : moment === 1 ? (
                <Button onPress={onContinueBrief}>Looks right — continue</Button>
              ) : subscribed ? (
                <LoadingButton
                  isPending={createPending}
                  pendingLabel="Starting…"
                  onPress={onSubmit}
                >
                  Start Claudia&apos;s first day
                </LoadingButton>
              ) : null}
              {moment > 0 ? (
                <Button variant="ghost" isDisabled={createPending} onPress={onBack}>
                  Back
                </Button>
              ) : null}
            </div>
            {moment < 2 ? (
              <p className="mt-3 text-xs leading-5 text-muted">
                Saved automatically · Everything remains editable later
              </p>
            ) : null}
          </div>
        ) : null}

        {moment === 2 && !subscribed ? (
          <PlanChoices loading={checkoutLoading} onPick={onStartCheckout} />
        ) : null}
      </div>
    </section>
  );
}

function OnboardingValueRail({
  isFirstBrand,
  moment,
}: {
  isFirstBrand: boolean;
  moment: number;
}) {
  const details = [
    "Your brief saves automatically",
    "Every assumption stays editable",
    moment === 2 ? "Cancel or change plans anytime" : "No technical setup required",
  ];

  return (
    <aside className="hidden lg:sticky lg:top-8 lg:block" aria-label="Setup benefits">
      <div className="material-panel rounded-[1.75rem] p-5">
        {isFirstBrand ? (
          <>
            <span className="grid size-10 place-items-center rounded-2xl bg-accent-soft text-accent-soft-foreground">
              <SparklesIcon className="size-5" />
            </span>
            <p className="mt-5 text-3xl font-semibold tracking-tight text-foreground tabular-nums">
              {SIGNUP_GRANT_CREDITS}
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">free credits are ready</p>
            <p className="mt-2 text-xs leading-5 text-muted">
              Already added to your workspace—enough for your first complete article.
            </p>
          </>
        ) : (
          <>
            <span className="grid size-10 place-items-center rounded-2xl bg-success-soft text-success-soft-foreground">
              <CheckIcon className="size-5" />
            </span>
            <p className="mt-5 font-semibold text-foreground">A calm, reversible setup</p>
            <p className="mt-2 text-xs leading-5 text-muted">
              Add this brand without changing how your existing workspace runs.
            </p>
          </>
        )}

        <ul className="mt-6 space-y-3">
          {details.map((detail) => (
            <li key={detail} className="flex items-start gap-2.5 text-xs leading-5 text-muted">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-accent" />
              {detail}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 text-center text-xs leading-5 text-muted">
        Private by default · Built for your workspace
      </p>
    </aside>
  );
}

function SiteMoment({
  fields,
  setFields,
  onContinue,
}: {
  fields: Fields;
  setFields: React.Dispatch<React.SetStateAction<Fields>>;
  onContinue: () => void;
}) {
  return (
    <div className="material-panel max-w-xl space-y-5 rounded-[1.75rem] p-5 sm:p-6">
      <div className="space-y-2">
        <Label htmlFor="onboarding-website">Website URL</Label>
        <Input
          id="onboarding-website"
          autoFocus
          autoComplete="url"
          fullWidth
          type="url"
          variant="secondary"
          placeholder="https://example.com"
          value={fields.website}
          onChange={(event) => setFields((current) => ({ ...current, website: event.target.value }))}
          onKeyDown={(event) => {
            if (event.key === "Enter") onContinue();
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="onboarding-name">Brand name <span className="text-muted">(optional)</span></Label>
        <Input
          id="onboarding-name"
          fullWidth
          variant="secondary"
          placeholder="Derived from the site when left blank"
          value={fields.name}
          onChange={(event) => setFields((current) => ({ ...current, name: event.target.value }))}
          onKeyDown={(event) => {
            if (event.key === "Enter") onContinue();
          }}
        />
      </div>
      <p className="text-xs leading-5 text-muted">
        Claudia uses the public site to draft your positioning, buyer profiles, competitors, and
        first-week plan. Press Enter to continue.
      </p>
    </div>
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
    (key: keyof Pick<Fields, "name" | "productDescription" | "audience" | "tone" | "seedKeywords">) =>
    (event: { target: { value: string } }) =>
      setFields((current) => ({ ...current, [key]: event.target.value }));
  return (
    <div className="space-y-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="brief-name">Brand</Label>
          <Input id="brief-name" fullWidth variant="secondary" value={fields.name} onChange={set("name")} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="brief-product">What the brand sells</Label>
          <TextArea id="brief-product" fullWidth rows={4} variant="secondary" value={fields.productDescription} onChange={set("productDescription")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="brief-audience">Who it serves</Label>
          <TextArea id="brief-audience" fullWidth rows={3} variant="secondary" value={fields.audience} onChange={set("audience")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="brief-tone">How it should sound</Label>
          <TextArea id="brief-tone" fullWidth rows={3} variant="secondary" value={fields.tone} onChange={set("tone")} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="brief-keywords">Initial query themes</Label>
          <Input id="brief-keywords" fullWidth variant="secondary" value={fields.seedKeywords} onChange={set("seedKeywords")} />
        </div>
      </div>

      <section>
        <h2 className="text-xl text-foreground">Main competitors</h2>
        <div className="mt-3 space-y-2">
          {fields.competitors.map((competitor) => (
            <div key={competitor.url} className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-surface-secondary px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{competitor.name}</p>
                <p className="truncate text-xs text-muted">{competitor.url}</p>
              </div>
              <Button size="sm" variant="ghost" onPress={() => setFields((current) => ({ ...current, competitors: current.competitors.filter((item) => item.url !== competitor.url) }))}>
                Remove
              </Button>
            </div>
          ))}
          {!fields.competitors.length ? <p className="text-sm text-muted">No confident competitor matches yet.</p> : null}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
          <Input aria-label="Competitor name" variant="secondary" placeholder="Competitor" value={manualCompetitor.name} onChange={(event) => setManualCompetitor((current) => ({ ...current, name: event.target.value }))} />
          <Input aria-label="Competitor URL" type="url" variant="secondary" placeholder="https://competitor.com" value={manualCompetitor.url} onChange={(event) => setManualCompetitor((current) => ({ ...current, url: event.target.value }))} />
          <Button variant="secondary" onPress={addCompetitor}>Add</Button>
        </div>
      </section>

      {fields.useCases.length ? (
        <section>
          <h2 className="text-xl text-foreground">Buyer profiles</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {fields.useCases.map((useCase, index) => (
              <button
                key={`${useCase.job}-${useCase.persona}`}
                type="button"
                aria-pressed={useCase.enabled}
                onClick={() => setFields((current) => ({ ...current, useCases: current.useCases.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: !item.enabled } : item) }))}
                className={`pressable min-h-20 rounded-xl p-3 text-left ${useCase.enabled ? "bg-accent-soft text-accent-soft-foreground" : "bg-surface-secondary text-muted"}`}
              >
                <span className="block text-sm font-medium">{useCase.persona}</span>
                <span className="mt-1 block text-xs leading-5 opacity-80">{useCase.job}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl bg-surface-secondary p-5">
        <h2 className="text-xl text-foreground">First-week plan</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2">
          {["Establish the visibility baseline", "Track the questions buyers ask AI", "Research the strongest content opportunity", "Prepare and write the first useful asset"].map((item, index) => (
            <li key={item} className="flex items-start gap-3 text-sm leading-6 text-foreground">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs tabular-nums">{index + 1}</span>
              {item}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function AuthorityMoment({
  fields,
  setFields,
  providers,
}: {
  fields: Fields;
  setFields: React.Dispatch<React.SetStateAction<Fields>>;
  providers: ProviderOption[];
}) {
  const provider = providers.find((item) => item.id === fields.integrationProvider) ?? null;
  const setConfig =
    (key: IntegrationConfigKey): ChangeEventHandler<HTMLInputElement> =>
    (event) => setFields((current) => ({ ...current, integrationConfig: { ...current.integrationConfig, [key]: event.target.value } }));
  const setSecret =
    (key: IntegrationSecretKey): ChangeEventHandler<HTMLInputElement> =>
    (event) => setFields((current) => ({ ...current, integrationSecrets: { ...current.integrationSecrets, [key]: event.target.value } }));
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl text-foreground">Authority</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {([
            { value: "FULL_AUTO" as const, title: "Autopilot", description: "Publish approved Claudia-created articles automatically. Site fixes remain prepared unless a proven capability exists." },
            { value: "REVIEW" as const, title: "Copilot", description: "Prepare the same work, but wait for owner approval before publishing articles." },
          ]).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={fields.autonomyMode === option.value}
              onClick={() => setFields((current) => ({ ...current, autonomyMode: option.value }))}
              className={`pressable relative min-h-36 rounded-2xl border p-5 pr-14 text-left outline-none transition-[background-color,border-color,box-shadow,filter] duration-ui ease-out-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                fields.autonomyMode === option.value
                  ? "border-accent bg-accent-soft/80 text-accent-soft-foreground shadow-surface ring-2 ring-accent/30 brightness-105"
                  : "border-border/60 bg-surface-secondary text-foreground hover-fine:border-accent/40 hover-fine:bg-surface"
              }`}
            >
              <span
                className={`absolute right-4 top-4 grid size-7 place-items-center rounded-full transition-[background-color,border-color,color,box-shadow] duration-ui ease-out-strong ${
                  fields.autonomyMode === option.value
                    ? "border border-accent bg-accent text-accent-foreground shadow-sm"
                    : "border border-border bg-surface/70 text-transparent"
                }`}
                aria-hidden
              >
                <CheckIcon className="size-4" />
              </span>
              <span className="text-lg font-semibold">{option.title}</span>
              <span className="mt-1 block text-xs font-medium opacity-70">
                {option.value === "FULL_AUTO" ? "Publishes automatically" : "You approve publishing"}
              </span>
              <span className="mt-2 block text-sm leading-6 opacity-80">{option.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl text-foreground">Publishing connection</h2>
        <p className="mt-1 text-sm leading-6 text-muted">Connect now, or skip and Claudia will place it in Waiting only when it unlocks useful work.</p>
        <div className="mt-4 max-w-xl space-y-4">
          <Select
            aria-label="Publishing destination"
            fullWidth
            variant="secondary"
            placeholder="Connect later"
            value={fields.integrationProvider || null}
            onChange={(value) => setFields((current) => ({ ...current, integrationProvider: value && value !== SKIP_PROVIDER_KEY ? (String(value) as IntegrationProviderId) : "", integrationConfig: {}, integrationSecrets: {} }))}
          >
            <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id={SKIP_PROVIDER_KEY} textValue="Connect later">Connect later<ListBox.ItemIndicator /></ListBox.Item>
                {providers.map((item) =>
                  item.status === "available" ? (
                    <ListBox.Item key={item.id} id={item.id} textValue={item.name}>
                      {item.name}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ) : null,
                )}
              </ListBox>
            </Select.Popover>
          </Select>
          {provider ? <ConnectionFields provider={provider} config={fields.integrationConfig} secrets={fields.integrationSecrets} onConfig={setConfig} onSecret={setSecret} /> : null}
        </div>
      </section>

      <section className="rounded-2xl bg-surface-secondary p-5">
        <p className="font-medium text-foreground">Analytics can connect after start</p>
        <p className="mt-1 text-sm leading-6 text-muted">Search Console needs the saved brand context. Claudia will request it only when real traffic proof can improve the next decision.</p>
      </section>
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

function PlanChoices({ loading, onPick }: { loading: PlanId | null; onPick: (planId: PlanId) => void }) {
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>(POPULAR_PLAN);
  const selectedPlan = plans[selectedPlanId];
  const selectedCopy = PLAN_CHOICE_COPY[selectedPlanId];
  const cadence = selectedPlan.visibility.monitoringCadence;
  const highlights = [
    `Capacity for up to ${articlesPerMonth(selectedPlan.monthlyCredits)} search-led articles each month`,
    `${cadence.charAt(0).toUpperCase() + cadence.slice(1)} visibility checks with ${selectedPlan.visibility.trackedPrompts} buyer questions tracked`,
    `${selectedPlan.visibility.autoFixCap} safe site fixes included every month — never a per-fix bill`,
  ];

  return (
    <section className="mt-12 border-t border-separator pt-10" aria-labelledby="plan-choice-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-accent">Ready to launch</p>
          <h2 id="plan-choice-title" className="mt-1 text-3xl text-foreground">Choose your starting pace</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Start where the workload fits today. Every plan includes research, writing, publishing,
            and safe fixes.
          </p>
        </div>
        <p className="shrink-0 text-xs font-medium text-muted">No long-term contract</p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Object.values(plans).map((plan) => {
          const selected = plan.id === selectedPlanId;
          return (
            <button
              key={plan.id}
              type="button"
              aria-pressed={selected}
              disabled={loading !== null}
              onClick={() => setSelectedPlanId(plan.id)}
              className={`pressable relative min-h-44 rounded-2xl border p-4 text-left outline-none transition-[background-color,border-color,box-shadow,filter,opacity] duration-ui ease-out-strong focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-60 ${
                selected
                  ? "border-accent bg-accent-soft/75 shadow-surface ring-2 ring-accent/25 brightness-105"
                  : "border-border/60 bg-surface/75 hover-fine:border-accent/35 hover-fine:bg-surface"
              }`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="font-semibold text-foreground">{plan.name}</span>
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full transition-[background-color,border-color,color] duration-ui ${
                    selected
                      ? "border border-accent bg-accent text-accent-foreground"
                      : "border border-border/70 bg-surface text-transparent"
                  }`}
                  aria-hidden
                >
                  <CheckIcon className="size-3.5" />
                </span>
              </span>
              <span className={`mt-2 block text-xs font-medium ${plan.id === POPULAR_PLAN ? "text-accent" : "text-muted"}`}>
                {PLAN_CHOICE_COPY[plan.id].eyebrow}
              </span>
              <span className="mt-3 block text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                ${plan.price}<span className="text-xs font-normal text-muted"> / month</span>
              </span>
              <span className="mt-1 block text-xs font-medium text-foreground tabular-nums">
                {plan.monthlyCredits.toLocaleString()} credits / month
              </span>
              <span className="mt-2 block text-xs leading-5 text-muted">{PLAN_CHOICE_COPY[plan.id].fit}</span>
            </button>
          );
        })}
      </div>

      <div className="material-panel mt-4 overflow-hidden rounded-[1.5rem] border-accent/25">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold text-accent">{selectedCopy.eyebrow}</p>
            <h3 className="mt-2 text-2xl text-foreground">Start with {selectedPlan.name}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{selectedCopy.fit}</p>
          </div>

          <div className="lg:pl-4">
            <p className="text-sm font-semibold text-foreground">What this pace unlocks</p>
            <ul className="mt-4 space-y-3">
              {highlights.map((highlight) => (
                <li key={highlight} className="flex items-start gap-3 text-sm leading-6 text-foreground/90">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                    <CheckIcon className="size-3" />
                  </span>
                  {highlight}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-border/50 bg-surface/55 px-5 py-4 sm:px-6">
          <LoadingButton
            fullWidth
            variant="primary"
            isPending={loading === selectedPlanId}
            isDisabled={loading !== null}
            pendingLabel="Opening secure checkout…"
            onPress={() => onPick(selectedPlanId)}
          >
            Start with {selectedPlan.name}
          </LoadingButton>
          <p className="mt-3 text-center text-xs leading-5 text-muted">
            Encrypted Stripe checkout · Setup saved · Change or cancel anytime
          </p>
        </div>
      </div>
    </section>
  );
}

function CenteredFrame({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">{children}</div>;
}
