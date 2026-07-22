"use client";

import { Alert, Button, Card, Input, Label, TextArea } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import posthog from "posthog-js";
import { OnboardingDiscovery, type DiscoveryStage } from "@/components/brand/onboarding-discovery";
import { OnboardingExitDialog, useOnboardingExitGuard } from "@/components/brand/onboarding-exit-guard";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ClaudiaIcon,
  GlobeIcon,
  LayersIcon,
  SearchIcon,
  UsersIcon,
} from "@/components/icons";
import { LoadingButton } from "@/components/ui/loading-button";
import { apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys, useMe, type MeResponse } from "@/lib/api/queries";
import { cn } from "@/lib/cn";
import { DEFAULT_FIRST_OUTCOME } from "@/lib/onboarding/first-outcome";
import type { AutonomyMode } from "@/lib/workspace/settings";
import styles from "./brand-onboarding-form.module.css";

type Competitor = { name: string; url: string };
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
};

const MOMENTS = [
  {
    title: "Give Claudia your website",
    description: "She will learn what you sell, who it helps, and where to start.",
  },
  {
    title: "Confirm the short version",
    description: "Correct only what matters. Everything else can be refined later.",
  },
  {
    title: "Your first opportunity is ready",
    description: "Review Claudia's starting recommendation and first fixes before entering the product.",
  },
] as const;

function isValidUrl(value: string) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
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

async function discoverBrand(
  name: string,
  website: string,
  onStageChange: (stage: DiscoveryStage) => void,
) {
  let profile = { productDescription: "", audience: "", tone: "", seedKeywords: "" };
  try {
    const result = await apiPost<{ profile: typeof profile }>("/api/brand/prefill", { name, website });
    profile = result.profile;
  } catch {
    // The next screen stays editable if enrichment is unavailable.
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
    competitors: competitors.suggestions.slice(0, 5),
    customerOutcomes: useCases.useCases
      .flatMap((item) => (item.job ? [item.job] : []))
      .slice(0, 5)
      .join("\n"),
  };
}

function buildPayload(fields: Fields) {
  const persona = fields.audience.trim() || "Customer";
  return {
    name: fields.name.trim(),
    website: fields.website.trim(),
    productDescription: fields.productDescription.trim(),
    audience: fields.audience.trim(),
    tone: fields.tone.trim(),
    seedKeywords: fields.seedKeywords.trim(),
    competitors: fields.competitors,
    useCases: fields.customerOutcomes
      .split("\n")
      .map((job) => job.trim())
      .filter(Boolean)
      .slice(0, 10)
      .map((job) => ({ job, persona, industry: "" })),
    autonomyMode: "REVIEW" as AutonomyMode,
    fastAutoPublishAcknowledged: false,
    firstOutcome: DEFAULT_FIRST_OUTCOME,
  };
}

