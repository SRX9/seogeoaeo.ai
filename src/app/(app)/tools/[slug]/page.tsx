"use client";

import { Button, Card, Input, Skeleton, TextArea } from "@heroui/react";
import { EmptyState } from "@heroui-pro/react";
import { useQueryClient } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { CreditCardIcon, GaugeIcon } from "@/components/icons";
import { PageHeader } from "@/components/layout/page-header";
import { AiCitabilityRunner } from "@/components/tools/ai-citability-runner";
import { ToolResultCard, type ToolFindingView } from "@/components/tools/tool-result";
import { queryKeys, useBrandProfile, useToolRun } from "@/lib/api/queries";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { getToolMeta } from "@/lib/visibility/toolbox-meta";

const PLACEHOLDER: Record<string, string> = {
  domain: "example.com",
  url: "https://example.com/page",
  "page-or-text": "Paste a URL, HTML, or a paragraph of text…",
};

type FreshResult = {
  score: number | null;
  findings: ToolFindingView[];
  data: unknown;
};

export default function ToolRunnerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const tool = getToolMeta(slug);
  const queryClient = useQueryClient();
  const latest = useToolRun(slug);
  const website = useBrandProfile().data?.profile.website?.trim() || null;

  const [input, setInput] = useState("");
  const touched = useRef(false);
  const [fresh, setFresh] = useState<FreshResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastInput = latest.data?.run?.input ?? null;
  const inputKind = tool?.inputKind;
  useEffect(() => {
    if (touched.current) return;
    const prefill =
      lastInput ?? (inputKind === "domain" || inputKind === "url" ? website : null);
    if (prefill) setInput(prefill);
  }, [lastInput, website, inputKind]);

  if (!tool) return notFound();

  const storedRun = latest.data?.run ?? null;
  const hasResult = fresh != null || storedRun != null;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tools/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      if (res.status === 402) throw new Error("Out of credits: top up to run this tool.");
      if (!res.ok) throw new Error((await res.json()).error ?? "Run failed");
      const body = (await res.json()) as {
        score: number | null;
        findings: ToolFindingView[];
        data: unknown;
      };
      setFresh({ score: body.score, findings: body.findings ?? [], data: body.data });
      queryClient.invalidateQueries({ queryKey: queryKeys.toolRun(slug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.toolLatestRuns });
      queryClient.invalidateQueries({ queryKey: queryKeys.visibilityFindings });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Run failed");
    } finally {
      setBusy(false);
    }
  };

  if (slug === "citability") {
    return (
      <AiCitabilityRunner
        input={input}
        onInputChange={(value) => {
          touched.current = true;
          setInput(value);
        }}
        onRun={run}
        busy={busy}
        error={error}
        isLoading={latest.isLoading}
        result={
          fresh
            ? {
                score: fresh.score,
                data: fresh.data,
                ranAt: null,
                freshRun: true,
              }
            : storedRun
              ? {
                  score: storedRun.score,
                  data: storedRun.data,
                  ranAt: storedRun.createdAt,
                  freshRun: false,
                }
              : null
        }
      />
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <PageHeader
        title={tool.name}
        description={tool.description}
        meta={
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted">
            <GaugeIcon className="size-3.5" aria-hidden />
            {tool.pillar.toUpperCase()} analyzer
          </span>
        }
      />

      <Card>
        <Card.Header className="p-5 pb-3 sm:p-6 sm:pb-3">
          <Card.Title>{hasResult ? "Run Again" : "Run Analyzer"}</Card.Title>
          <Card.Description>
            Enter the source to analyze. Your latest saved result stays available between runs.
          </Card.Description>
        </Card.Header>
        <Card.Content className="space-y-4 px-5 sm:px-6">
          {tool.inputKind === "page-or-text" ? (
            <TextArea
              aria-label={tool.name}
              className="min-h-28"
              placeholder={PLACEHOLDER[tool.inputKind]}
              value={input}
              onChange={(event) => {
                touched.current = true;
                setInput(event.target.value);
              }}
              variant="secondary"
              fullWidth
            />
          ) : (
            <Input
              aria-label={tool.name}
              placeholder={PLACEHOLDER[tool.inputKind]}
              value={input}
              onChange={(event) => {
                touched.current = true;
                setInput(event.target.value);
              }}
              variant="secondary"
              fullWidth
            />
          )}
          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-danger-soft px-4 py-3 text-sm leading-6 text-danger-soft-foreground"
            >
              {error}
            </p>
          ) : null}
        </Card.Content>
        <Card.Footer className="flex-col items-stretch gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <span className="inline-flex items-center gap-2 text-xs leading-5 text-muted tabular-nums">
            <CreditCardIcon className="size-3.5" aria-hidden />
            {CREDIT_COSTS[tool.costKey].toLocaleString()} credits per run
          </span>
          <Button
            variant="primary"
            className="sm:shrink-0"
            isDisabled={busy || input.trim().length === 0}
            onPress={run}
          >
            {busy ? "Running…" : hasResult ? "Re-run tool" : "Run tool"}
          </Button>
        </Card.Footer>
      </Card>

      {fresh ? (
        <ToolResultCard
          score={fresh.score}
          ranAt={null}
          findings={fresh.findings}
          data={fresh.data}
          freshRun
        />
      ) : storedRun ? (
        <ToolResultCard
          score={storedRun.score}
          ranAt={storedRun.createdAt}
          findings={storedRun.findings.filter((finding) => !finding.isResolved)}
          data={storedRun.data}
          freshRun={false}
        />
      ) : latest.isLoading ? (
        <Card className="space-y-4 p-6" aria-label="Loading saved tool result">
          <Skeleton className="h-8 w-36 rounded-lg" />
          <Skeleton className="h-4 w-full rounded-lg" />
          <Skeleton className="h-4 w-4/5 rounded-lg" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </Card>
      ) : latest.isError ? (
        <Card>
          <EmptyState size="sm">
            <EmptyState.Header>
              <EmptyState.Title>{"Couldn't Load the Saved Result"}</EmptyState.Title>
              <EmptyState.Description>
                You can still run the analyzer now, or refresh this page to try loading the previous result again.
              </EmptyState.Description>
            </EmptyState.Header>
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <EmptyState size="sm">
            <EmptyState.Header>
              <EmptyState.Media variant="icon">
                <GaugeIcon className="size-5" aria-hidden />
              </EmptyState.Media>
              <EmptyState.Title>No Runs Yet</EmptyState.Title>
              <EmptyState.Description>
                Run this analyzer once and the page will keep your latest result here.
              </EmptyState.Description>
            </EmptyState.Header>
          </EmptyState>
        </Card>
      )}
    </main>
  );
}
