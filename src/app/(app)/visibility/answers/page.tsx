"use client";

import { Button, Card, Skeleton, Table } from "@heroui/react";
import { EmptyState } from "@heroui-pro/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PenIcon, RefreshIcon } from "@/components/icons";
import { ToneText } from "@/components/ui/status-text";
import { LoadingButton } from "@/components/ui/loading-button";
import { Section } from "@/components/feedback/section";
import { apiPost, getErrorMessage } from "@/lib/api/fetcher";
import {
  queryKeys,
  useSetupInProgress,
  useVisibilityAnswers,
  type VisibilityAnswers,
} from "@/lib/api/queries";

const ENGINES = ["chatgpt", "perplexity", "gemini"] as const;
type Engine = (typeof ENGINES)[number];
type RunRow = VisibilityAnswers["runs"][number];
type CellTone = "cited" | "mentioned" | "competitor" | "absent" | "empty";

const ENGINE_LABELS: Record<Engine, string> = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
};

function EngineMark({ engine }: { engine: Engine }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-xs font-semibold text-foreground" aria-hidden>
      {ENGINE_LABELS[engine].slice(0, 1)}
    </span>
  );
}

function outcome(run: RunRow | undefined): { label: string; tone: CellTone } {
  if (!run) return { label: "No Check", tone: "empty" };
  if (run.brandCited) return { label: "Cited", tone: "cited" };
  if (run.brandMentioned) return { label: "Mentioned", tone: "mentioned" };
  if (run.mentions?.some((mention) => mention.cited || mention.mentioned)) {
    return { label: "Competitor", tone: "competitor" };
  }
  return { label: "Absent", tone: "absent" };
}

function toneColor(tone: CellTone): "success" | "warning" | "danger" | "default" {
  if (tone === "cited") return "success";
  if (tone === "mentioned" || tone === "competitor") return "warning";
  if (tone === "absent") return "danger";
  return "default";
}

function evidenceDescription(tone: CellTone) {
  if (tone === "cited") return "Your brand was cited as a source in this answer.";
  if (tone === "mentioned") return "Your brand appeared without a citation.";
  if (tone === "competitor") return "A tracked competitor appeared instead of your brand.";
  if (tone === "absent") return "Your brand and tracked citations were absent.";
  return "This prompt has not been checked yet.";
}

function EngineScore({ engine, data }: { engine: Engine; data: VisibilityAnswers }) {
  const score = data.share.find((item) => item.engine === engine);
  return (
    <Card>
      <Card.Content className="flex items-center gap-4">
        <EngineMark engine={engine} />
        <div className="min-w-0">
          <p className="text-sm text-muted">{ENGINE_LABELS[engine]}</p>
          <p className="mt-1 text-3xl font-semibold leading-none tracking-tight text-foreground tabular-nums">
            {score ? `${score.share}%` : "—"}
          </p>
          <p className="mt-2 text-xs text-muted">
            {score ? `${score.cited} of ${score.prompts} cited` : "No checks yet"}
          </p>
        </div>
      </Card.Content>
    </Card>
  );
}

