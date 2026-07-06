"use client";

import { Button, Card } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Section } from "@/components/feedback/section";
import { TableSkeleton } from "@/components/feedback/skeletons";
import { PageHeader } from "@/components/layout/page-header";
import { apiPatch } from "@/lib/api/fetcher";
import { queryKeys, useVisibilityFindings, type VisibilityFinding } from "@/lib/api/queries";
import { PILLAR_LABELS } from "@/lib/visibility/display";

/** V8.2 — the fix queue: one severity-ranked list of every open finding. */

const SEVERITIES = ["critical", "high", "medium", "low"] as const;
const SEVERITY_DOT: Record<(typeof SEVERITIES)[number], string> = {
  critical: "bg-danger",
  high: "bg-warning",
  medium: "bg-accent",
  low: "bg-default-300",
};
const ACTION_LABEL: Record<string, string> = {
  auto: "Fix it for me",
  artifact: "Get the fix",
  guided: "Show me how",
};

function FindingsList({ findings }: { findings: VisibilityFinding[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const dismiss = useMutation({
    mutationFn: (findingId: string) =>
      apiPatch("/api/visibility/findings", { findingId, action: "dismiss" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.visibilityFindings }),
  });

  if (findings.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-default-500">
        Nothing in the queue. Run an audit from <span className="font-medium">Visibility</span> to
        populate it.
      </Card>
    );
  }

  return (
    <>
      {SEVERITIES.map((sev) => {
        const group = findings.filter((f) => f.severity === sev);
        if (group.length === 0) return null;
        return (
          <div key={sev} className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold capitalize text-default-600">
              <span className={`size-2 rounded-full ${SEVERITY_DOT[sev]}`} aria-hidden />
              {sev}
              <span className="font-normal text-default-400">· {group.length}</span>
            </h2>
            {group.map((f) => (
              <Card key={f.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-default-400">{PILLAR_LABELS[f.pillar]}</p>
                    <p className="font-medium">{f.title}</p>
                    <p className="mt-1 text-sm text-default-500">{f.recommendation}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      onPress={() => setOpen(open === f.id ? null : f.id)}
                    >
                      {ACTION_LABEL[f.fixCapability ?? "guided"]}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      isDisabled={dismiss.isPending && dismiss.variables === f.id}
                      onPress={() => dismiss.mutate(f.id)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
                {open === f.id && f.fixPayload != null && (
                  <pre className="mt-3 overflow-x-auto rounded-lg bg-default-100 p-3 text-xs">
                    {JSON.stringify(f.fixPayload, null, 2)}
                  </pre>
                )}
              </Card>
            ))}
          </div>
        );
      })}
    </>
  );
}

export default function FixQueuePage() {
  const findings = useVisibilityFindings();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Fix queue"
        description="Everything worth fixing, ranked by impact. One action per row."
      />
      <Section
        query={findings}
        skeleton={<TableSkeleton rows={6} />}
        errorLabel="Couldn't load your fix queue."
      >
        {(data) => <FindingsList findings={data.findings} />}
      </Section>
    </div>
  );
}
