"use client";

import { Button } from "@heroui/react/button";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { TextArea } from "@heroui/react/textarea";
import { Select } from "@heroui/react/select";
import { ListBox } from "@heroui/react/list-box";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEventHandler,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { LoadingButton } from "@/components/ui/loading-button";
import { TagInput } from "@/components/ui/tag-input";
import { apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys, useMe } from "@/lib/api/queries";
import { articlesPerMonth, isActiveSubscription, plans, type PlanId } from "@/lib/billing/plans";
import { MAX_COMPETITORS } from "@/lib/brand/schemas";
import type {
  IntegrationConfigKey,
  IntegrationProviderDefinition,
  IntegrationProviderId,
  IntegrationSecretKey,
} from "@/lib/integrations/providers";

type ProviderOption = IntegrationProviderDefinition;

/*
 * Fullscreen, one-question-at-a-time onboarding. Deliberately no step list,
 * numbers, or counters — a thin progress bar is the only pacing cue, so the
 * flow never reads as "homework". Each screen is a conversation beat where
 * Claudia does the work (prefill, competitor scan, use-case mapping) and the
 * user just confirms. The final screen is the paywall: paid-first, no idle state.
 */
const STEPS = [
  {
    question: "What's your brand called?",
    hint: "Claudia reads your website and fills in the rest herself.",
    optional: false,
  },
  {
    question: "Here's how Claudia understood you",
    hint: "She drafted this from your website — fix anything that reads wrong.",
    optional: false,
  },
  {
    question: "Any topics you already know matter?",
    hint: "A few seed keywords help her first research run. She'll find plenty more on her own.",
    optional: true,
  },
  {
    question: "Here are your closest rivals",
    hint: "Claudia scanned the market — untick anything that isn't a real competitor. She benchmarks these and hunts the gaps.",
    optional: true,
  },
  {
    question: "What buyers hire you for",
    hint: "Claudia mapped the jobs your buyers come for. Confirm these and she writes the tutorials, comparisons, and answer pages that win them.",
    optional: true,
  },
  {
    question: "Where should articles get published?",
    hint: "Connect now or later in Settings — drafts still pile up either way.",
    optional: true,
  },
  {
    question: "How hands-on do you want to be?",
    hint: "You can change this anytime in Settings.",
    optional: false,
  },
  {
    question: "Put Claudia to work",
    hint: "",
    optional: false,
  },
] as const;

// Step indices — named so the flow reads clearly and reorders safely.
const STEP_BASICS = 0;
const STEP_POSITIONING = 1;
const STEP_KEYWORDS = 2;
const STEP_COMPETITORS = 3;
const STEP_USE_CASES = 4;
const STEP_PUBLISHING = 5;
const STEP_AUTONOMY = 6;
const STEP_LAUNCH = 7;

type DiscoveredCompetitor = { name: string; url: string; reason?: string };
type DraftUseCase = { job: string; persona: string; industry: string; enabled: boolean };

type Fields = {
  name: string;
  website: string;
  productDescription: string;
  audience: string;
  tone: string;
  seedKeywords: string;
  competitors: DiscoveredCompetitor[];
  useCases: DraftUseCase[];
  integrationProvider: "" | IntegrationProviderId;
  integrationConfig: Record<string, string>;
  integrationSecrets: Record<string, string>;
  autonomyMode: "FULL_AUTO" | "REVIEW";
};

// The scalar text fields the `set` helper drives.
type TextFieldKey = "name" | "website" | "productDescription" | "audience" | "tone" | "seedKeywords";

type BrandCreatePayload = {
  name: string;
  website: string;
  productDescription: string;
  audience: string;
  tone: string;
  seedKeywords: string;
  competitors: { name: string; url: string }[];
  useCases: { job: string; persona: string; industry: string }[];
  integrationProvider: "" | IntegrationProviderId;
  integrationConfig: Record<string, string>;
  integrationSecrets: Record<string, string>;
  autonomyMode: "FULL_AUTO" | "REVIEW";
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

// AP2 — the one autonomy question at onboarding. Per-category fine-tuning
// lives in settings for the few who want it.
const AUTONOMY_OPTIONS = [
  {
    value: "FULL_AUTO" as const,
    title: "Autopilot",
    recommended: true,
    description:
      "Claudia publishes articles and applies safe fixes herself. Everything is logged and reversible.",
  },
  {
    value: "REVIEW" as const,
    title: "Copilot",
    recommended: false,
    description: "Claudia prepares everything and asks before publishing or changing anything.",
  },
];

const POPULAR_PLAN: PlanId = "startup";

// Sentinel key for the "skip" option in the publishing Select. The Select works
// in terms of keys, so we map this back to an empty `integrationProvider`.
const SKIP_PROVIDER_KEY = "__skip__";

// Fields the AI prefill can populate. Kept in sync with the prefill API response.
const PREFILL_KEYS = ["productDescription", "audience", "tone", "seedKeywords"] as const;

// Cycled under the prefill overlay so it reads as active work, not a dead spinner.
const PREFILL_MESSAGES = [
  "Reading your website…",
  "Understanding what your brand does…",
  "Identifying your audience and tone…",
  "Picking seed keywords to research…",
] as const;

// The onboarding draft survives the Stripe redirect (checkout happens before the
// brand exists) and a mid-flow refresh. Cleared once the brand is created.
const DRAFT_KEY = "claudia:onboarding-draft";

type OnboardingDraft = { fields: Fields; step: number };

function loadDraft(): OnboardingDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as OnboardingDraft) : null;
  } catch {
    return null;
  }
}

