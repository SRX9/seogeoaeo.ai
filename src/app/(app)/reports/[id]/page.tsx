"use client";

import { Button } from "@heroui/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeftIcon, ArrowUpIcon } from "@/components/icons";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { useReport } from "@/lib/api/queries";
import { weekLabel } from "@/lib/visibility/display";

const reportSkeleton = <CardSkeleton lines={10} />;

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const report = useReport(params.id);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-7">
      <Link
        href="/reports"
        className="pressable inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-muted hover-fine:bg-surface-secondary hover-fine:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        All reports
      </Link>
      <Section query={report} skeleton={reportSkeleton} errorLabel="Couldn't load this report.">
        {(data) => {
          const { proof, fixes, content, planChanges } = data.story;
          const score = proof.score;
          const totalAnswers = proof.answerShare.reduce((total, row) => total + row.prompts, 0);
          const appeared = proof.answerShare.reduce((total, row) => total + row.appeared, 0);
          const answerPercent = totalAnswers ? Math.round((appeared / totalAnswers) * 100) : null;
          return (
            <article className="overflow-hidden rounded-[1.75rem] bg-surface shadow-surface">
              <header className="p-6 sm:p-9">
                <p className="text-sm font-medium text-muted">{weekLabel(data.report.weekStart)}</p>
                <h1 className="mt-3 max-w-3xl text-3xl text-foreground sm:text-4xl">
                  {data.report.subject}
                </h1>
                <div className="mt-7 grid gap-5 sm:grid-cols-3">
                  <Outcome label="Visibility" value={score?.current ?? "—"} delta={score?.delta ?? null} />
                  <Outcome label="AI answer share" value={answerPercent == null ? "—" : `${answerPercent}%`} />
                  <Outcome label="Search clicks" value={proof.traffic?.clicks ?? "—"} delta={proof.traffic ? proof.traffic.clicks - proof.traffic.prevClicks : null} />
                </div>
              </header>

              <div className="space-y-0 border-t border-separator/60">
                <StorySection number="01" title="Work completed">
                  <p>{fixes.applied || fixes.verified ? `Applied ${fixes.applied} fix${fixes.applied === 1 ? "" : "es"} and verified ${fixes.verified}.` : "No live site fixes were claimed this week."}</p>
                  {content.published.map((article) => (
                    <p key={article.title}>Published “{article.title}”{article.thesis ? ` — ${article.thesis}` : ""}</p>
                  ))}
                  {!content.published.length && !fixes.applied && !fixes.verified ? <p>Claudia spent this week gathering evidence and preparing work.</p> : null}
                </StorySection>

                <StorySection number="02" title="What the evidence taught us">
                  {content.performance.length ? content.performance.map((line) => <p key={line}>{line}</p>) : <p>There is not enough mature performance evidence to call a winner or stop a strategy yet.</p>}
                  {planChanges.map((change) => <p key={change}>{change}</p>)}
                </StorySection>

                <StorySection number="03" title="Next direction">
                  {content.nextWeek.length ? content.nextWeek.map((item) => <p key={item.title}>“{item.title}”{item.thesis ? ` — ${item.thesis}` : ""}</p>) : <p>The next task will be selected from the freshest audit, answer-share, and traffic evidence.</p>}
                </StorySection>

                <div className="p-6 sm:p-9">
                  {data.ask ? (
                    <div className="rounded-2xl bg-warning-soft p-5 text-warning-soft-foreground">
                      <p className="font-medium">One thing from you</p>
                      <p className="mt-1 text-sm leading-6">{data.ask.what}</p>
                      <Link href={data.ask.href} className="mt-4 inline-block">
                        <Button size="sm">Take care of it</Button>
                      </Link>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">Nothing needed from you this week.</p>
                  )}
                </div>
              </div>
            </article>
          );
        }}
      </Section>
    </div>
  );
}

function Outcome({ label, value, delta }: { label: string; value: string | number; delta?: number | null }) {
  return (
    <div>
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-foreground tabular-nums">{value}</p>
      {delta != null ? (
        <p className={`mt-1 inline-flex items-center gap-1 text-sm tabular-nums ${delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-muted"}`}>
          {delta > 0 ? <ArrowUpIcon className="size-3.5" /> : null}
          {delta > 0 ? "+" : ""}{delta} vs prior period
        </p>
      ) : null}
    </div>
  );
}

function StorySection({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-separator/60 p-6 sm:grid-cols-[5rem_1fr] sm:p-9">
      <p className="text-sm text-muted tabular-nums">{number}</p>
      <div>
        <h2 className="text-xl text-foreground">{title}</h2>
        <div className="mt-4 space-y-3 text-sm leading-7 text-muted">{children}</div>
      </div>
    </section>
  );
}
