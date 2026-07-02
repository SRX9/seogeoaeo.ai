"use client";

import { Button, Card } from "@heroui/react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { use, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { getToolMeta } from "@/lib/visibility/toolbox-meta";

/** V8.3 — shared ToolRunner shell for every Toolbox tool. */

const PLACEHOLDER: Record<string, string> = {
  domain: "example.com",
  url: "https://example.com/page",
  "page-or-text": "Paste a URL, HTML, or a paragraph of text…",
};

export default function ToolRunnerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const tool = getToolMeta(slug);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<{ score: number | null; findings: unknown[]; data: unknown } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!tool) return notFound();

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/tools/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      if (res.status === 402) throw new Error("Out of credits — top up to run this tool.");
      if (!res.ok) throw new Error((await res.json()).error ?? "Run failed");
      setResult((await res.json()).data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader title={tool.name} description={tool.description} />

      <Card className="space-y-3 p-5">
        <textarea
          className="min-h-[80px] w-full resize-y rounded-medium border border-default-200 bg-transparent p-3 text-sm"
          placeholder={PLACEHOLDER[tool.inputKind]}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-default-400">Costs {CREDIT_COSTS[tool.costKey]} credits</span>
          <Button size="sm" variant="primary" isDisabled={busy || input.trim().length === 0} onPress={run}>
            {busy ? "Running…" : "Run"}
          </Button>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </Card>

      {result && (
        <Card className="space-y-3 p-5">
          {result.score != null && <p className="text-2xl font-semibold">{Math.round(result.score)}/100</p>}
          <p className="text-sm text-default-500">
            {result.findings.length} finding(s) — see them all in your{" "}
            <Link className="text-primary underline" href="/visibility/fixes">
              fix queue
            </Link>
            , or let Claudia handle it in{" "}
            <Link className="text-primary underline" href="/visibility">
              Visibility
            </Link>
            .
          </p>
          <pre className="overflow-x-auto rounded bg-default-100 p-3 text-xs">{JSON.stringify(result.data, null, 2)}</pre>
        </Card>
      )}
    </div>
  );
}