function AnswersContent({
  data,
  busy,
  isDisabled,
  onEdit,
  onRun,
  errorMessage,
  settingUp,
}: {
  data: VisibilityAnswers;
  busy: "run" | "seed" | null;
  isDisabled: boolean;
  onEdit: () => void;
  onRun: () => void;
  errorMessage: string | null;
  settingUp: boolean;
}) {
  const [openCell, setOpenCell] = useState<string | null>(null);
  const runFor = (promptId: string, engine: Engine) =>
    data.runs.find((run) => run.promptId === promptId && run.engine === engine);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="sr-only">AI Answers</h1>
          <p className="text-sm text-muted">
            {data.prompts.length} tracked prompts · {settingUp ? "First check in progress" : "Latest checks loaded"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LoadingButton variant="secondary" isDisabled={isDisabled} isPending={busy === "seed"} onPress={onEdit}>
            <PenIcon className="size-4" aria-hidden />
            Edit Prompts
          </LoadingButton>
          <LoadingButton isDisabled={isDisabled} isPending={busy === "run"} onPress={onRun}>
            <RefreshIcon className="size-4" aria-hidden />
            Run Check
          </LoadingButton>
        </div>
      </header>

      {errorMessage ? <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground" role="alert">{errorMessage}</p> : null}

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Share of AI answers by engine">
        {ENGINES.map((engine) => <EngineScore key={engine} engine={engine} data={data} />)}
      </section>

      <Card className="overflow-hidden p-0">
        <Card.Header className="p-6 pb-4">
          <Card.Title>Prompt Coverage</Card.Title>
          <Card.Description>Select a status to see the evidence behind it.</Card.Description>
        </Card.Header>
        <Card.Content className="p-0">
          {data.prompts.length === 0 ? (
            <EmptyState className="py-12">
              <EmptyState.Header>
                <EmptyState.Title>No Tracked Prompts</EmptyState.Title>
                <EmptyState.Description>
                  Add the starter prompt set, then run a check to compare your coverage across AI engines.
                </EmptyState.Description>
              </EmptyState.Header>
              <EmptyState.Content>
                <LoadingButton variant="secondary" isDisabled={isDisabled} isPending={busy === "seed"} onPress={onEdit}>
                  Add Starter Prompts
                </LoadingButton>
              </EmptyState.Content>
            </EmptyState>
          ) : (
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label="Prompt coverage by AI engine" className="min-w-[760px]">
                  <Table.Header>
                    <Table.Column id="prompt" isRowHeader>Prompt</Table.Column>
                    {ENGINES.map((engine) => (
                      <Table.Column id={engine} key={engine}>{ENGINE_LABELS[engine]}</Table.Column>
                    ))}
                  </Table.Header>
                  <Table.Body>
                    {data.prompts.map((prompt) => (
                      <Table.Row id={prompt.id} key={prompt.id}>
                        <Table.Cell>
                          <div className="max-w-md">
                            <p className="font-medium text-foreground">{prompt.prompt}</p>
                            <p className="mt-1 text-xs text-muted">{prompt.active ? "Active tracking prompt" : "Tracking paused"}</p>
                          </div>
                        </Table.Cell>
                        {ENGINES.map((engine) => {
                          const cell = outcome(runFor(prompt.id, engine));
                          const key = `${prompt.id}:${engine}`;
                          const expanded = openCell === key;
                          return (
                            <Table.Cell key={engine} className="align-top">
                              <Button
                                variant="ghost"
                                className="h-auto min-h-0 justify-start p-0"
                                aria-expanded={expanded}
                                onPress={() => setOpenCell(expanded ? null : key)}
                              >
                                <ToneText tone={toneColor(cell.tone)} className="text-xs">{cell.label}</ToneText>
                              </Button>
                              {expanded ? <p className="mt-2 max-w-48 text-xs leading-relaxed text-muted">{evidenceDescription(cell.tone)}</p> : null}
                            </Table.Cell>
                          );
                        })}
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          )}
        </Card.Content>
      </Card>
    </main>
  );
}

const answersSkeleton = (
  <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4" aria-hidden>
    <Skeleton className="h-20 rounded-2xl" />
    <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-36 rounded-2xl" />)}</div>
    <Skeleton className="h-80 rounded-2xl" />
  </div>
);

export default function AnswersPage() {
  const answers = useVisibilityAnswers();
  const queryClient = useQueryClient();
  const settingUp = useSetupInProgress();
  const action = useMutation({
    mutationFn: (kind: "run" | "seed") => apiPost("/api/visibility/answers", { action: kind }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.visibilityAnswers }),
  });

  const busy = action.isPending ? action.variables : null;
  const errorMessage = action.error ? getErrorMessage(action.error, "Request failed") : null;

  return (
    <Section query={answers} skeleton={answersSkeleton} errorLabel="Couldn't load your AI answer checks.">
      {(data) => (
        <AnswersContent
          data={data}
          busy={busy}
          isDisabled={action.isPending || settingUp}
          onEdit={() => action.mutate("seed")}
          onRun={() => action.mutate("run")}
          errorMessage={errorMessage}
          settingUp={settingUp}
        />
      )}
    </Section>
  );
}
