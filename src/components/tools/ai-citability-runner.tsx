"use client";

import { buttonVariants } from "@heroui/react/button";
import {
  Accordion,
  Button,
  Card,
  Link as HeroLink,
  ProgressCircle,
  Skeleton,
  TextArea,
} from "@heroui/react";
import { EmptyState } from "@heroui-pro/react";
import {
  ArrowRightIcon,
  CalendarIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CreditCardIcon,
  GaugeIcon,
  InsightIcon,
} from "@/components/icons";
import { ToneText } from "@/components/ui/status-text";
import { PageHeader } from "@/components/layout/page-header";
import { CREDIT_COSTS } from "@/lib/billing/credits";

type BreakdownKey =
  | "answer_block_quality"
  | "self_containment"
  | "structural_readability"
  | "statistical_density"
  | "uniqueness_signals";

type Passage = {
  heading: string | null;
  word_count: number;
  total_score: number;
  grade: string;
  label: string;
  preview: string;
  breakdown: Record<BreakdownKey, number>;
};

type CitabilityData = {
  total_blocks_analyzed: number;
  page_score: number;
  bottom_5: Passage[];
};

type RunnerResult = {
  score: number | null;
  data: unknown;
  ranAt: string | null;
  freshRun: boolean;
};

type Issue = {
  id: string;
  severity: "High" | "Medium" | "Low";
  title: string;
  description: string;
  why: string;
  recommendation: string;
  before: string;
  after: string;
};

const ISSUE_COPY: Record<
  BreakdownKey,
  { title: string; why: string; recommendation: string; after: string }
> = {
  answer_block_quality: {
    title: "Answer is not direct enough",
    why: "AI systems favor passages that answer a clear question in the opening sentence.",
    recommendation: "Lead with a concise answer before adding context or supporting detail.",
    after: "[Direct answer in one sentence.] [Supporting context and evidence.]",
  },
  self_containment: {
    title: "Passage depends on surrounding context",
    why: "Self-contained passages are easier for AI systems to quote accurately and verify.",
    recommendation: "Name the subject directly and make the passage understandable on its own.",
    after: "[Named subject] is [clear answer], with enough context to stand alone.",
  },
  structural_readability: {
    title: "Passage structure is hard to scan",
    why: "Clear sentence structure helps models isolate the answer from the rest of the page.",
    recommendation: "Use shorter sentences, descriptive headings, and an answer-first structure.",
    after: "[Descriptive heading]\n[Short answer.]\n[One supporting point per sentence.]",
  },
  statistical_density: {
    title: "Low evidence and citation density",
    why: "Specific facts and attributable evidence give AI systems stronger verification signals.",
    recommendation: "Add a named source, date, or concrete statistic where it supports the claim.",
    after: "According to [named source, year], [specific fact or statistic].",
  },
  uniqueness_signals: {
    title: "Missing original or attributable signals",
    why: "Original research and named examples make a passage more distinctive and citable.",
    recommendation: "Add a first-party finding, case study, or clearly attributed expert insight.",
    after: "Our [study or analysis] found [specific result], based on [clear methodology].",
  },
};

function isPassage(value: unknown): value is Passage {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Passage>;
  return (
    typeof item.total_score === "number" &&
    typeof item.preview === "string" &&
    typeof item.breakdown === "object" &&
    item.breakdown !== null
  );
}

function parseCitabilityData(value: unknown): CitabilityData | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<CitabilityData>;
  if (
    typeof data.page_score !== "number" ||
    typeof data.total_blocks_analyzed !== "number" ||
    !Array.isArray(data.bottom_5)
  ) {
    return null;
  }
  return {
    page_score: data.page_score,
    total_blocks_analyzed: data.total_blocks_analyzed,
    bottom_5: data.bottom_5.filter(isPassage),
  };
}

function weakestSignal(breakdown: Passage["breakdown"]): BreakdownKey {
  const maximums: Record<BreakdownKey, number> = {
    answer_block_quality: 30,
    self_containment: 25,
    structural_readability: 20,
    statistical_density: 15,
    uniqueness_signals: 10,
  };
  const keys = Object.keys(maximums) as BreakdownKey[];
  return keys.reduce((weakest, key) =>
    (breakdown[key] ?? 0) / maximums[key] < (breakdown[weakest] ?? 0) / maximums[weakest]
      ? key
      : weakest,
  );
}