function saveDraft(draft: OnboardingDraft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Ignore — a full/blocked localStorage just means no resume across redirect.
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // No-op.
  }
}

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function trimRecord(record: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, value.trim()]),
  );
}

function buildPayload(fields: Fields): BrandCreatePayload {
  return {
    name: fields.name.trim(),
    website: fields.website.trim(),
    productDescription: fields.productDescription.trim(),
    audience: fields.audience.trim(),
    tone: fields.tone.trim(),
    seedKeywords: fields.seedKeywords.trim(),
    competitors: fields.competitors.map((competitor) => ({
      name: competitor.name,
      url: competitor.url,
    })),
    useCases: fields.useCases
      .filter((useCase) => useCase.enabled && useCase.job.trim() && useCase.persona.trim())
      .map((useCase) => ({
        job: useCase.job,
        persona: useCase.persona,
        industry: useCase.industry,
      })),
    integrationProvider: fields.integrationProvider,
    integrationConfig: trimRecord(fields.integrationConfig),
    integrationSecrets: trimRecord(fields.integrationSecrets),
    autonomyMode: fields.autonomyMode,
  };
}

export function BrandOnboardingForm({ providers }: { providers: ProviderOption[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const isSubscribed = isActiveSubscription(me.data?.subscription?.status);

  const [step, setStep] = useState(0);
  // Controlled fields — HeroUI/react-aria inputs do not reliably surface their
  // value through native FormData when used bare, so we own the state here.
  const [fields, setFields] = useState<Fields>(INITIAL_FIELDS);
  const [error, setError] = useState<string | null>(null);
  const [prefillState, setPrefillState] = useState({ prefilled: false, messageIndex: 0 });
  const [competitorSuggestions, setCompetitorSuggestions] = useState<DiscoveredCompetitor[]>([]);
  const [manualCompetitor, setManualCompetitor] = useState({ name: "", url: "" });
  const [checkoutLoading, setCheckoutLoading] = useState<PlanId | null>(null);
  // "finalizing" = returned from Stripe; restore draft, wait for the subscription
  // webhook, then create the brand.
  const [phase, setPhase] = useState<"form" | "finalizing">("form");
  const [finalizeTimedOut, setFinalizeTimedOut] = useState(false);
  // Persistence is gated until bootstrap has read localStorage, so the empty
  // initial state never clobbers a saved draft (e.g. across the Stripe redirect).
  const [ready, setReady] = useState(false);

  // The name+website we last sent to prefill / discovery, so re-entering a step
  // only re-runs the work when the inputs actually changed.
  const lastPrefillKey = useRef("");
  const competitorKeyRef = useRef("");
  const useCaseKeyRef = useRef("");
  const bootstrappedRef = useRef(false);
  const finalizeStartedRef = useRef(false);
  const fieldsRef = useRef(fields);
  const stepRef = useRef<HTMLDivElement>(null);
  const lastStep = STEPS.length - 1;

  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  // Autofocus the first field of each screen so Enter-to-continue flows
  // without reaching for the mouse.
  useEffect(() => {
    const el = stepRef.current?.querySelector<HTMLElement>("input, textarea");
    el?.focus();
  }, [step]);

  const setField = (key: TextFieldKey, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  const set =
    (key: TextFieldKey) =>
    (event: { target: { value: string } }) =>
      setField(key, event.target.value);

  const setIntegrationConfig =
    (key: IntegrationConfigKey): ChangeEventHandler<HTMLInputElement> =>
    (event) =>
      setFields((prev) => ({
        ...prev,
        integrationConfig: { ...prev.integrationConfig, [key]: event.target.value },
      }));

  const setIntegrationSecret =
    (key: IntegrationSecretKey): ChangeEventHandler<HTMLInputElement> =>
    (event) =>
      setFields((prev) => ({
        ...prev,
        integrationSecrets: { ...prev.integrationSecrets, [key]: event.target.value },
      }));

  // AI prefill — best-effort, runs on the entered name + website without saving
  // anything. Only fills fields the user hasn't touched, and a failure is silent
  // so the user can always continue filling the form manually.
  const prefill = useMutation({
    mutationFn: (payload: { name: string; website: string }) =>
      apiPost<{ profile: Record<(typeof PREFILL_KEYS)[number], string> }>(
        "/api/brand/prefill",
        payload,
      ),
    onSuccess: ({ profile }) => {
      setFields((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const key of PREFILL_KEYS) {
          if (!prev[key].trim() && profile[key]?.trim()) {
            next[key] = profile[key];
            changed = true;
          }
        }
        if (changed) {
          setPrefillState((state) => ({ ...state, prefilled: true }));
        }
        return next;
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.onboarding });
    },
  });

  // Competitor autofill — free during onboarding (no brand row, no credits),
  // rate-limited server-side. Pre-selects everything it finds; the user unticks.
  const competitorsPreview = useMutation({
    mutationFn: (payload: {
      name: string;
      website: string;
      productDescription: string;
      seedKeywords: string;
    }) => apiPost<{ suggestions: DiscoveredCompetitor[] }>("/api/brand/competitors/preview", payload),
    onSuccess: ({ suggestions }) => {
      setCompetitorSuggestions(suggestions);
      setFields((prev) => ({ ...prev, competitors: suggestions.slice(0, MAX_COMPETITORS) }));
    },
  });

  // Use-case autofill — same free/preview treatment. Maps the jobs buyers hire
  // the product for straight from the prefilled profile.
  const useCasesPreview = useMutation({
    mutationFn: (payload: {
      name: string;
      website: string;
      productDescription: string;
      audience: string;
      seedKeywords: string;
    }) =>
      apiPost<{ useCases: { job: string; persona: string; industry: string | null }[] }>(
        "/api/brand/use-cases/preview",
        payload,
      ),
    onSuccess: ({ useCases }) => {
      setFields((prev) => ({
        ...prev,
        useCases: useCases.map((useCase) => ({
          job: useCase.job,
          persona: useCase.persona,
          industry: useCase.industry ?? "",
          enabled: true,
        })),
      }));
    },
  });

  function runCompetitorPreview(force: boolean) {
    const current = fieldsRef.current;
    const name = current.name.trim();
    if (!name) return;
    const key = `${name}|${current.website.trim()}`;
    if (!force && (competitorKeyRef.current === key || competitorsPreview.isPending)) return;
    competitorKeyRef.current = key;
    competitorsPreview.mutate({
      name,
      website: current.website.trim(),
      productDescription: current.productDescription.trim(),
      seedKeywords: current.seedKeywords.trim(),
    });
  }

  function runUseCasePreview(force: boolean) {
    const current = fieldsRef.current;
    const name = current.name.trim();
    if (!name) return;
    const key = `${name}|${current.productDescription.trim().slice(0, 80)}`;
    if (!force && (useCaseKeyRef.current === key || useCasesPreview.isPending)) return;
    useCaseKeyRef.current = key;
    useCasesPreview.mutate({
      name,
      website: current.website.trim(),
      productDescription: current.productDescription.trim(),
      audience: current.audience.trim(),
      seedKeywords: current.seedKeywords.trim(),
    });
  }

  // Kick off the auto-discovery when the user reaches each step. Guarded by a key
  // ref so navigating back and forth doesn't re-run identical work.
  useEffect(() => {
    if (phase !== "form") return;
    if (step === STEP_COMPETITORS) runCompetitorPreview(false);
    if (step === STEP_USE_CASES) runUseCasePreview(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, phase]);

  // Cycle the overlay copy while prefill runs so it feels alive, not stuck.
  useEffect(() => {
    if (!prefill.isPending) {
      setPrefillState((state) => ({ ...state, messageIndex: 0 }));
      return;
    }
    const id = setInterval(
      () =>
        setPrefillState((state) => ({
          ...state,
          messageIndex: (state.messageIndex + 1) % PREFILL_MESSAGES.length,
        })),
      1500,
    );
    return () => clearInterval(id);
  }, [prefill.isPending]);

  // Create the brand, its profile, competitors, use cases, and an optional
  // publishing integration in one request, then start Claudia's Setup Run.
  const create = useMutation({
    mutationFn: (data: BrandCreatePayload) =>
      apiPost<{ brand: { id: string; name: string }; canIgnite?: boolean }>("/api/brands", data),
    onSuccess: async ({ canIgnite }) => {
      clearDraft();
      // Ignition (AP2): subscribed workspaces start Claudia's Setup Run right
      // away. By this point the flow has already gated on a plan, so canIgnite is
      // expected true — the billing fallback stays only as a safety net.
      if (canIgnite) {
        void fetch("/api/setup-run", { method: "POST" }).catch(() => undefined);
      }
      // Await the `me` refetch: the app layout decides "needs onboarding" from its
      // brand count, so we must not navigate until `me` reflects the new brand.
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      queryClient.invalidateQueries({ queryKey: queryKeys.brands });
      queryClient.invalidateQueries({ queryKey: queryKeys.onboarding });
      queryClient.invalidateQueries({ queryKey: queryKeys.brandProfile });
      queryClient.invalidateQueries({ queryKey: queryKeys.competitors });
      queryClient.invalidateQueries({ queryKey: queryKeys.useCases });
      queryClient.invalidateQueries({ queryKey: queryKeys.integrations });
      router.push(canIgnite ? "/dashboard" : "/account?tab=billing&next=ignition");
    },
    onError: (err) => {
      setError(getErrorMessage(err, "Could not create brand. Please try again."));
    },
  });

  function submitCreate() {
    const current = fieldsRef.current;
    if (!current.name.trim()) {
      setError("Brand name is required.");
      setPhase("form");
      setStep(STEP_BASICS);
      return;
    }
    setError(null);
    create.mutate(buildPayload(current));
  }

  // Persist the draft on every change so a Stripe redirect (or refresh) can
  // resume exactly where the user left off. Gated on `ready` so it never runs
  // before bootstrap has restored (and thus can't clobber the saved draft), and
  // skipped while finalizing.
  useEffect(() => {
    if (!ready || phase === "finalizing") return;
    saveDraft({ fields, step });
  }, [ready, fields, step, phase]);

  // Bootstrap: restore any draft and react to the checkout return params. Runs
  // once on mount before anything else touches state.
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const draft = loadDraft();

    if (draft) {
      setFields(draft.fields);
      setCompetitorSuggestions(draft.fields.competitors ?? []);
      // Preserve restored picks — seed the dedupe keys so resuming on the
      // competitor/use-case step doesn't re-run discovery and re-select all.
      const signature = `${draft.fields.name?.trim() ?? ""}|${draft.fields.website?.trim() ?? ""}`;
      if (draft.fields.competitors?.length) competitorKeyRef.current = signature;
      if (draft.fields.useCases?.length) {
        useCaseKeyRef.current = `${draft.fields.name?.trim() ?? ""}|${(draft.fields.productDescription ?? "").trim().slice(0, 80)}`;
      }
    }

    if (checkout === "success") {
      setPhase("finalizing");
      window.history.replaceState(null, "", "/onboarding");
    } else if (checkout === "canceled") {
      setStep(STEP_LAUNCH);
      setError("Checkout canceled — pick a plan when you're ready. Your setup is saved.");
      window.history.replaceState(null, "", "/onboarding");
    } else if (draft) {
      setStep(Math.min(draft.step ?? 0, lastStep));
    }

    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While finalizing, poll the subscription until Stripe's webhook flips it
  // active (it can lag the redirect by a second or two).
  const refetchMe = me.refetch;
  useEffect(() => {
    if (phase !== "finalizing" || isSubscribed) return;
    const poll = setInterval(() => {
      void refetchMe();
    }, 2500);
    const timeout = setTimeout(() => setFinalizeTimedOut(true), 45000);
    return () => {
      clearInterval(poll);
      clearTimeout(timeout);
    };
  }, [phase, isSubscribed, refetchMe]);

  // Once the subscription is active, create the brand exactly once.
  useEffect(() => {
    if (phase === "finalizing" && isSubscribed && !finalizeStartedRef.current) {
      finalizeStartedRef.current = true;
      submitCreate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isSubscribed]);

  async function startCheckout(planId: PlanId) {
    setError(null);
    setCheckoutLoading(planId);
    // Force-save so the draft is on disk before we leave the page.
    saveDraft({ fields, step: STEP_LAUNCH });
    try {
      const data = await apiPost<{ url: string }>("/api/billing/checkout", {
        planId,
        returnTo: "onboarding",
      });
      window.location.href = data.url;
    } catch (err) {
      setError(getErrorMessage(err, "Could not start checkout. Please try again."));
      setCheckoutLoading(null);
    }
  }

  function toggleCompetitor(url: string) {
    setFields((prev) => {
      const has = prev.competitors.some((competitor) => competitor.url === url);
      if (has) {
        return { ...prev, competitors: prev.competitors.filter((c) => c.url !== url) };
      }
      if (prev.competitors.length >= MAX_COMPETITORS) {
        return prev;
      }
      const suggestion = competitorSuggestions.find((s) => s.url === url);
      return suggestion ? { ...prev, competitors: [...prev.competitors, suggestion] } : prev;
    });
  }

  function addManualCompetitor() {
    const name = manualCompetitor.name.trim();
    const url = manualCompetitor.url.trim();
    if (!name || !isValidUrl(url)) {
      setError("Enter a competitor name and a valid URL, including https://");
      return;
    }
    setError(null);
    const suggestion: DiscoveredCompetitor = { name, url };
    setCompetitorSuggestions((prev) =>
      prev.some((s) => s.url === url) ? prev : [...prev, suggestion],
    );
    setFields((prev) =>
      prev.competitors.some((c) => c.url === url) || prev.competitors.length >= MAX_COMPETITORS
        ? prev
        : { ...prev, competitors: [...prev.competitors, suggestion] },
    );
    setManualCompetitor({ name: "", url: "" });
  }

  function toggleUseCase(index: number) {
    setFields((prev) => ({
      ...prev,
      useCases: prev.useCases.map((useCase, i) =>
        i === index ? { ...useCase, enabled: !useCase.enabled } : useCase,
      ),
    }));
  }

  function advance() {
    setError(null);

    if (step === STEP_BASICS) {
      const name = fields.name.trim();
      const website = fields.website.trim();
      if (!name) {
        setError("Brand name is required.");
        return;
      }
      if (website && !isValidUrl(website)) {
        setError("Enter a valid website URL, including https://");
        return;
      }
      // Kick off prefill in the background (only when the inputs changed) and
      // move on — the overlay on the positioning screen shows it working.
      const key = `${name}|${website}`;
      if (key !== lastPrefillKey.current) {
        lastPrefillKey.current = key;
        setPrefillState((state) => ({ ...state, prefilled: false }));
        prefill.mutate({ name, website });
      }
    }

    setStep((value) => Math.min(lastStep, value + 1));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Only the subscribed path submits here; free users go through the plan
    // cards (which drive checkout, not this form).
    if (step !== STEP_LAUNCH || !isSubscribed) return;
    submitCreate();
  }

  // Enter advances (except in textareas, listboxes, tag inputs mid-entry, and on
  // the no-advance discovery screens, where the primary action isn't "next").
  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter" || step === lastStep) return;
    const target = event.target as HTMLElement;
    if (
      target.tagName === "TEXTAREA" ||
      target.closest("[role=listbox]") ||
      target.closest("[data-no-advance]")
    ) {
      return;
    }
    event.preventDefault();
    advance();
  }

  if (phase === "finalizing") {
    return (
      <FinalizeScreen
        timedOut={finalizeTimedOut}
        creating={create.isPending}
        error={error}
        onRetry={() => {
          setError(null);
          setFinalizeTimedOut(false);
          finalizeStartedRef.current = false;
          void refetchMe();
        }}
      />
    );
  }

  const current = STEPS[step];
  const progress = ((step + 1) / STEPS.length) * 100;
  const launchHint = isSubscribed
    ? "Everything's ready. Launch her setup run and she takes it from here."
    : "Pick a plan to unlock Claudia. Your setup is saved — you'll come right back here.";

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="flex min-h-dvh flex-col">
      {/* The only pacing cue — a hairline progress bar. No steps, no numbers. */}
      <div className="fixed inset-x-0 top-0 z-20 h-0.5 bg-border/50">
        <div
          className="h-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div key={step} ref={stepRef} className="onboarding-step w-full max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {current.question}
          </h1>
          <p className="mt-2 text-sm text-muted sm:text-base">
            {step === STEP_LAUNCH ? launchHint : current.hint}
          </p>

          <div className="mt-8">
            {/* Screen 1 — basics */}
            {step === STEP_BASICS ? (
              <div className="flex flex-col gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Brand name</Label>
                  <Input
                    id="name"
                    name="name"
                    value={fields.name}
                    onChange={set("name")}
                    placeholder="Acme Analytics"
                    variant="secondary"
                    fullWidth
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    name="website"
                    type="url"
                    value={fields.website}
                    onChange={set("website")}
                    placeholder="https://acme.com"
                    variant="secondary"
                    fullWidth
                  />
                </div>
              </div>
            ) : null}

            {/* Screen 2 — positioning (AI-prefilled) */}
            {step === STEP_POSITIONING ? (
              <div className="relative">
                <div
                  className={`flex flex-col gap-4 transition ${
                    prefill.isPending ? "pointer-events-none select-none opacity-40 blur-sm" : ""
                  }`}
                >
                  <div className="space-y-2">
                    <Label htmlFor="productDescription">Product description</Label>
                    <TextArea
                      id="productDescription"
                      name="productDescription"
                      value={fields.productDescription}
                      onChange={set("productDescription")}
                      placeholder="What does this brand sell, and who is it for?"
                      variant="secondary"
                      rows={6}
                      className="min-h-37.5 resize-none"
                      fullWidth
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="audience">Target audience</Label>
                    <TagInput
                      id="audience"
                      ariaLabel="Target audience"
                      value={fields.audience}
                      onChange={(value) => setField("audience", value)}
                      placeholder="Founders, developers, SEO consultants…"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tone">Tone of voice</Label>
                    <Input
                      id="tone"
                      name="tone"
                      value={fields.tone}
                      onChange={set("tone")}
                      placeholder="Clear, expert, friendly…"
                      variant="secondary"
                      fullWidth
                    />
                  </div>
                </div>

                {prefill.isPending ? (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 text-center">
                    <LoadingDots />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Understanding your brand</p>
                      <p className="mt-1 text-xs text-muted">
                        {PREFILL_MESSAGES[prefillState.messageIndex]}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Screen 3 — keywords */}
            {step === STEP_KEYWORDS ? (
              <div className="space-y-2">
                <Label htmlFor="seedKeywords">Seed keywords</Label>
                <TagInput
                  id="seedKeywords"
                  ariaLabel="Seed keywords"
                  value={fields.seedKeywords}
                  onChange={(value) => setField("seedKeywords", value)}
                  placeholder="content marketing automation, seo blog agent…"
                />
                <p className="text-xs text-muted">Type a keyword and press Enter. Leave empty to skip.</p>
              </div>
            ) : null}

            {/* Screen 4 — competitors (auto-discovered) */}
            {step === STEP_COMPETITORS ? (
              <div data-no-advance className="flex flex-col gap-4">
                {competitorsPreview.isPending ? (
                  <DiscoveryLoading
                    title="Scanning the market"
                    subtitle="Finding the rivals buyers compare you against…"
                  />
                ) : (
                  <>
                    {competitorSuggestions.length > 0 ? (
                      <ul className="space-y-2">
                        {competitorSuggestions.map((suggestion) => {
                          const checked = fields.competitors.some((c) => c.url === suggestion.url);
                          return (
                            <li key={suggestion.url}>
                              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface p-3">
                                <input
                                  type="checkbox"
                                  className="mt-1 h-4 w-4 accent-accent"
                                  checked={checked}
                                  onChange={() => toggleCompetitor(suggestion.url)}
                                />
                                <span>
                                  <span className="block font-medium text-foreground">
                                    {suggestion.name}
                                  </span>
                                  <span className="block text-sm text-muted">{suggestion.url}</span>
                                  {suggestion.reason ? (
                                    <span className="block text-sm text-muted">{suggestion.reason}</span>
                                  ) : null}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="rounded-xl border border-border bg-surface-muted px-3 py-3 text-sm text-muted">
                        Claudia didn&apos;t surface clear rivals yet — add one below, or skip and she
                        keeps looking after setup.
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        isDisabled={competitorsPreview.isPending}
                        onPress={() => runCompetitorPreview(true)}
                      >
                        Search again
                      </Button>
                      <span className="text-xs text-muted">
                        {fields.competitors.length}/{MAX_COMPETITORS} selected
                      </span>
                    </div>

                    <div className="grid gap-2 border-t border-border pt-4 sm:grid-cols-[1fr_1fr_auto]">
                      <Input
                        aria-label="Competitor name"
                        value={manualCompetitor.name}
                        onChange={(event) =>
                          setManualCompetitor((prev) => ({ ...prev, name: event.target.value }))
                        }
                        placeholder="Rival Co"
                        variant="secondary"
                        fullWidth
                      />
                      <Input
                        aria-label="Competitor URL"
                        type="url"
                        value={manualCompetitor.url}
                        onChange={(event) =>
                          setManualCompetitor((prev) => ({ ...prev, url: event.target.value }))
                        }
                        placeholder="https://rival.com"
                        variant="secondary"
                        fullWidth
                      />
                      <Button type="button" variant="secondary" onPress={addManualCompetitor}>
                        Add
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {/* Screen 5 — use cases (auto-mapped) */}
            {step === STEP_USE_CASES ? (
              <div data-no-advance className="flex flex-col gap-4">
                {useCasesPreview.isPending ? (
                  <DiscoveryLoading
                    title="Mapping your buyers"
                    subtitle="Working out the jobs buyers hire you for…"
                  />
                ) : fields.useCases.length > 0 ? (
                  <>
                    <ul className="space-y-2">
                      {fields.useCases.map((useCase, index) => (
                        <li
                          key={`${useCase.job}-${index}`}
                          className={`flex items-start justify-between gap-3 rounded-xl border border-border bg-surface p-3 ${
                            useCase.enabled ? "" : "opacity-55"
                          }`}
                        >
                          <div>
                            <p className="font-medium text-foreground">{useCase.job}</p>
                            <p className="text-sm text-muted">
                              {useCase.persona}
                              {useCase.industry ? ` · ${useCase.industry}` : ""}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onPress={() => toggleUseCase(index)}
                          >
                            {useCase.enabled ? "Remove" : "Keep"}
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      isDisabled={useCasesPreview.isPending}
                      onPress={() => runUseCasePreview(true)}
                    >
                      Re-map from profile
                    </Button>
                  </>
                ) : (
                  <p className="rounded-xl border border-border bg-surface-muted px-3 py-3 text-sm text-muted">
                    Claudia needs a bit more to map your buyers — she&apos;ll do this automatically
                    once your profile is saved. You can review and edit use cases in Brand settings.
                  </p>
                )}
              </div>
            ) : null}

            {/* Screen 6 — publishing */}
            {step === STEP_PUBLISHING ? (
              <div className="flex flex-col gap-4">
                <div className="space-y-2">
                  <Label>Publishing destination</Label>
                  <Select
                    aria-label="Publishing destination"
                    name="integrationProvider"
                    variant="secondary"
                    fullWidth
                    placeholder="Skip for now"
                    value={fields.integrationProvider || null}
                    onChange={(value) =>
                      setFields((prev) => ({
                        ...prev,
                        integrationProvider:
                          value && value !== SKIP_PROVIDER_KEY
                            ? (String(value) as IntegrationProviderId)
                            : "",
                        integrationConfig: {},
                        integrationSecrets: {},
                      }))
                    }
                  >
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        <ListBox.Item id={SKIP_PROVIDER_KEY} textValue="Skip for now">
                          Skip for now
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        {providers.map((item) => (
                          <ListBox.Item key={item.id} id={item.id} textValue={item.name}>
                            <span className="flex flex-col">
                              <span>{item.name}</span>
                              {item.status !== "available" ? (
                                <span className="text-xs text-muted">Finish in Settings</span>
                              ) : null}
                            </span>
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                  {fields.integrationProvider ? (
                    <p className="text-xs text-muted">
                      {providers.find((item) => item.id === fields.integrationProvider)?.description}
                    </p>
                  ) : null}
                </div>
                <OnboardingIntegrationFields
                  provider={providers.find((item) => item.id === fields.integrationProvider) ?? null}
                  config={fields.integrationConfig}
                  secrets={fields.integrationSecrets}
                  onConfigChange={setIntegrationConfig}
                  onSecretChange={setIntegrationSecret}
                />
                <p className="text-sm text-muted">
                  Tip: after setup, connect Google Search Console in Settings → Integrations so
                  Claudia can see what Google already almost-ranks you for and prove her gains with
                  real traffic.
                </p>
              </div>
            ) : null}

            {/* Screen 7 — how Claudia works */}
            {step === STEP_AUTONOMY ? (
              <div className="flex flex-col gap-3">
                {AUTONOMY_OPTIONS.map((option) => {
                  const selected = fields.autonomyMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFields((prev) => ({ ...prev, autonomyMode: option.value }))}
                      aria-pressed={selected}
                      className={`rounded-xl border p-4 text-left transition ${
                        selected ? "border-accent bg-accent-soft" : "border-border hover:border-accent/50"
                      }`}
                    >
                      <span className="font-semibold text-foreground">
                        {option.title}
                        {option.recommended ? (
                          <span className="ml-2 text-xs font-medium text-accent">Recommended</span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-sm text-muted">{option.description}</span>
                    </button>
                  );
                })}
                <p className="text-xs text-muted">
                  The moment your plan is active, Claudia starts her Setup Run: first audit, buyer
                  questions, competitor baseline, topic research, and your first article — no steps
                  for you.
                </p>
              </div>
            ) : null}

            {/* Screen 8 — launch / paywall */}
            {step === STEP_LAUNCH ? (
              isSubscribed ? (
                <LaunchSummary fields={fields} />
              ) : (
                <PlanPaywall
                  loadingPlan={checkoutLoading}
                  onPick={startCheckout}
                />
              )
            ) : null}
          </div>

          {error ? (
            <p className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">
              {error}
            </p>
          ) : null}

          <div className="mt-8 flex items-center gap-3">
            {step === STEP_LAUNCH ? (
              isSubscribed ? (
                <LoadingButton type="submit" isPending={create.isPending} pendingLabel="Setting up…">
                  Put Claudia to work
                </LoadingButton>
              ) : null
            ) : (
              <Button type="button" onPress={advance}>
                Continue
              </Button>
            )}
            {step > 0 ? (
              <Button
                type="button"
                variant="ghost"
                isDisabled={create.isPending}
                onPress={() => {
                  setError(null);
                  setStep((value) => Math.max(0, value - 1));
                }}
              >
                Back
              </Button>
            ) : null}
            {step < lastStep ? (
              <span className="ml-auto hidden text-xs text-muted sm:block">
                press <kbd className="font-sans font-medium text-foreground">Enter ↵</kbd>
                {current.optional ? " — or leave blank to skip" : ""}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </form>
  );
}

function LoadingDots() {
  return (
    <div className="flex gap-1.5">
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent [animation-delay:-0.3s]" />
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent [animation-delay:-0.15s]" />
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
    </div>
  );
}

function DiscoveryLoading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-surface py-12 text-center">
      <LoadingDots />
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

function LaunchSummary({ fields }: { fields: Fields }) {
  const enabledUseCases = fields.useCases.filter((useCase) => useCase.enabled).length;
  const rows: { label: string; value: string }[] = [
    { label: "Brand", value: fields.name.trim() || "—" },
    { label: "Competitors tracked", value: String(fields.competitors.length) },
    { label: "Buyer use cases", value: String(enabledUseCases) },
    {
      label: "Autonomy",
      value: fields.autonomyMode === "FULL_AUTO" ? "Autopilot" : "Copilot",
    },
  ];
  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between text-sm">
          <span className="text-muted">{row.label}</span>
          <span className="font-medium text-foreground">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function PlanPaywall({
  loadingPlan,
  onPick,
}: {
  loadingPlan: PlanId | null;
  onPick: (planId: PlanId) => void;
}) {
  const busy = loadingPlan !== null;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.values(plans).map((plan) => {
          const popular = plan.id === POPULAR_PLAN;
          return (
            <div
              key={plan.id}
              className={`flex flex-col rounded-xl border p-4 ${
                popular ? "border-accent" : "border-border"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-semibold text-foreground">{plan.name}</span>
                {popular ? (
                  <span className="text-xs font-medium text-accent">Most popular</span>
                ) : null}
              </div>
              <p className="mt-1 text-2xl font-semibold text-foreground tabular-nums">
                ${plan.price}
                <span className="text-sm font-normal text-muted">/mo</span>
              </p>
              <p className="mt-1 text-xs text-muted">
                {plan.monthlyCredits.toLocaleString()} credits/mo · ≈{articlesPerMonth(plan.monthlyCredits)}{" "}
                articles · {plan.dailyArticleCap}/day
              </p>
              <div className="mt-4">
                <LoadingButton
                  fullWidth
                  variant={popular ? "primary" : "secondary"}
                  isPending={loadingPlan === plan.id}
                  pendingLabel="Redirecting…"
                  isDisabled={busy}
                  onPress={() => onPick(plan.id)}
                >
                  Start {plan.name}
                </LoadingButton>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted">
        Secure checkout via Stripe — got a coupon code? Add it there. You&apos;ll come straight back
        here and Claudia gets to work; your setup is saved.
      </p>
    </div>
  );
}

function FinalizeScreen({
  timedOut,
  creating,
  error,
  onRetry,
}: {
  timedOut: boolean;
  creating: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const heading = error
    ? "Something went wrong"
    : creating
      ? "Setting Claudia up…"
      : "Confirming your plan…";
  const subtitle = error
    ? error
    : creating
      ? "Creating your brand and starting her Setup Run."
      : "Payment received — activating your subscription. This only takes a moment.";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      {!error ? <LoadingDots /> : null}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{heading}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">{subtitle}</p>
      </div>
      {(timedOut || error) && !creating ? (
        <Button type="button" onPress={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

function OnboardingIntegrationFields({
  provider,
  config,
  secrets,
  onConfigChange,
  onSecretChange,
}: {
  provider: ProviderOption | null;
  config: Record<string, string>;
  secrets: Record<string, string>;
  onConfigChange: (key: IntegrationConfigKey) => ChangeEventHandler<HTMLInputElement>;
  onSecretChange: (key: IntegrationSecretKey) => ChangeEventHandler<HTMLInputElement>;
}): ReactNode {
  if (!provider) {
    return null;
  }

  if (provider.status !== "available") {
    return (
      <div className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
        {provider.requirements.summary} Finish setup in Settings when this connector is available.
      </div>
    );
  }

  const requiredFields = provider.fields.filter((field) => field.required);
  const requiredSecrets = provider.secrets.filter((secret) => secret.required);

  if (requiredFields.length === 0 && requiredSecrets.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
        {provider.requirements.summary}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {requiredFields.map((field) => (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={`onboarding-${field.key}`}>{field.label}</Label>
          <Input
            id={`onboarding-${field.key}`}
            name={`integrationConfig.${field.key}`}
            type={field.validation === "url" ? "url" : "text"}
            value={config[field.key] ?? ""}
            onChange={onConfigChange(field.key)}
            placeholder={field.placeholder}
            variant="secondary"
            fullWidth
          />
        </div>
      ))}
      {requiredSecrets.map((secret) => (
        <div key={secret.key} className="space-y-2">
          <Label htmlFor={`onboarding-${secret.key}`}>{secret.label}</Label>
          <Input
            id={`onboarding-${secret.key}`}
            name={`integrationSecrets.${secret.key}`}
            type="password"
            value={secrets[secret.key] ?? ""}
            onChange={onSecretChange(secret.key)}
            placeholder={secret.placeholder ?? "Required"}
            autoComplete="new-password"
            variant="secondary"
            fullWidth
          />
        </div>
      ))}
    </div>
  );
}
