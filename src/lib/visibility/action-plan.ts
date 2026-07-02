import type { Finding, Severity } from "./types";

/**
 * V2.3 — turn a flat findings list into a 30-day action plan: mechanically
 * fixable "quick wins" first, then the rest grouped into up to 4 weekly themes.
 * (`inspiration-code/geo/SKILL.md` → Phase 3 Synthesis / action-plan shape.)
 */

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export interface ActionTheme {
  week: number;
  title: string;
  findings: Finding[];
}

export interface ActionPlan {
  quickWins: Finding[];
  themes: ActionTheme[];
}

function humanize(category: string): string {
  return category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildActionPlan(findings: Finding[]): ActionPlan {
  const sorted = [...findings].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );

  // Quick wins: one-click ("auto") or generated-artifact fixes, highest impact first.
  const quickWins = sorted
    .filter((f) => f.fix_capability === "auto" || f.fix_capability === "artifact")
    .slice(0, 10);
  const quickSet = new Set(quickWins);

  // Remaining findings → weekly themes grouped by category, best severity first.
  const groups = new Map<string, Finding[]>();
  for (const f of sorted) {
    if (quickSet.has(f)) continue;
    (groups.get(f.category) ?? groups.set(f.category, []).get(f.category)!).push(f);
  }
  const ordered = [...groups.entries()].sort(
    (a, b) => SEVERITY_RANK[a[1][0].severity] - SEVERITY_RANK[b[1][0].severity],
  );

  const themes: ActionTheme[] = ordered
    .slice(0, 4)
    .map(([category, list], i) => ({ week: i + 1, title: humanize(category), findings: [...list] }));
  if (ordered.length > 4 && themes[3]) {
    themes[3].title = "Additional fixes";
    for (const [, list] of ordered.slice(4)) themes[3].findings.push(...list);
  }

  return { quickWins, themes };
}
