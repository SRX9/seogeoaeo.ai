export const SETUP_STALE_RUNNING_MS = 15 * 60 * 1000;
export const SETUP_FAILED_RETRY_DELAY_MS = 5 * 60 * 1000;
export const SETUP_DEGRADED_RETRY_DELAY_MS = 5 * 60 * 1000;
export const MAX_SETUP_RECOVERY_ATTEMPTS = 3;

type SetupRunRecoveryCandidate = {
  status: string;
  updatedAt: Date;
  recoveryAttempts: number;
  recoveryOwner?: string | null;
};

export type SetupRunRecoveryState = "scheduled" | "retrying" | "needs_help" | null;

/** A running setup with no persisted progress is presumed to have lost its executor. */
export function isSetupRunStale(
  run: Pick<SetupRunRecoveryCandidate, "status" | "updatedAt">,
  now: number = Date.now(),
): boolean {
  return run.status === "running" && now - run.updatedAt.getTime() >= SETUP_STALE_RUNNING_MS;
}

/** Failed work gets a quiet cooling-off period before the next bounded attempt. */
export function isSetupRunFailedRecoveryDue(
  run: SetupRunRecoveryCandidate,
  now: number = Date.now(),
): boolean {
  if (run.status !== "failed") return false;
  const exhaustedAndEscalated =
    run.recoveryAttempts >= MAX_SETUP_RECOVERY_ATTEMPTS && run.recoveryOwner === "operator";
  return (
    !exhaustedAndEscalated &&
    now - run.updatedAt.getTime() >= SETUP_FAILED_RETRY_DELAY_MS
  );
}

/** A degraded baseline is usable, but its missing evidence is retried in the background. */
export function isSetupRunDegradedRecoveryDue(
  run: SetupRunRecoveryCandidate,
  now: number = Date.now(),
): boolean {
  if (run.status !== "completed_degraded") return false;
  const exhaustedAndEscalated =
    run.recoveryAttempts >= MAX_SETUP_RECOVERY_ATTEMPTS && run.recoveryOwner === "operator";
  return (
    !exhaustedAndEscalated &&
    now - run.updatedAt.getTime() >= SETUP_DEGRADED_RETRY_DELAY_MS
  );
}

export function shouldRecoverSetupRun(
  run: SetupRunRecoveryCandidate,
  now: number = Date.now(),
): boolean {
  return (
    isSetupRunStale(run, now) ||
    isSetupRunFailedRecoveryDue(run, now) ||
    isSetupRunDegradedRecoveryDue(run, now)
  );
}

/** Finalization is replayed only when recovery has reopened setup work. */
export function shouldRearmSetupFinalization(
  runStatus: string,
  failedStepCount: number,
  skippedStepCount: number,
): boolean {
  return (
    runStatus === "failed" ||
    runStatus === "blocked" ||
    runStatus === "completed_degraded" ||
    failedStepCount > 0 ||
    skippedStepCount > 0
  );
}

/** Owner-facing recovery state; infrastructure details stay on the server. */
export function getSetupRunRecoveryState(
  run: SetupRunRecoveryCandidate,
): SetupRunRecoveryState {
  if (run.status === "running" && run.recoveryAttempts > 0) return "retrying";
  if (run.status !== "failed" && run.status !== "completed_degraded") return null;
  if (
    run.recoveryAttempts >= MAX_SETUP_RECOVERY_ATTEMPTS &&
    run.recoveryOwner === "operator"
  ) {
    return "needs_help";
  }
  return "scheduled";
}
