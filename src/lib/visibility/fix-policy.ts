import {
  canLiveApply,
  canPrepareFix,
  type AutonomyLevel,
} from "@/lib/jobs/visibility-agent";

/**
 * Pure fix policy (client-safe): install-ready capability + autonomy UI levels.
 * Standing-loop DB work lives in `fix-dispatch.ts` (server-only).
 */

/** Artifact-ready findings the owner can copy/download and mark installed. */
export function isInstallReady(fixCapability: string | null | undefined): boolean {
  return canPrepareFix(fixCapability);
}

/** Whether any live-apply channel is wired (gates Level 2 UI). */
export function isLiveApplyAvailable(): boolean {
  return canLiveApply("auto") || canLiveApply("artifact");
}

/**
 * Levels the settings UI should offer. Until a host/CMS channel exists,
 * only Watch (0) and Prepare (1): Level 2 would be a no-op costume.
 */
export function selectableAutonomyLevels(): readonly AutonomyLevel[] {
  return isLiveApplyAvailable() ? [0, 1, 2] : [0, 1];
}

/** Map a stored level into what the UI should highlight today. */
export function displayAutonomyLevel(level: AutonomyLevel): AutonomyLevel {
  if (!isLiveApplyAvailable() && level >= 2) return 1;
  return level;
}
