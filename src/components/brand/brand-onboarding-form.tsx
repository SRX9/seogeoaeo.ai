"use client";

import { Button } from "@heroui/react/button";
import { Input } from "@heroui/react/input";
import { Label } from "@heroui/react/label";
import { TextArea } from "@heroui/react/textarea";
import { Select } from "@heroui/react/select";
import { ListBox } from "@heroui/react/list-box";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LoadingButton } from "@/components/ui/loading-button";
import { apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys } from "@/lib/api/queries";

type ProviderOption = { id: string; name: string; description: string };

const STEPS = [
  { title: "Brand basics", hint: "Name and website" },
  { title: "Positioning", hint: "Product, audience, and tone" },
  { title: "Keywords", hint: "Seed topics to research" },
  { title: "Competitor", hint: "Optional — track a rival" },
  { title: "Publishing", hint: "Optional — connect a destination" },
] as const;

const INITIAL_FIELDS = {
  name: "",
  website: "",
  productDescription: "",
  audience: "",
  tone: "",
  seedKeywords: "",
  competitorName: "",
  competitorUrl: "",
  integrationProvider: "",
  integrationApiKey: "",
};

type Fields = typeof INITIAL_FIELDS;

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

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function BrandOnboardingForm({ providers }: { providers: ProviderOption[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  // Controlled fields — HeroUI/react-aria inputs do not reliably surface their
  // value through native FormData when used bare, so we own the state here.
  const [fields, setFields] = useState<Fields>(INITIAL_FIELDS);
  const [error, setError] = useState<string | null>(null);
  const [prefillState, setPrefillState] = useState({ prefilled: false, messageIndex: 0 });
  // The name+website we last sent to prefill, so re-entering step 1 only re-runs
  // it when the inputs actually changed.
  const lastPrefillKey = useRef("");
  const lastStep = STEPS.length - 1;
  const canAdvance = step !== 0 || fields.name.trim().length > 0;

  const set =
    (key: keyof Fields) =>
    (event: { target: { value: string } }) =>
      setFields((prev) => ({ ...prev, [key]: event.target.value }));

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

  // Final step: create the brand, its profile, an optional first competitor, and
  // an optional publishing integration in one request, then go to the dashboard.
  const create = useMutation({
    mutationFn: (data: Fields) =>
      apiPost<{ brand: { id: string; name: string } }>("/api/brands", data),
    onSuccess: async () => {
      // Await the `me` refetch: the app layout decides "needs onboarding" from its
      // brand count, so we must not navigate to /dashboard until `me` reflects the
      // new brand - otherwise the layout bounces us straight back to /onboarding.
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      queryClient.invalidateQueries({ queryKey: queryKeys.brands });
      queryClient.invalidateQueries({ queryKey: queryKeys.onboarding });
      queryClient.invalidateQueries({ queryKey: queryKeys.brandProfile });
      queryClient.invalidateQueries({ queryKey: queryKeys.competitors });
      queryClient.invalidateQueries({ queryKey: queryKeys.integrations });
      router.push("/dashboard");
    },
    onError: (err) => {
      setError(getErrorMessage(err, "Could not create brand. Please try again."));
    },
  });

  function handleContinueFromBasics() {
    setError(null);
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

    // Kick off prefill in the background (only when the inputs changed) and move
    // on — the overlay on the positioning step shows it working.
    const key = `${name}|${website}`;
    if (key !== lastPrefillKey.current) {
      lastPrefillKey.current = key;
      setPrefillState((state) => ({ ...state, prefilled: false }));
      prefill.mutate({ name, website });
    }
    setStep(1);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmed = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, value.trim()]),
    ) as Fields;

    if (!trimmed.name) {
      setError("Brand name is required.");
      setStep(0);
      return;
    }
    if (trimmed.website && !isValidUrl(trimmed.website)) {
      setError("Enter a valid website URL, including https://");
      setStep(0);
      return;
    }
    if (trimmed.competitorUrl && !isValidUrl(trimmed.competitorUrl)) {
      setError("Enter a valid competitor URL, including https://");
      setStep(3);
      return;
    }

    create.mutate(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((item, index) => (
          <li
            key={item.title}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
              index === step
                ? "border-accent bg-accent-soft text-accent-soft-foreground"
                : index < step
                  ? "border-success/40 bg-success-soft text-success-soft-foreground"
                  : "border-border text-muted"
            }`}
          >
            <span className="font-semibold">{index + 1}</span>
            <span>{item.title}</span>
          </li>
        ))}
      </ol>

      <div>
        <h2 className="text-lg font-semibold text-foreground">{STEPS[step].title}</h2>
        <p className="text-sm text-muted">{STEPS[step].hint}</p>
      </div>

      {/* Step 1 — basics */}
      <div hidden={step !== 0} className="flex flex-col gap-4">
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
        <p className="text-xs text-muted">
          We&apos;ll use AI to prefill the next steps from your brand name and website.
        </p>
      </div>

      {/* Step 2 — positioning */}
      <div hidden={step !== 1} className="relative">
        {!prefill.isPending && prefillState.prefilled ? (
          <p className="mb-4 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-accent-soft-foreground">
            AI prefilled these from the web — review and edit before continuing.
          </p>
        ) : null}

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
              fullWidth
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="audience">Target audience</Label>
              <Input
                id="audience"
                name="audience"
                value={fields.audience}
                onChange={set("audience")}
                placeholder="Founders, developers..."
                variant="secondary"
                fullWidth
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tone">Tone of voice</Label>
              <Input
                id="tone"
                name="tone"
                value={fields.tone}
                onChange={set("tone")}
                placeholder="Clear, expert, friendly..."
                variant="secondary"
                fullWidth
              />
            </div>
          </div>
        </div>

        {prefill.isPending ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-xl bg-surface/60 text-center backdrop-blur-sm">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent [animation-delay:-0.3s]" />
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent [animation-delay:-0.15s]" />
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Understanding your brand</p>
              <p className="mt-1 text-xs text-muted">
                {PREFILL_MESSAGES[prefillState.messageIndex]}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Step 3 — keywords */}
      <div hidden={step !== 2} className="flex flex-col gap-4">
        <div className="space-y-2">
          <Label htmlFor="seedKeywords">Seed keywords</Label>
          <TextArea
            id="seedKeywords"
            name="seedKeywords"
            value={fields.seedKeywords}
            onChange={set("seedKeywords")}
            placeholder="content marketing automation, seo blog agent"
            variant="secondary"
            fullWidth
          />
        </div>
      </div>

      {/* Step 4 — competitor */}
      <div hidden={step !== 3} className="flex flex-col gap-4">
        <div className="space-y-2">
          <Label htmlFor="competitorName">Competitor name</Label>
          <Input
            id="competitorName"
            name="competitorName"
            value={fields.competitorName}
            onChange={set("competitorName")}
            placeholder="Rival Co"
            variant="secondary"
            fullWidth
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="competitorUrl">Competitor URL</Label>
          <Input
            id="competitorUrl"
            name="competitorUrl"
            type="url"
            value={fields.competitorUrl}
            onChange={set("competitorUrl")}
            placeholder="https://rival.com"
            variant="secondary"
            fullWidth
          />
        </div>
        <p className="text-xs text-muted">
          On a paid plan you can auto-discover competitors with AI from Brand settings once this
          brand is created.
        </p>
      </div>

      {/* Step 5 — publishing */}
      <div hidden={step !== lastStep} className="flex flex-col gap-4">
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
                integrationProvider: value && value !== SKIP_PROVIDER_KEY ? String(value) : "",
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
                    {item.name}
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
        {fields.integrationProvider ? (
          <div className="space-y-2">
            <Label htmlFor="integrationApiKey">API key (optional)</Label>
            <Input
              id="integrationApiKey"
              name="integrationApiKey"
              type="password"
              value={fields.integrationApiKey}
              onChange={set("integrationApiKey")}
              placeholder="Paste an API key — you can finish setup in Settings"
              variant="secondary"
              fullWidth
            />
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <Button
          type="button"
          variant="ghost"
          isDisabled={step === 0 || create.isPending}
          onPress={() => setStep((value) => Math.max(0, value - 1))}
        >
          Back
        </Button>
        {step === 0 ? (
          <Button type="button" isDisabled={!canAdvance} onPress={handleContinueFromBasics}>
            Continue
          </Button>
        ) : step < lastStep ? (
          <Button type="button" onPress={() => setStep((value) => Math.min(lastStep, value + 1))}>
            Continue
          </Button>
        ) : (
          <LoadingButton type="submit" isPending={create.isPending} pendingLabel="Creating…">
            Create brand
          </LoadingButton>
        )}
      </div>
    </form>
  );
}
