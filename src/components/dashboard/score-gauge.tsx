"use client";

import { RadialChart } from "@heroui-pro/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A 270° radial gauge (HeroUI-Pro RadialChart) for a 0-100 visibility score.
 * The arc fills to `value/max` in the band colour; `children` is centred inside
 * the ring (the number + unit). A null value renders an empty track so the
 * "no reading yet" state still holds its shape.
 */

/** Band colour for a score, as a CSS custom-property the chart can fill with. */
export function scoreColor(score: number | null | undefined): string {
  if (score == null) return "var(--color-default-300, var(--color-muted))";
  if (score >= 75) return "var(--color-success)";
  if (score >= 60) return "var(--color-accent)";
  if (score >= 40) return "var(--color-warning)";
  return "var(--color-danger)";
}

export function ScoreGauge({
  value,
  max = 100,
  size = 200,
  barSize = 12,
  color,
  children,
  className,
}: {
  value: number | null | undefined;
  max?: number;
  size?: number;
  barSize?: number;
  /** Overrides the band colour derived from `value`. */
  color?: string;
  children?: ReactNode;
  className?: string;
}) {
  const fill = color ?? scoreColor(value);
  const data = [{ name: "score", value: value ?? 0, fill }];

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <RadialChart
        barSize={barSize}
        data={data}
        startAngle={225}
        endAngle={-45}
        width={size}
        height={size}
        innerRadius="70%"
        outerRadius="100%"
      >
        <RadialChart.AngleAxis angleAxisId={0} domain={[0, max]} tick={false} type="number" />
        <RadialChart.Bar background angleAxisId={0} cornerRadius={barSize} dataKey="value" />
      </RadialChart>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}
