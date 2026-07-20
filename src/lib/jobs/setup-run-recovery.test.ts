import { describe, expect, it } from "vitest";
import {
  getSetupRunRecoveryState,
  isSetupRunFailedRecoveryDue,
  isSetupRunStale,
  MAX_SETUP_RECOVERY_ATTEMPTS,
  SETUP_FAILED_RETRY_DELAY_MS,
  SETUP_STALE_RUNNING_MS,
  shouldRearmSetupFinalization,
  shouldRecoverSetupRun,
} from "./setup-run-recovery";

const NOW = Date.parse("2026-07-20T09:00:00Z");

function candidate(overrides: Partial<{
  status: string;
  updatedAt: Date;
  recoveryAttempts: number;
  recoveryOwner: string | null;
}> = {}) {
  return {
    status: "failed",
    updatedAt: new Date(NOW - SETUP_FAILED_RETRY_DELAY_MS),
    recoveryAttempts: 0,
    recoveryOwner: null,
    ...overrides,
  };
}

describe("setup run recovery policy", () => {
  it("recovers silent running work only after the stale window", () => {
    expect(
      isSetupRunStale(
        candidate({ status: "running", updatedAt: new Date(NOW - SETUP_STALE_RUNNING_MS + 1) }),
        NOW,
      ),
    ).toBe(false);
    expect(
      shouldRecoverSetupRun(
        candidate({ status: "running", updatedAt: new Date(NOW - SETUP_STALE_RUNNING_MS) }),
        NOW,
      ),
    ).toBe(true);
  });

  it("schedules failed work after a cooling-off period", () => {
    expect(
      isSetupRunFailedRecoveryDue(
        candidate({ updatedAt: new Date(NOW - SETUP_FAILED_RETRY_DELAY_MS + 1) }),
        NOW,
      ),
    ).toBe(false);
    expect(isSetupRunFailedRecoveryDue(candidate(), NOW)).toBe(true);
    expect(getSetupRunRecoveryState(candidate())).toBe("scheduled");
  });

  it("stops retrying only after the bounded attempts have been escalated", () => {
    const exhausted = candidate({
      recoveryAttempts: MAX_SETUP_RECOVERY_ATTEMPTS,
      recoveryOwner: "operator",
    });
    expect(shouldRecoverSetupRun(exhausted, NOW)).toBe(false);
    expect(getSetupRunRecoveryState(exhausted)).toBe("needs_help");
    expect(
      getSetupRunRecoveryState(
        candidate({ status: "running", recoveryAttempts: MAX_SETUP_RECOVERY_ATTEMPTS }),
      ),
    ).toBe("retrying");
  });

  it("does not replay finalization for a stale takeover with no reopened work", () => {
    expect(shouldRearmSetupFinalization("running", 0, 0)).toBe(false);
    expect(shouldRearmSetupFinalization("running", 1, 0)).toBe(true);
    expect(shouldRearmSetupFinalization("failed", 0, 0)).toBe(true);
  });
});