export function BrandOnboardingSimple({ showDashboardEscape = false }: { showDashboardEscape?: boolean }) {
  const router = useProgressRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const [moment, setMoment] = useState(0);
  const [fields, setFields] = useState<Fields>(INITIAL_FIELDS);
  const [discoveryStage, setDiscoveryStage] = useState<DiscoveryStage>("brand");
  const [error, setError] = useState<string | null>(null);
  const isFirstBrand = (me.data?.brands.length ?? 0) === 0;
  const {
    isOpen: isExitDialogOpen,
    open: openExitDialog,
    stay: stayInOnboarding,
    release: releaseExitGuard,
    leave: leaveOnboarding,
  } = useOnboardingExitGuard({
    active: true,
    fallbackHref: showDashboardEscape ? "/dashboard" : "/",
  });

  const discovery = useMutation({
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
    mutationFn: () =>
      apiPost<{ brand: { id: string; name: string; autonomyMode: AutonomyMode } }>(
        "/api/brands",
        buildPayload(fields),
        { signal: AbortSignal.timeout(30_000) },
      ),
    onSuccess: async ({ brand }) => {
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
                      autonomyMode: brand.autonomyMode,
                      badgePublic: false,
                      identity: null,
                    },
                  ],
              activeBrandId: brand.id,
            }
          : current,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.agentState }),
        queryClient.invalidateQueries({ queryKey: queryKeys.brandProfile }),
        releaseExitGuard(),
      ]);
      router.replace("/dashboard");
    },
    onError: (failure) => {
      setError(getErrorMessage(failure, "Claudia could not finish setup. Please try again."));
    },
  });

  const opportunity = useMemo(() => {
    const outcome = fields.customerOutcomes.split("\n").map((item) => item.trim()).find(Boolean);
    const theme = fields.seedKeywords.split(",").map((item) => item.trim()).find(Boolean);
    return {
      title: outcome
        ? `Create the clearest answer for “${outcome}”`
        : `Build a decision guide for ${theme || fields.name || "your category"}`,
      rationale: fields.audience
        ? `${fields.audience} need a useful answer before they can confidently choose a solution.`
        : "This gives buyers a useful answer while creating a strong search and AI-citation surface.",
    };
  }, [fields.audience, fields.customerOutcomes, fields.name, fields.seedKeywords]);

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
    setFields((current) => ({ ...current, name, website }));
    setDiscoveryStage("brand");
    posthog.capture("onboarding_discovery_started");
    discovery.mutate({ name, website });
  }

  function showPreview() {
    if (!fields.name.trim()) {
      setError("Add the brand name Claudia should use.");
      return;
    }
    setError(null);
    setMoment(2);
    posthog.capture("brand_summary_confirmed");
    posthog.capture("onboarding_free_preview_viewed");
    posthog.capture("initial_checklist_viewed", { source: "onboarding" });
  }

  if (discovery.isPending) {
    return (
      <div className="min-h-dvh bg-background px-5 sm:px-8">
        <OnboardingDiscovery brandName={fields.name} website={fields.website} stage={discoveryStage} />
      </div>
    );
  }

  const current = MOMENTS[moment];
  return (
    <div className={cn("min-h-dvh bg-background", styles.shell)}>
      <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 py-7 sm:px-8 sm:py-10">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-muted tabular-nums">Step {moment + 1} of {MOMENTS.length}</span>
            <span className="hidden items-center gap-1.5 sm:flex" aria-hidden>
              {MOMENTS.map((item, index) => (
                <span
                  key={item.title}
                  className={cn("h-0.5 w-10 bg-border transition-colors", index <= moment && "bg-accent")}
                />
              ))}
            </span>
          </div>
          <Button variant="ghost" isDisabled={create.isPending} onPress={openExitDialog}>Save and exit</Button>
        </header>

        <div
          key={moment}
          className={cn(
            "mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center py-10 sm:py-14",
            styles.stageEnter,
          )}
        >
          <div className="max-w-2xl">
            <h1 className="type-display text-pretty text-3xl text-foreground sm:text-5xl">{current.title}</h1>
            <p className="mt-4 max-w-xl text-pretty text-base leading-7 text-muted">{current.description}</p>
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

          {moment === 0 ? <WebsiteStep fields={fields} setFields={setFields} onContinue={beginDiscovery} /> : null}
          {moment === 1 ? <SummaryStep fields={fields} setFields={setFields} /> : null}
          {moment === 2 ? (
            <PreviewStep
              fields={fields}
              opportunity={opportunity}
              isPending={create.isPending}
              onEnter={() => {
                setError(null);
                posthog.capture("brand_activation_started", {
                  first_outcome: DEFAULT_FIRST_OUTCOME,
                  autonomy_mode: "REVIEW",
                  preview_seen: true,
                });
                create.mutate();
              }}
            />
          ) : null}

          {moment > 0 ? (
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="ghost"
                isDisabled={create.isPending}
                onPress={() => {
                  setError(null);
                  setMoment((value) => Math.max(0, value - 1));
                }}
              >
                <ArrowLeftIcon className="size-4" />Back
              </Button>
              {moment === 1 ? (
                <Button className="min-h-11" onPress={showPreview}>
                  Show my starting point<ArrowRightIcon className="size-4" />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
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

function WebsiteStep({ fields, setFields, onContinue }: {
  fields: Fields;
  setFields: React.Dispatch<React.SetStateAction<Fields>>;
  onContinue: () => void;
}) {
  return (
    <Card className="mt-8 overflow-hidden p-0 sm:mt-10">
      <Card.Content className="p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-surface-secondary text-muted" aria-hidden>
            <GlobeIcon className="size-5" />
          </span>
          <div><Card.Title>Website</Card.Title><Card.Description>Public pages only. No connection is needed.</Card.Description></div>
        </div>
        <div className="mt-6 space-y-2">
          <Label htmlFor="onboarding-website">Website address</Label>
          <Input
            id="onboarding-website"
            fullWidth
            type="url"
            variant="secondary"
            placeholder="https://your-site.com"
            value={fields.website}
            onChange={(event) => setFields((value) => ({ ...value, website: event.target.value }))}
            onKeyDown={(event) => { if (event.key === "Enter") onContinue(); }}
          />
        </div>
      </Card.Content>
      <Card.Footer className="justify-end border-t border-separator px-6 py-5 sm:px-8">
        <Button className="min-h-11" onPress={onContinue}>Learn about my brand<ArrowRightIcon className="size-4" /></Button>
      </Card.Footer>
    </Card>
  );
}

function SummaryStep({ fields, setFields }: {
  fields: Fields;
  setFields: React.Dispatch<React.SetStateAction<Fields>>;
}) {
  return (
    <div className="mt-8 grid gap-4 md:grid-cols-2">
      <SummaryField label="Brand" Icon={ClaudiaIcon}>
        <Input aria-label="Brand name" fullWidth variant="secondary" value={fields.name} onChange={(event) => setFields((value) => ({ ...value, name: event.target.value }))} />
      </SummaryField>
      <SummaryField label="Who it helps" Icon={UsersIcon}>
        <TextArea aria-label="Who it helps" fullWidth rows={3} variant="secondary" placeholder="The customers Claudia should focus on" value={fields.audience} onChange={(event) => setFields((value) => ({ ...value, audience: event.target.value }))} />
      </SummaryField>
      <SummaryField className="md:col-span-2" label="What you sell" Icon={LayersIcon}>
        <TextArea aria-label="What you sell" fullWidth rows={4} variant="secondary" placeholder="Describe the product or service" value={fields.productDescription} onChange={(event) => setFields((value) => ({ ...value, productDescription: event.target.value }))} />
      </SummaryField>
      <SummaryField className="md:col-span-2" label="What customers want to achieve" Icon={CheckIcon}>
        <TextArea aria-label="What customers want to achieve" fullWidth rows={3} variant="secondary" placeholder="One outcome per line" value={fields.customerOutcomes} onChange={(event) => setFields((value) => ({ ...value, customerOutcomes: event.target.value }))} />
      </SummaryField>
      {fields.competitors.length ? (
        <p className="md:col-span-2 text-sm leading-6 text-muted">Claudia also found {fields.competitors.map((item) => item.name).join(", ")} as useful comparison points.</p>
      ) : null}
    </div>
  );
}

function SummaryField({ className, label, Icon, children }: {
  className?: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("p-0", className)}>
      <Card.Content className="p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-surface-secondary text-muted" aria-hidden><Icon className="size-5" /></span>
          <h2 className="text-sm font-semibold text-foreground">{label}</h2>
        </div>
        {children}
      </Card.Content>
    </Card>
  );
}

function PreviewStep({ fields, opportunity, isPending, onEnter }: {
  fields: Fields;
  opportunity: { title: string; rationale: string };
  isPending: boolean;
  onEnter: () => void;
}) {
  const checklist = [
    {
      pillar: "SEO",
      title: "Make the homepage answer who this is for",
      fix: fields.audience
        ? `Name “${fields.audience}” in the main value proposition and connect it to the primary outcome.`
        : "Name the primary customer in the main value proposition and connect it to a specific outcome.",
    },
    {
      pillar: "AEO",
      title: "Publish one complete buyer answer",
      fix: `Turn the opportunity above into a focused page with evidence, examples, and a clear next step.`,
    },
    {
      pillar: "GEO",
      title: "Make the product understandable to crawlers",
      fix: "Confirm that the homepage has one descriptive title, one clear H1, indexable copy, and organization or product structured data.",
    },
  ];

  return (
    <div className="mt-8 space-y-5">
      <Card className="border-accent/50 p-0">
        <Card.Content className="p-6 sm:p-8">
          <div className="flex items-center gap-2 text-sm font-medium text-accent"><SearchIcon className="size-4" />First content opportunity</div>
          <h2 className="type-title mt-4 text-pretty text-2xl text-foreground">{opportunity.title}</h2>
          <p className="mt-3 max-w-2xl text-pretty leading-7 text-muted">{opportunity.rationale}</p>
        </Card.Content>
      </Card>
      <Card className="p-0">
        <Card.Header className="px-6 pt-6 sm:px-8 sm:pt-8">
          <Card.Title>Initial checklist</Card.Title>
          <Card.Description>Three concrete improvements Claudia would start with.</Card.Description>
        </Card.Header>
        <Card.Content className="px-6 pb-6 sm:px-8 sm:pb-8">
          <ol className="divide-y divide-separator">
            {checklist.map((item, index) => (
              <li key={item.title} className="grid gap-2 py-5 first:pt-2 sm:grid-cols-[2rem_1fr]">
                <span className="text-sm font-semibold text-accent tabular-nums">0{index + 1}</span>
                <div>
                  <p className="text-xs font-medium text-muted">{item.pillar}</p>
                  <h3 className="mt-1 font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">{item.fix}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card.Content>
        <Card.Footer className="flex-col items-stretch gap-3 border-t border-separator px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="text-sm leading-6 text-muted">No card required. Claudia starts in review-first mode.</p>
          <LoadingButton className="min-h-11" isPending={isPending} pendingLabel="Preparing workspace…" onPress={onEnter}>
            Enter Claudia<ArrowRightIcon className="size-4" />
          </LoadingButton>
        </Card.Footer>
      </Card>
    </div>
  );
}
