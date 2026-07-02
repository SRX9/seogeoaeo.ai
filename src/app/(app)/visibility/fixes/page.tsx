"use client";

import { Button, Card } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";

/** V8.2 — the fix queue: one severity-ranked list of every open finding. */

interface Finding {
  id: string;
  pillar: "seo" | "aeo" | "geo";
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  recommendation: string;
  fixCapability: "auto" | "artifact" | "guided" | null;
  fixPayload: unknown;
}

const SEVERITIES = ["critical", "high", "medium", "low"] as const;
const PILLAR_BADGE: Record<string, string> = { seo: "🔵", aeo: "🟣", geo: "🟢" };
const ACTION_LABEL: Record<string, string> = { auto: "Fix it for me", artifact: "Get the fix", guided: "Show me how" };

export default function FixQueuePage() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/visibility/findings");
    if (res.ok) setFindings((await res.json()).data.findings);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (f: Finding) => {
    if (f.fixCapability === "auto" || f.fixCapability === "artifact") {
      setOpen(open === f.id ? null : f.id);
      return;
    }
    setOpen(open === f.id ? null : f.id);
  };

  const dismiss = async (id: string) => {
    await fetch("/api/visibility/findings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ findingId: id, action: "dismiss" }),
    });
    void load();
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader title="Fix queue" description="Everything worth fixing, ranked by impact. One action per row." />

      {findings.length === 0 && (
        <Card className="p-8 text-center text-sm text-default-500">
          Nothing in the queue. Run an audit from <span className="font-medium">Visibility</span> to populate it.
        </Card>
      )}

      {SEVERITIES.map((sev) => {
        const group = findings.filter((f) => f.severity === sev);
        if (group.length === 0) return null;
        return (
          <div key={sev} className="space-y-2">
            <h2 className="text-sm font-semibold capitalize text-default-600">{sev}</h2>
            {group.map((f) => (
              <Card key={f.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      <span className="mr-1">{PILLAR_BADGE[f.pillar]}</span>
                      {f.title}
                    </p>
                    <p className="mt-1 text-sm text-default-500">{f.recommendation}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="primary" onPress={() => act(f)}>
                      {ACTION_LABEL[f.fixCapability ?? "guided"]}
                    </Button>
                    <Button size="sm" variant="outline" onPress={() => dismiss(f.id)}>
                      Dismiss
                    </Button>
                  </div>
                </div>
                {open === f.id && f.fixPayload != null && (
                  <pre className="mt-3 overflow-x-auto rounded bg-default-100 p-3 text-xs">
                    {JSON.stringify(f.fixPayload, null, 2)}
                  </pre>
                )}
              </Card>
            ))}
          </div>
        );
      })}
    </div>
  );
}
