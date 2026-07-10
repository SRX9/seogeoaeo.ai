import {
  CheckIcon,
  GlobeIcon,
  PenIcon,
  SearchIcon,
  SparklesIcon,
  UsersIcon,
} from "@/components/icons";

export type DiscoveryStage = "site" | "market";

type TaskState = "done" | "active" | "queued";

const SITE_TASKS: Array<{ label: string; state: TaskState }> = [
  { label: "Website received", state: "done" },
  { label: "Learning your offer, audience, and voice", state: "active" },
  { label: "Mapping competitors and buyer questions", state: "queued" },
];

const MARKET_TASKS: Array<{ label: string; state: TaskState }> = [
  { label: "Website and brand signals understood", state: "done" },
  { label: "Comparing the competitive landscape", state: "active" },
  { label: "Drafting buyer profiles and the first-week plan", state: "active" },
];

function displayHost(website: string) {
  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return website;
  }
}

function TaskMark({ state }: { state: TaskState }) {
  if (state === "done") {
    return (
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
        <CheckIcon className="size-3.5" />
      </span>
    );
  }

  return (
    <span
      className={`grid size-6 shrink-0 place-items-center rounded-full border ${
        state === "active" ? "border-accent/45 bg-accent-soft/70" : "border-border/60 bg-surface/70"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          state === "active" ? "onboarding-discovery__task-pulse bg-accent" : "bg-muted/45"
        }`}
      />
    </span>
  );
}

export function OnboardingDiscovery({
  brandName,
  website,
  stage,
}: {
  brandName: string;
  website: string;
  stage: DiscoveryStage;
}) {
  const isMappingMarket = stage === "market";
  const tasks = isMappingMarket ? MARKET_TASKS : SITE_TASKS;
  const host = displayHost(website);

  return (
    <section
      className="onboarding-discovery material-panel relative overflow-hidden rounded-[1.75rem]"
      aria-labelledby="discovery-title"
    >
      <div className="onboarding-discovery__ambient onboarding-discovery__ambient--one" aria-hidden />
      <div className="onboarding-discovery__ambient onboarding-discovery__ambient--two" aria-hidden />

      <div className="relative grid gap-8 p-5 sm:p-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-surface/70 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur-sm">
            <span className="onboarding-discovery__live-dot size-2 rounded-full bg-accent" aria-hidden />
            Claudia is working live
          </div>
          <h2 id="discovery-title" className="mt-5 text-2xl text-foreground sm:text-3xl">
            {isMappingMarket ? "Now mapping your market" : `Learning ${brandName || host}`}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            {isMappingMarket
              ? "The brand signals are clear. Claudia is now comparing alternatives and shaping the jobs buyers will hire you for."
              : `Claudia is reading ${host} for the offer, audience, language, and proof that make the brand distinct.`}
          </p>

          <div className="onboarding-discovery__map relative mt-6 min-h-64 overflow-hidden rounded-2xl border border-border/50 bg-surface/55" aria-hidden>
            <span className="onboarding-discovery__grid absolute inset-0" />
            <span className="onboarding-discovery__connector onboarding-discovery__connector--offer" />
            <span className="onboarding-discovery__connector onboarding-discovery__connector--market" />
            <span className="onboarding-discovery__connector onboarding-discovery__connector--buyers" />

            <span className="onboarding-discovery__ring onboarding-discovery__ring--one absolute left-1/2 top-1/2 rounded-full border border-accent/25" />
            <span className="onboarding-discovery__ring onboarding-discovery__ring--two absolute left-1/2 top-1/2 rounded-full border border-accent/15" />

            <span className="onboarding-discovery__core absolute left-1/2 top-1/2 z-10 flex max-w-[11rem] items-center gap-2.5 rounded-2xl border border-accent/25 bg-surface px-3.5 py-3 shadow-surface">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                <GlobeIcon className="size-4.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-medium text-muted">Source</span>
                <span className="block truncate text-sm font-semibold text-foreground">{host}</span>
              </span>
            </span>

            <span className="onboarding-discovery__signal onboarding-discovery__signal--offer absolute z-20 flex items-center gap-2 rounded-xl border border-border/50 bg-surface/90 px-3 py-2 shadow-sm backdrop-blur-sm">
              <SparklesIcon className="size-4 text-accent" />
              <span className="text-xs font-medium text-foreground">Offer &amp; voice</span>
            </span>
            <span className="onboarding-discovery__signal onboarding-discovery__signal--market absolute z-20 flex items-center gap-2 rounded-xl border border-border/50 bg-surface/90 px-3 py-2 shadow-sm backdrop-blur-sm">
              <SearchIcon className="size-4 text-accent" />
              <span className="text-xs font-medium text-foreground">Market rivals</span>
            </span>
            <span className="onboarding-discovery__signal onboarding-discovery__signal--buyers absolute z-20 flex items-center gap-2 rounded-xl border border-border/50 bg-surface/90 px-3 py-2 shadow-sm backdrop-blur-sm">
              <UsersIcon className="size-4 text-accent" />
              <span className="text-xs font-medium text-foreground">Buyer questions</span>
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-surface/75 p-5 shadow-sm backdrop-blur-sm sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-soft-foreground">
              <PenIcon className="size-5" />
            </span>
            <div>
              <p className="font-semibold text-foreground">Building your operating brief</p>
              <p className="mt-0.5 text-xs text-muted">Useful context, not another questionnaire</p>
            </div>
          </div>

          <div className="mt-6 space-y-4" role="status" aria-live="polite">
            {tasks.map((task) => (
              <div key={task.label} className="flex items-center gap-3">
                <TaskMark state={task.state} />
                <p className={`text-sm leading-5 ${task.state === "queued" ? "text-muted" : "font-medium text-foreground"}`}>
                  {task.label}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-xl bg-surface-secondary/80 px-3.5 py-3">
            <p className="text-xs leading-5 text-muted">
              Your editable brief opens automatically when the research is ready.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
