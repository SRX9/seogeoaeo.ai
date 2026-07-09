"use client";

import { Card } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import Link from "next/link";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { TrendingUpIcon } from "@/components/icons";
import { useVisibilityTraffic, type VisibilityTraffic } from "@/lib/api/queries";

/**
 * V6.6 — Proof panel: GSC clicks trend with audit-date markers + per-engine AI
 * referrals. Empty state shows connect buttons with a one-line reason each.
 * Proof is free — nothing here is metered.
 */

function ProofContent({ data }: { data: VisibilityTraffic }) {
  const totalClicks = data.gsc.reduce((s, r) => s + r.clicks, 0);
  // Compare the first half of the window to the most recent half so a single
  // spiky day doesn't dominate the headline delta.
  const avgClicks = (rows: VisibilityTraffic["gsc"]) =>
    rows.length ? rows.reduce((s, r) => s + r.clicks, 0) / rows.length : 0;
  const half = Math.max(1, Math.floor(data.gsc.length / 2));
  const firstAvg = avgClicks(data.gsc.slice(0, half));
  const lastAvg = avgClicks(data.gsc.slice(-half));
  const clickDelta = firstAvg > 0 ? Math.round(((lastAvg - firstAvg) / firstAvg) * 100) : null;

  const referralTotals: Record<string, number> = {};
  for (const row of data.aiReferrals) {
    for (const [engine, n] of Object.entries(row.byEngine))
      referralTotals[engine] = (referralTotals[engine] ?? 0) + n;
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-muted">
            <TrendingUpIcon className="size-4" />
          </div>
          <h2 className="font-semibold">Proof — real traffic</h2>
        </div>
        <div className="flex gap-2">
          {!data.connected.gsc && (
            <Link
              href="/settings?tab=integrations"
              className={buttonVariants({ size: "sm", variant: "secondary" })}
            >
              Connect Search Console
            </Link>
          )}
          {!data.connected.ga4 && (
            <Link
              href="/settings?tab=integrations"
              className={buttonVariants({ size: "sm", variant: "secondary" })}
            >
              Connect GA4
            </Link>
          )}
        </div>
      </div>

      {data.connected.gsc ? (
        <div>
          <p className="text-2xl font-semibold tabular-nums">
            {totalClicks.toLocaleString()} clicks
            {clickDelta != null && (
              <span className={`ml-2 text-base ${clickDelta >= 0 ? "text-success" : "text-danger"}`}>
                {clickDelta >= 0 ? "+" : ""}
                {clickDelta}%
              </span>
            )}
          </p>
          <p className="text-xs text-default-400">
            since {data.gsc[0]?.date} · {data.auditMarkers.length} audit marker(s)
          </p>
        </div>
      ) : (
        <p className="text-sm text-default-500">
          Connect Search Console to overlay real clicks on your score trend — this is how you prove
          the gain.
        </p>
      )}

      {data.connected.ga4 && (
        <div>
          <p className="mb-1 text-sm font-medium">AI-referral sessions</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {Object.entries(referralTotals).map(([engine, n]) => (
              <span key={engine} className="rounded-lg bg-default-100 px-2.5 py-1">
                {engine}: <span className="font-semibold tabular-nums">{n}</span>
              </span>
            ))}
            {Object.keys(referralTotals).length === 0 && (
              <span className="text-default-400">No AI referrals yet.</span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

export function ProofPanel() {
  const traffic = useVisibilityTraffic();

  return (
    <Section
      query={traffic}
      skeleton={<CardSkeleton lines={2} />}
      errorLabel="Couldn't load your traffic proof."
    >
      {(data) => <ProofContent data={data} />}
    </Section>
  );
}
