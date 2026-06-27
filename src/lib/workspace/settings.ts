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
