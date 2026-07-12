"use client";

import { Button, TextArea } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { PageHeader } from "@/components/layout/page-header";
import { ToolResultCard, type ToolFindingView } from "@/components/tools/tool-result";
import { queryKeys, useBrandProfile, useToolRun } from "@/lib/api/queries";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { getToolMeta } from "@/lib/visibility/toolbox-meta";

/**
 * V8.3: one Toolbox tool. Opens on the tool's latest stored result (so the
 * page is a report, not an empty box) with a re-run action that spends credits
 * only when the owner explicitly asks for a fresh reading.
 */

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

  // Prefill the input once: the last run's input, else the brand's website for
  // URL/domain tools: so re-running is one click, not a copy-paste chore.
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-12">
      <PageHeader title={tool.name} description={tool.description} />

      <section className="space-y-4 border-y border-separator/70 py-6">
        <TextArea
          aria-label={tool.name}
          className="min-h-20"
          placeholder={PLACEHOLDER[tool.inputKind]}
          value={input}
          onChange={(e) => {
            touched.current = true;
            setInput(e.target.value);
          }}
          variant="secondary"
          fullWidth
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs leading-relaxed tracking-[0.01em] text-default-400">
            A run costs {CREDIT_COSTS[tool.costKey]} credits. Your last result stays here for
            free.
          </span>
          <Button
            size="sm"
            variant="primary"
            className="sm:shrink-0"
            isDisabled={busy || input.trim().length === 0}
            onPress={run}
          >
            {busy ? "Running…" : hasResult ? "Re-run tool" : "Run tool"}
          </Button>
        </div>
        {error && <p className="text-sm leading-relaxed text-danger">{error}</p>}
      </section>

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
          findings={storedRun.findings.filter((f) => !f.isResolved)}
          data={storedRun.data}
          freshRun={false}
        />
      ) : latest.isLoading ? (
        <CardSkeleton lines={4} />
      ) : (
        <div className="border-y border-separator/70 py-6 text-sm leading-relaxed text-default-500">
          No runs yet. Run it once and this page will always show your latest result.
        </div>
      )}
    </div>
  );
}