function issueFromPassage(passage: Passage, index: number): Issue {
  const signal = weakestSignal(passage.breakdown);
  const copy = ISSUE_COPY[signal];
  const severity = passage.total_score < 35 ? "High" : passage.total_score < 50 ? "Medium" : "Low";
  const context = passage.heading ? `“${passage.heading}”` : `Passage ${index + 1}`;
  return {
    id: `${passage.heading ?? "passage"}-${index}-${passage.total_score}`,
    severity,
    title: copy.title,
    description: `${context} scored ${Math.round(passage.total_score)}/100 and needs a stronger citation signal.`,
    why: copy.why,
    recommendation: copy.recommendation,
    before: passage.preview || "No passage preview was stored for this result.",
    after: copy.after,
  };
}

function scoreLabel(score: number) {
  if (score >= 80) return "Excellent citability";
  if (score >= 65) return "Good citability";
  if (score >= 50) return "Moderate citability";
  if (score >= 35) return "Low citability";
  return "Poor citability";
}

function formatDate(value: string | null, freshRun: boolean) {
  if (freshRun) return "Just now";
  if (!value) return "Latest scan";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Latest scan";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function severityColor(severity: Issue["severity"]) {
  if (severity === "High") return "danger" as const;
  if (severity === "Medium") return "warning" as const;
  return "default" as const;
}

function scoreColor(score: number) {
  if (score >= 70) return "success" as const;
  if (score >= 40) return "warning" as const;
  return "danger" as const;
}

function RunnerSkeleton() {
  return (
    <Card className="p-6" aria-label="Loading citability result">
      <div className="grid gap-6 md:grid-cols-[9rem_minmax(0,1fr)]">
        <Skeleton className="size-28 rounded-full" />
        <div className="space-y-3">
          <Skeleton className="h-7 w-52 rounded-lg" />
          <Skeleton className="h-4 w-full rounded-lg" />
          <Skeleton className="h-4 w-4/5 rounded-lg" />
          <Skeleton className="h-6 w-40 rounded-lg" />
        </div>
      </div>
    </Card>
  );
}

