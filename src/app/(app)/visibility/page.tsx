"use client";

import { Button, Card } from "@heroui/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ProofPanel } from "@/components/visibility/proof-panel";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { SUBSCORE_EXPLAINERS, SUBSCORE_LABELS } from "@/lib/visibility/display";
import type { SubScore } from "@/lib/visibility/types";

interface Summary {
  hasAudit: boolean;
  latest: {
    id: string;
    overall: number | null;
    band: string | null;
    subScores: Record<SubScore["key"], number | null>;
  } | null;
  previousOverall: number | null;
  baseline: { baseline: number | null; scope: string };
}

const KEYS: SubScore["key"][] = ["citability", "brand", "eeat", "technical", "schema", "platform"];
const fmt = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n)}`);

export default function VisibilityPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsWebsite, setNeedsWebsite] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/visibility/summary");
    if (res.ok) setSummary(await res.json());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const runAudit = async () => {
    setRunning(true);
    setError(null);
    try {
      // Zero-input: the server audits the active brand's website.
      const res = await fetch("/api/visibility/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.status === 402) throw new Error("Out of credits — top up to run an audit.");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.details?.code === "NO_WEBSITE") {
          setNeedsWebsite(true);
          return;
        }
        throw new Error(body.error ?? "Failed to start audit");
      }
      setTimeout(load, 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setRunning(false);
    }
  };

  const latest = summary?.latest;
  const delta = latest?.overall != null && summary?.previousOverall != null ? Math.round(latest.overall - summary.previousOverall) : null;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title="Visibility"
        description="How discoverable your site is across Google, answer boxes, and AI assistants."
        meta={
          <Button size="sm" variant="primary" isDisabled={running} onPress={runAudit}>
            {running ? "Starting…" : `Run audit · ${CREDIT_COSTS.visibility_audit} cr`}
          </Button>
        }
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      {needsWebsite && (
        <p className="text-sm text-warning">
          Your brand has no website yet —{" "}
          <Link className="underline" href="/settings">
            add it in brand settings
          </Link>{" "}
          and Claudia will take it from there.
        </p>
      )}

      {!summary?.hasAudit ? (
        <Card className="p-8 text-center">
          <p className="text-lg font-medium">No audit yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-default-500">
            Run your first audit to get one 0–100 score for how easily people and AI assistants can find and cite your
            site — plus a prioritized fix list.
          </p>
        </Card>
      ) : (
        <>
          <Card className="p-6">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm text-default-500">Overall visibility</p>
                <p className="text-4xl font-semibold">
                  {fmt(latest?.overall)}
                  <span className="ml-2 text-lg font-normal text-default-400">/100 · {latest?.band}</span>
                </p>
              </div>
              <div className="text-right text-sm">
                {delta != null && (
                  <p className={delta >= 0 ? "text-success" : "text-danger"}>
                    {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} vs last audit
                  </p>
                )}
                {summary?.baseline.baseline != null && (
                  <p className="text-default-400">typical: {Math.round(summary.baseline.baseline)}</p>
                )}
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {KEYS.map((k) => (
              <Card key={k} className="p-4" title={SUBSCORE_EXPLAINERS[k]}>
                <p className="text-xs text-default-500">{SUBSCORE_LABELS[k]}</p>
                <p className="text-2xl font-semibold">{fmt(latest?.subScores[k])}</p>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <Link className="text-primary underline" href="/visibility/fixes">
              Open fix queue →
            </Link>
            <Link className="text-primary underline" href="/visibility/answers">
              AI answers →
            </Link>
            {latest && (
              <Link className="text-primary underline" href={`/visibility/${latest.id}`}>
                Full report →
              </Link>
            )}
          </div>

          <ProofPanel />
        </>
      )}
    </div>
  );
}
