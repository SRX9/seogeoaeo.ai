"use client";

import { Button, Card } from "@heroui/react";
import { use, useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";

/** V6.1 — in-app report view: score dashboard + findings + Markdown/PDF export. */

interface ReportModel {
  site: string;
  overall: number | null;
  band: string;
  aiVisibility: number | null;
  subScores: { key: string; label: string; score: number | null }[];
  platforms: { platform: string; score: number | null }[];
  quickWins: { title: string; recommendation: string }[];
  themes: { week: number; title: string; findings: { title: string; recommendation: string }[] }[];
  impact: string;
}

const fmt = (n: number | null) => (n == null ? "—" : `${Math.round(n)}`);

export default function ReportPage({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = use(params);
  const [model, setModel] = useState<ReportModel | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/visibility/${auditId}/report`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load report");
      const { data } = await res.json();
      setModel(data.model);
      setMarkdown(data.markdown);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
    }
  }, [auditId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Visibility report"
        description={model?.site ?? "Loading…"}
        meta={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onPress={() => navigator.clipboard.writeText(markdown)}>
              Copy Markdown
            </Button>
            <a
              className="inline-flex items-center rounded-medium bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              href={`/api/visibility/${auditId}/pdf`}
              target="_blank"
              rel="noreferrer"
            >
              Download
            </a>
          </div>
        }
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      {model && (
        <>
          <Card className="p-5">
            <p className="text-sm text-default-500">Overall visibility</p>
            <p className="text-3xl font-semibold">
              {fmt(model.overall)}
              <span className="ml-2 text-base font-normal text-default-400">/100 · {model.band}</span>
            </p>
            <p className="mt-2 text-sm text-default-600">{model.impact}</p>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {model.subScores.map((s) => (
              <Card key={s.key} className="p-4">
                <p className="text-xs text-default-500">{s.label}</p>
                <p className="text-xl font-semibold">{fmt(s.score)}</p>
              </Card>
            ))}
          </div>

          <Card className="p-5">
            <h2 className="mb-2 font-semibold">Quick wins</h2>
            <ul className="space-y-2 text-sm">
              {model.quickWins.map((f, i) => (
                <li key={i}>
                  <span className="font-medium">{f.title}</span> — {f.recommendation}
                </li>
              ))}
              {model.quickWins.length === 0 && <li className="text-default-400">None outstanding.</li>}
            </ul>
          </Card>

          {model.themes.map((t) => (
            <Card key={t.week} className="p-5">
              <h2 className="mb-2 font-semibold">
                Week {t.week}: {t.title}
              </h2>
              <ul className="space-y-2 text-sm">
                {t.findings.map((f, i) => (
                  <li key={i}>
                    <span className="font-medium">{f.title}</span> — {f.recommendation}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