export function AiCitabilityRunner({
  input,
  onInputChange,
  onRun,
  busy,
  error,
  isLoading,
  result,
}: {
  input: string;
  onInputChange: (value: string) => void;
  onRun: () => void;
  busy: boolean;
  error: string | null;
  isLoading: boolean;
  result: RunnerResult | null;
}) {
  const data = parseCitabilityData(result?.data);
  const score = Math.round(result?.score ?? data?.page_score ?? 0);
  const issues = (data?.bottom_5 ?? []).slice(0, 5).map(issueFromPassage);
  const completedLabel = result ? formatDate(result.ranAt, result.freshRun) : "Not run yet";

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <PageHeader
        title="AI Citability Score"
        description="Measure how easily AI systems can quote, understand, and verify your content."
        meta={
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted">
            <InsightIcon className="size-3.5" aria-hidden />
            AEO analyzer
          </span>
        }
      />

      <Card>
        <Card.Header className="p-5 pb-3 sm:p-6 sm:pb-3">
          <Card.Title>Run a Citability Scan</Card.Title>
          <Card.Description>
            Enter a public URL, HTML, or a passage of text. Your latest result remains available without another run.
          </Card.Description>
        </Card.Header>
        <Card.Content className="space-y-4 px-5 sm:px-6">
          <TextArea
            aria-label="Website URL or content to score"
            className="min-h-24"
            placeholder="https://example.com/article"
            value={input}
            variant="secondary"
            fullWidth
            onChange={(event) => onInputChange(event.target.value)}
          />
          {error ? (
            <p role="alert" className="text-sm leading-6 text-danger">
              {error}
            </p>
          ) : null}
        </Card.Content>
        <Card.Footer className="flex-col items-stretch gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="font-medium text-muted">Standard scan</span>
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <CreditCardIcon className="size-3.5" aria-hidden />
              {CREDIT_COSTS.tool_run_basic} credits
            </span>
          </div>
          <Button
            variant="primary"
            isDisabled={busy || input.trim().length === 0}
            onPress={onRun}
          >
            <GaugeIcon className="size-4" aria-hidden />
            {busy ? "Running…" : result ? "Re-run scan" : "Run scan"}
          </Button>
        </Card.Footer>
      </Card>

      {isLoading && !result ? (
        <RunnerSkeleton />
      ) : result ? (
        <>
          <Card>
            <Card.Content className="grid items-center gap-6 p-5 sm:p-6 md:grid-cols-[8rem_minmax(0,1fr)]">
              <div className="relative mx-auto flex size-28 items-center justify-center md:mx-0">
                <ProgressCircle
                  aria-label={`Citability score ${score} out of 100`}
                  color={scoreColor(score)}
                  size="lg"
                  value={score}
                  className="[&_.progress-circle__track]:size-28"
                >
                  <ProgressCircle.Track>
                    <ProgressCircle.TrackCircle />
                    <ProgressCircle.FillCircle />
                  </ProgressCircle.Track>
                </ProgressCircle>
                <span className="pointer-events-none absolute text-center">
                  <strong className="block text-2xl font-semibold leading-none tabular-nums">{score}</strong>
                  <span className="mt-1 block text-xs text-muted">out of 100</span>
                </span>
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold tracking-tight">{scoreLabel(score)}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                  {score >= 65
                    ? "Your content is already understandable and citable, with a few focused opportunities to strengthen its evidence."
                    : "Your content has useful signals, with clear opportunities to become easier for AI systems to quote and verify."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
                    <CalendarIcon className="size-3.5" aria-hidden />
                    {completedLabel}
                  </span>
                  <span className="text-xs font-medium text-muted">
                    {data?.total_blocks_analyzed ?? 0} passages analyzed
                  </span>
                </div>
              </div>
            </Card.Content>
          </Card>

          <Card>
            <Card.Header className="p-5 pb-2 sm:p-6 sm:pb-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Card.Title>Priority Findings</Card.Title>
                  <Card.Description>
                    Start with the weakest passages and apply the recommended rewrite pattern.
                  </Card.Description>
                </div>
                <span className="text-xs font-medium text-muted tabular-nums">
                  {issues.length} {issues.length === 1 ? "finding" : "findings"}
                </span>
              </div>
            </Card.Header>
            <Card.Content className="px-5 pb-5 sm:px-6 sm:pb-6">
              {issues.length > 0 ? (
                <Accordion>
                  {issues.map((issue) => (
                    <Accordion.Item key={issue.id} id={issue.id}>
                      <Accordion.Heading>
                        <Accordion.Trigger>
                          <span className="flex min-w-0 flex-1 items-start gap-3 text-left">
                            <ToneText tone={severityColor(issue.severity)} className="text-xs">
                              {issue.severity}
                            </ToneText>
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-foreground">{issue.title}</span>
                              <span className="mt-1 block text-xs leading-5 text-muted">{issue.description}</span>
                            </span>
                          </span>
                          <Accordion.Indicator>
                            <ChevronRightIcon className="size-4" aria-hidden />
                          </Accordion.Indicator>
                        </Accordion.Trigger>
                      </Accordion.Heading>
                      <Accordion.Panel>
                        <Accordion.Body className="space-y-5 pb-5 pt-2">
                          <div>
                            <h3 className="text-sm font-semibold">Why It Matters</h3>
                            <p className="mt-1 text-sm leading-6 text-muted">{issue.why}</p>
                          </div>

                          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
                            <div className="rounded-xl bg-danger-soft p-4">
                              <p className="text-xs font-medium text-danger">Before</p>
                              <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-foreground">
                                {issue.before}
                              </pre>
                            </div>
                            <ArrowRightIcon className="hidden size-4 text-muted lg:block" aria-hidden />
                            <div className="rounded-xl bg-success-soft p-4">
                              <p className="text-xs font-medium text-success">Recommended Pattern</p>
                              <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-foreground">
                                {issue.after}
                              </pre>
                            </div>
                          </div>

                          <div className="flex flex-col items-start gap-3 rounded-xl bg-surface-secondary p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold">Recommendation</p>
                              <p className="mt-1 text-sm leading-6 text-muted">{issue.recommendation}</p>
                            </div>
                            <HeroLink
                              href="/visibility/fixes"
                              className={`${buttonVariants({ size: "sm", variant: "outline" })} shrink-0 no-underline`}
                            >
                              Send to fix queue
                              <ArrowRightIcon className="size-4" aria-hidden />
                            </HeroLink>
                          </div>
                        </Accordion.Body>
                      </Accordion.Panel>
                    </Accordion.Item>
                  ))}
                </Accordion>
              ) : (
                <EmptyState size="sm">
                  <EmptyState.Header>
                    <EmptyState.Media variant="icon">
                      <CircleCheckIcon className="size-5 text-success" aria-hidden />
                    </EmptyState.Media>
                    <EmptyState.Title>No Priority Findings</EmptyState.Title>
                    <EmptyState.Description>
                      This run did not find any low-scoring passages that need immediate attention.
                    </EmptyState.Description>
                  </EmptyState.Header>
                </EmptyState>
              )}
            </Card.Content>
          </Card>
        </>
      ) : (
        <Card>
          <EmptyState>
            <EmptyState.Header>
              <EmptyState.Media variant="icon">
                <InsightIcon className="size-5" aria-hidden />
              </EmptyState.Media>
              <EmptyState.Title>Check Your Citability</EmptyState.Title>
              <EmptyState.Description className="max-w-md text-pretty">
                Enter a URL, HTML, or passage above to get a score and passage-level recommendations.
              </EmptyState.Description>
            </EmptyState.Header>
          </EmptyState>
        </Card>
      )}
    </main>
  );
}
