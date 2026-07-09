"use client";

import { Button, Card } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ComponentType, SVGProps } from "react";
import { Section } from "@/components/feedback/section";
import { CardSkeleton, TableSkeleton } from "@/components/feedback/skeletons";
import { GlobeIcon, SearchIcon, SparklesIcon } from "@/components/icons";
import { PageHeader } from "@/components/layout/page-header";
import { apiPost, getErrorMessage } from "@/lib/api/fetcher";
import {
  queryKeys,
  useSetupInProgress,
  useVisibilityAnswers,
  type VisibilityAnswers,
} from "@/lib/api/queries";

/**
 * V5.5 — AI answers page: share-of-answer per engine + the prompt × engine grid.
 * Each cell is ✓ cited · ✓ mentioned · ✗ absent · ⚠ competitor named instead.
 */

const ENGINES = ["chatgpt", "perplexity", "gemini"] as const;
const ENGINE_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
};
const ENGINE_ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  chatgpt: SparklesIcon,
  perplexity: SearchIcon,
  gemini: GlobeIcon,
};

type RunRow = VisibilityAnswers["runs"][number];

function cell(run: RunRow | undefined): { label: string; className: string } {
  if (!run) return { label: "—", className: "text-default-300" };
  if (run.brandCited) return { label: "✓ cited", className: "text-success font-medium" };
  if (run.brandMentioned) return { label: "✓ mentioned", className: "text-success-600" };
  if (run.mentions?.some((m) => m.cited || m.mentioned))
    return { label: "⚠ competitor", className: "text-warning" };
  return { label: "✗ absent", className: "text-danger-500" };
}

const answersSkeleton = (
  <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-3">
      <CardSkeleton lines={1} />
      <CardSkeleton lines={1} />
      <CardSkeleton lines={1} />
    </div>
    <TableSkeleton rows={5} />
  </div>
);

function AnswersContent({ data }: { data: VisibilityAnswers }) {
  const runFor = (promptId: string, engine: string) =>
    data.runs.find((r) => r.promptId === promptId && r.engine === engine);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {ENGINES.map((engine) => {
          const s = data.share.find((x) => x.engine === engine);
          const EngineIcon = ENGINE_ICONS[engine] ?? SparklesIcon;
          return (
            <Card key={engine} className="p-5">
              <div className="flex items-center gap-2">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-muted">
                  <EngineIcon className="size-4" />
                </div>
                <p className="text-sm text-default-500">{ENGINE_LABELS[engine]}</p>
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {s ? `${s.share}%` : "—"}
              </p>
              <p className="text-xs text-default-400">
                {s ? `appeared in ${s.appeared}/${s.prompts} answers` : "no runs yet"}
              </p>
            </Card>
          );
        })}
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-140 text-sm">
          <thead>
            <tr className="border-b border-default-100 text-left text-default-500">
              <th className="p-3">Prompt</th>
              {ENGINES.map((e) => (
                <th key={e} className="p-3">
                  {ENGINE_LABELS[e]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.prompts.map((p) => (
              <tr key={p.id} className="border-b border-default-50">
                <td className="max-w-xs p-3">{p.prompt}</td>
                {ENGINES.map((e) => {
                  const c = cell(runFor(p.id, e));
                  return (
                    <td key={e} className={`p-3 ${c.className}`}>
                      {c.label}
                    </td>
                  );
                })}
              </tr>
            ))}
            {data.prompts.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-default-400">
                  No tracked prompts yet — seed a starter set, then run a check.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}

export default function AnswersPage() {
  const answers = useVisibilityAnswers();
  const queryClient = useQueryClient();
  const settingUp = useSetupInProgress();

  const act = useMutation({
    mutationFn: (action: "run" | "seed") => apiPost("/api/visibility/answers", { action }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.visibilityAnswers }),
  });
  const busy = act.isPending ? act.variables : null;
  const errorMessage = act.error ? getErrorMessage(act.error, "Request failed") : null;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <PageHeader
        title="AI answers"
        description="Share-of-answer across ChatGPT, Perplexity, and Gemini — also summarized on Claudia's proof strip."
        meta={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              isDisabled={act.isPending || settingUp}
              onPress={() => act.mutate("seed")}
            >
              {busy === "seed" ? "Seeding…" : "Seed prompts"}
            </Button>
            <Button
              size="sm"
              variant="primary"
              isDisabled={act.isPending || settingUp}
              onPress={() => act.mutate("run")}
            >
              {busy === "run" ? "Checking…" : "Run check"}
            </Button>
          </div>
        }
      />

      {settingUp && (
        <p className="text-sm text-muted">
          Claudia is setting up your brand — she seeds prompts and runs the first answer check
          herself.
        </p>
      )}
      {errorMessage && <p className="text-sm text-danger">{errorMessage}</p>}

      <Section
        query={answers}
        skeleton={answersSkeleton}
        errorLabel="Couldn't load your AI answer checks."
      >
        {(data) => <AnswersContent data={data} />}
      </Section>
    </div>
  );
}
