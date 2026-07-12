import { CheckIcon, GlobeIcon } from "@/components/icons";

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
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-success-soft text-success-soft-foreground">
        <CheckIcon className="size-3.5" />
      </span>
    );
  }

  return (
    <span
      className={`grid size-6 shrink-0 place-items-center rounded-full border ${
        state === "active" ? "border-accent/40 bg-accent-soft" : "border-border bg-background"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          state === "active" ? "animate-pulse bg-accent" : "bg-muted/40"
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
      className="max-w-4xl border-y border-separator/70 py-8 sm:py-10"
      aria-labelledby="discovery-title"
    >
      <div className="inline-flex items-center gap-2 text-xs font-medium text-muted">
        <span className="size-2 animate-pulse rounded-full bg-success" aria-hidden />
        Claudia is reading the source material
      </div>

      <h2
        id="discovery-title"
        className="mt-4 max-w-2xl text-2xl font-semibold tracking-[-0.025em] text-foreground sm:text-3xl"
      >
        {isMappingMarket ? "Now mapping your market" : `Learning ${brandName || host}`}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
        {isMappingMarket
          ? "The brand signals are clear. Claudia is comparing alternatives and shaping the first useful jobs to take on."
          : `Claudia is reading ${host} for the offer, audience, language, and proof that make the brand distinct.`}
      </p>

      <div className="mt-8 grid gap-8 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:gap-12">
        <div>
          <p className="text-xs font-medium text-muted">Primary source</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-secondary text-muted">
              <GlobeIcon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{host}</p>
              <p className="mt-0.5 text-xs text-muted">Public website</p>
            </div>
          </div>
        </div>

        <div className="space-y-4" role="status" aria-live="polite">
          {tasks.map((task) => (
            <div key={task.label} className="flex items-center gap-3">
              <TaskMark state={task.state} />
              <p
                className={`text-sm leading-5 ${
                  task.state === "queued" ? "text-muted" : "font-medium text-foreground"
                }`}
              >
                {task.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-8 text-xs leading-5 text-muted">
        The editable operating brief opens automatically when this pass is ready.
      </p>
    </section>
  );
}
