"use client";

import { Button, Card } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";

/**
 * V5.5 — AI answers page: share-of-answer per engine + the prompt × engine grid.
 * Each cell is ✓ cited · ✓ mentioned · ✗ absent · ⚠ competitor named instead.
 */

interface EngineShare {
  engine: string;
  prompts: number;
  appeared: number;
  cited: number;
  share: number;
}
interface PromptRow {
  id: string;
  prompt: string;
  active: boolean;
}
interface RunRow {
  promptId: string;
  engine: string;
  brandMentioned: boolean;
  brandCited: boolean;
  mentions?: { name: string; mentioned: boolean; cited: boolean }[];
}

const ENGINES = ["chatgpt", "perplexity", "gemini"] as const;
const ENGINE_LABELS: Record<string, string> = { chatgpt: "ChatGPT", perplexity: "Perplexity", gemini: "Gemini" };

function cell(run: RunRow | undefined): { label: string; className: string } {
  if (!run) return { label: "—", className: "text-default-300" };
  if (run.brandCited) return { label: "✓ cited", className: "text-success font-medium" };
  if (run.brandMentioned) return { label: "✓ mentioned", className: "text-success-600" };
  if (run.mentions?.some((m) => m.cited || m.mentioned)) return { label: "⚠ competitor", className: "text-warning" };
  return { label: "✗ absent", className: "text-danger-500" };
}

export default function AnswersPage() {
  const [data, setData] = useState<{ prompts: PromptRow[]; runs: RunRow[]; share: EngineShare[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/visibility/answers");
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: "run" | "seed") => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/visibility/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(null);
    }
  };

  const runFor = (promptId: string, engine: string) =>
    data?.runs.find((r) => r.promptId === promptId && r.engine === engine);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title="AI answers"
        description="Are the AI engines naming you — or your competitor — when people ask about your category?"
        meta={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" isDisabled={busy !== null} onPress={() => act("seed")}>
              {busy === "seed" ? "Seeding…" : "Seed prompts"}
            </Button>
            <Button size="sm" variant="primary" isDisabled={busy !== null} onPress={() => act("run")}>
              {busy === "run" ? "Checking…" : "Run check"}
            </Button>
          </div>
        }
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-3 gap-3">
        {ENGINES.map((engine) => {
          const s = data?.share.find((x) => x.engine === engine);
          return (
            <Card key={engine} className="p-4">
              <p className="text-sm text-default-500">{ENGINE_LABELS[engine]}</p>
              <p className="text-2xl font-semibold">{s ? `${s.share}%` : "—"}</p>
              <p className="text-xs text-default-400">
                {s ? `appeared in ${s.appeared}/${s.prompts} answers` : "no runs yet"}
              </p>
            </Card>
          );
        })}
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-default-100 text-left text-default-500">
              <th className="p-3">Prompt</th>
              {ENGINES.map((e) => (
                <th key={e} className="p-3">{ENGINE_LABELS[e]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.prompts ?? []).map((p) => (
              <tr key={p.id} className="border-b border-default-50">
                <td className="max-w-xs p-3">{p.prompt}</td>
                {ENGINES.map((e) => {
                  const c = cell(runFor(p.id, e));
                  return (
                    <td key={e} className={`p-3 ${c.className}`}>{c.label}</td>
                  );
                })}
              </tr>
            ))}
            {(data?.prompts ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-default-400">
                  No tracked prompts yet — seed a starter set, then run a check.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
