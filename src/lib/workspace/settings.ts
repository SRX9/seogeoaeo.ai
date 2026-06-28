export type AutonomyMode = "FULL_AUTO" | "REVIEW";

/** Human-readable labels for autonomy modes — never show the raw enum in the UI. */
export const AUTONOMY_LABELS: Record<AutonomyMode, string> = {
  REVIEW: "Review mode",
  FULL_AUTO: "Auto-publish",
};

export function autonomyLabel(mode: string): string {
  return AUTONOMY_LABELS[mode as AutonomyMode] ?? AUTONOMY_LABELS.REVIEW;
}

export function getWeekStart(date = new Date()) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + diff);
  return utc.toISOString().slice(0, 10);
}

export function articleStatusForAutonomy(mode: string) {
  return mode === "FULL_AUTO" ? "approved" : "draft";
}

/**
 * Human-readable schedule for the automated weekly pipeline. Must stay in sync
 * with the cron in `wrangler.jsonc` (`"0 9 * * 1"` = Mondays 09:00 UTC).
 */
export const WEEKLY_RUN_SCHEDULE_LABEL = "Mondays · 09:00 UTC";

/** Next time the weekly pipeline cron will fire, relative to `from`. */
export function getNextWeeklyRun(from = new Date()): Date {
  const next = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 9, 0, 0, 0),
  );
  // Days until the upcoming Monday (getUTCDay: 0=Sun, 1=Mon).
  let add = (1 - next.getUTCDay() + 7) % 7;
  // If it's Monday but already past 09:00 UTC, jump to next Monday.
  if (add === 0 && from.getTime() >= next.getTime()) {
    add = 7;
  }
  next.setUTCDate(next.getUTCDate() + add);
  return next;
}
