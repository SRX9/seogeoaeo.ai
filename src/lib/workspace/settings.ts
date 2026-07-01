export type AutonomyMode = "FULL_AUTO" | "REVIEW";

/** Human-readable labels for autonomy modes — never show the raw enum in the UI. */
const AUTONOMY_LABELS: Record<AutonomyMode, string> = {
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

/** UTC calendar-day key, "YYYY-MM-DD" — the per-day bucket the daily agent uses. */
export function getUtcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function articleStatusForAutonomy(mode: string) {
  return mode === "FULL_AUTO" ? "approved" : "draft";
}

/**
 * Human-readable schedule for the automated weekly pipeline. Must stay in sync
 * with the cron in `wrangler.jsonc` (`"0 9 * * 1"` = Mondays 09:00 UTC).
 */
/**
 * Human-readable schedule for the daily content agent. Must stay in sync with the
 * cron in `wrangler.jsonc` (`"0 8 * * *"` = every day 08:00 UTC).
 */
export const DAILY_RUN_SCHEDULE_LABEL = "Every day · 08:00 UTC";

/** Next time the daily pipeline cron will fire (08:00 UTC), relative to `from`. */
export function getNextDailyRun(from = new Date()): Date {
  const next = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 8, 0, 0, 0),
  );
  if (from.getTime() >= next.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

/** Next time the weekly pipeline cron will fire, relative to `from`. */
