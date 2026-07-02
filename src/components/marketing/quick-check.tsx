"use client";

import { Input } from "@heroui/react/input";
import { buttonVariants } from "@heroui/react/button";
import Link from "next/link";
import { useState } from "react";
import { LoadingButton } from "@/components/ui/loading-button";
import { PILLAR_LABELS, QUICK_SIGNAL_LABELS, scoreBand } from "@/lib/visibility/display";
import type { QuickResult } from "@/lib/visibility/quick";

/**
 * V1.5 — public "check your site" form (top of the growth funnel). Calls the
 * unauthenticated quick-snapshot route and renders the estimate + top gaps;
 * the signup CTA carries the domain + result token into onboarding.
 */

type CheckState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "done"; token: string; result: QuickResult };

function signalRows(result: QuickResult) {
  const { crawlerAccess, llmsTxt, meta, schema, ssr } = result.signals;
  return [
    {
      label: QUICK_SIGNAL_LABELS.crawlerAccess,
      ok: crawlerAccess.blocked.length === 0,
      detail:
        crawlerAccess.blocked.length === 0
          ? "No AI crawlers blocked"
          : `${crawlerAccess.blocked.length} blocked (${crawlerAccess.blocked.slice(0, 3).join(", ")}${crawlerAccess.blocked.length > 3 ? "…" : ""})`,
    },
    {
      label: QUICK_SIGNAL_LABELS.llmsTxt,
      ok: llmsTxt.exists && llmsTxt.formatValid,
      detail: llmsTxt.exists ? (llmsTxt.formatValid ? "Found and valid" : "Found but malformed") : "Not found",
    },
    {
      label: QUICK_SIGNAL_LABELS.meta,
      ok: meta.score >= 75,
      detail: `${meta.checks.filter((c) => c.status === "present").length}/${meta.checks.length} checks passing`,
    },
    {
      label: QUICK_SIGNAL_LABELS.schema,
      ok: schema.jsonLdCount > 0,
      detail: schema.jsonLdCount > 0 ? `${schema.jsonLdCount} JSON-LD block(s)` : "None on homepage",
    },
    {
      label: QUICK_SIGNAL_LABELS.ssr,
      ok: ssr.hasSsrContent,
      detail: ssr.hasSsrContent ? "Readable without JavaScript" : "Requires JavaScript — invisible to AI",
    },
  ];
}

export function QuickCheck() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<CheckState>({ phase: "idle" });

  async function runCheck(event: React.FormEvent) {
    event.preventDefault();
    if (!url.trim()) return;
    setState({ phase: "loading" });
    try {
      const response = await fetch("/api/visibility/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await response.json()) as
        | { token: string; result: QuickResult }
        | { error: string };
      if (!response.ok || "error" in data) {
        setState({
          phase: "error",
          message: "error" in data ? data.error : "Something went wrong. Try again.",
        });
        return;
      }
      setState({ phase: "done", token: data.token, result: data.result });
    } catch {
      setState({ phase: "error", message: "Couldn't reach the server. Try again." });
    }
  }

  return (
    <section id="quick-check" className="mx-auto max-w-6xl px-4 pb-20">
      <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-surface p-6 sm:p-8">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-foreground">
          How visible is your site to AI?
        </h2>
        <p className="mt-2 text-center text-sm text-muted">
          Free 60-second check across {PILLAR_LABELS.seo.toLowerCase()} and{" "}
          {PILLAR_LABELS.geo.toLowerCase()}. No signup needed.
        </p>
        <form onSubmit={runCheck} className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="yoursite.com"
            aria-label="Your website URL"
            className="flex-1"
          />
          <LoadingButton type="submit" isPending={state.phase === "loading"}>
            Check my site
          </LoadingButton>
        </form>

        {state.phase === "error" && (
          <p className="mt-4 text-center text-sm text-danger">{state.message}</p>
        )}

        {state.phase === "done" && (
          <div className="mt-8">
            <div className="flex items-baseline justify-center gap-3">
              <span className="text-5xl font-semibold text-foreground">
                {state.result.score}
              </span>
              <span className="text-lg text-muted">/ 100 · {scoreBand(state.result.score)}</span>
            </div>
            <p className="mt-1 text-center text-xs text-muted">
              Estimate — run the full audit for the real score.
            </p>

            <ul className="mt-6 space-y-2">
              {signalRows(state.result).map((row) => (
                <li
                  key={row.label}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2 text-foreground">
                    <span
                      aria-hidden
                      className={`size-2 rounded-full ${row.ok ? "bg-success" : "bg-danger"}`}
                    />
                    {row.label}
                  </span>
                  <span className="text-right text-muted">{row.detail}</span>
                </li>
              ))}
            </ul>

            {state.result.topGaps.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-foreground">Top gaps to fix</h3>
                <ul className="mt-2 space-y-1.5 text-sm text-muted">
                  {state.result.topGaps.map((gap) => (
                    <li key={gap.title} className="flex gap-2">
                      <span aria-hidden>•</span>
                      {gap.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-8 text-center">
              <Link
                href={`/login?domain=${encodeURIComponent(state.result.domain)}&snapshot=${state.token}`}
                className={buttonVariants({ size: "lg" })}
              >
                Fix these gaps automatically
              </Link>
              <p className="mt-2 text-xs text-muted">
                Sign up free — we&apos;ll carry this result into your workspace.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
