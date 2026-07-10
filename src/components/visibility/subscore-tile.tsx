import { Card } from "@heroui/react";
import type { ComponentType, SVGProps } from "react";
import {
  BoltIcon,
  CircleCheckIcon,
  GlobeIcon,
  LayersIcon,
  QuoteIcon,
  SparklesIcon,
} from "@/components/icons";
import { scoreColor } from "@/components/dashboard/score-gauge";

/**
 * One sub-score stat tile: icon, owner-language label, and the 0–100 value in
 * its band colour. Shared by the visibility overview and the report page so
 * the six pillars always look the same.
 */

export const SUBSCORE_ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  citability: QuoteIcon,
  brand: GlobeIcon,
  eeat: CircleCheckIcon,
  technical: BoltIcon,
  schema: LayersIcon,
  platform: SparklesIcon,
};

const fmt = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n)}`);

export function SubScoreTile({
  subScoreKey,
  label,
  score,
  explainer,
}: {
  subScoreKey: string;
  label: string;
  score: number | null | undefined;
  explainer?: string;
}) {
  const IconComponent = SUBSCORE_ICONS[subScoreKey] ?? SparklesIcon;
  return (
    <Card className="material-panel p-4" title={explainer}>
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-muted">
          <IconComponent className="size-4.5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs tracking-[0.01em] text-muted">{label}</p>
          <p
            className="text-xl font-semibold leading-tight tracking-tight tabular-nums"
            style={{ color: scoreColor(score) }}
          >
            {fmt(score)}
            <span className="ml-1 text-xs font-normal text-default-400">/100</span>
          </p>
        </div>
      </div>
    </Card>
  );
}
