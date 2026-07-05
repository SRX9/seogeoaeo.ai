"use client";

import { Card } from "@heroui/react";
import { useEffect, useState } from "react";

/**
 * V6.6 — Proof panel: GSC clicks trend with audit-date markers + per-engine AI
 * referrals. Empty state shows connect buttons with a one-line reason each.
 * Proof is free — nothing here is metered.
 */

interface TrafficData {
  connected: { gsc: boolean; ga4: boolean };
  engines: string[];
  gsc: { date: string; clicks: number; impressions: number; position: number | null }[];
  aiReferrals: { date: string; byEngine: Record<string, number> }[];
  auditMarkers: { date: string; overall: number | null }[];
}

export function ProofPanel() {
  const [data, setData] = useState<TrafficData | null>(null);

  useEffect(() => {
    fetch("/api/visibility/traffic")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setData(j.data))
      .catch(() => setData(null));
  }, []);

  if (!data) return <Card className="p-5 text-sm text-default-400">Loading proof…</Card>;

  const totalClicks = data.gsc.reduce((s, r) => s + r.clicks, 0);
  // Compare the first half of the window to the most recent half so a single
  // spiky day doesn't dominate the headline delta.
  const avgClicks = (rows: TrafficData["gsc"]) =>
    rows.length ? rows.reduce((s, r) => s + r.clicks, 0) / rows.length : 0;
  const half = Math.max(1, Math.floor(data.gsc.length / 2));
  const firstAvg = avgClicks(data.gsc.slice(0, half));
  const lastAvg = avgClicks(data.gsc.slice(-half));
  const clickDelta = firstAvg > 0 ? Math.round(((lastAvg - firstAvg) / firstAvg) * 100) : null;

  const referralTotals: Record<string, number> = {};
  for (const row of data.aiReferrals) {
    for (const [engine, n] of Object.entries(row.byEngine)) referralTotals[engine] = (referralTotals[engine] ?? 0) + n;
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Proof — real traffic</h2>
        <div className="flex gap-2">
          {!data.connected.gsc && (
            <a className="rounded-medium border border-default-200 px-3 py-1.5 text-sm" href="/settings?tab=integrations">
              Connect Search Console
            </a>
          )}
          {!data.connected.ga4 && (
            <a className="rounded-medium border border-default-200 px-3 py-1.5 text-sm" href="/settings?tab=integrations">
              Connect GA4
            </a>
          )}
        </div>
      </div>

      {data.connected.gsc ? (
        <div>
          <p className="text-2xl font-semibold">
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
          Connect Search Console to overlay real clicks on your score trend — this is how you prove the gain.
        </p>
      )}

      {data.connected.ga4 && (
        <div>
          <p className="mb-1 text-sm font-medium">AI-referral sessions</p>
          <div className="flex flex-wrap gap-3 text-sm">
            {Object.entries(referralTotals).map(([engine, n]) => (
              <span key={engine} className="rounded bg-default-100 px-2 py-1">
                {engine}: <span className="font-semibold">{n}</span>
              </span>
            ))}
            {Object.keys(referralTotals).length === 0 && <span className="text-default-400">No AI referrals yet.</span>}
          </div>
        </div>
      )}
    </Card>
  );
}
