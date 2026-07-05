import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { audits } from "@/lib/db/schema/visibility";

/**
 * V8.1 — industry baseline. The hero score is never shown alone; it's paired
 * with the median score of prior audits of the same business type ("You: 68 ·
 * typical for SaaS sites: 74"), falling back to the global median under a
 * minimum sample size.
 */

export const MIN_SAMPLE = 5;

export function median(nums: number[]): number | null {
  const sorted = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export interface Baseline {
  baseline: number | null;
  sample: number;
  scope: "business_type" | "global" | "none";
}

/** Median overall score for a business type, falling back to global. */
export async function getIndustryBaseline(businessType: string | null): Promise<Baseline> {
  const db = getDb();
  // Owned audits only — competitor benchmark runs would skew the "typical for
  // {businessType}" median with sites no tenant owns.
  const all = await db
    .select({ score: audits.overallScore, type: audits.businessType })
    .from(audits)
    .where(and(eq(audits.status, "complete"), isNotNull(audits.overallScore), eq(audits.kind, "owned")));

  const scores = all.map((a) => a.score as number);
  if (businessType) {
    const typed = all.filter((a) => a.type === businessType).map((a) => a.score as number);
    if (typed.length >= MIN_SAMPLE) {
      return { baseline: median(typed), sample: typed.length, scope: "business_type" };
    }
  }
  if (scores.length >= MIN_SAMPLE) {
    return { baseline: median(scores), sample: scores.length, scope: "global" };
  }
  return { baseline: null, sample: scores.length, scope: "none" };
}
