export const CONNECTOR_MUTATION_STATUSES = [
  "no_op",
  "prepared",
  "writing",
  "applied",
  "verified",
  "verification_failed",
  "rollback_pending",
  "reverted",
  "rollback_failed",
  "manual_recovery_required",
  "blocked",
  "cancelled",
] as const;

export type ConnectorMutationStatus =
  (typeof CONNECTOR_MUTATION_STATUSES)[number];

export const DEFAULT_CONNECTOR_LIMITS = {
  maxBrandWritesPerUtcDay: 3,
  maxWorkspaceWritesPerUtcMonth: 30,
  maxResourcesPerAction: 1,
  relatedResourceCooldownMs: 15 * 60 * 1_000,
  errorWindowSize: 20,
  minimumErrorSamples: 5,
  stopErrorRate: 0.2,
} as const;

const TERMINAL_STATUSES: ReadonlySet<ConnectorMutationStatus> = new Set([
  "no_op",
  "reverted",
  "manual_recovery_required",
  "blocked",
  "cancelled",
]);

const TRANSITIONS: Record<ConnectorMutationStatus, readonly ConnectorMutationStatus[]> = {
  no_op: [],
  prepared: ["writing", "rollback_pending", "blocked", "cancelled"],
  writing: [
    "no_op",
    "prepared",
    "applied",
    "verification_failed",
    "rollback_pending",
    "manual_recovery_required",
  ],
  applied: ["verified", "verification_failed", "rollback_pending"],
  verified: ["rollback_pending"],
  verification_failed: ["rollback_pending", "manual_recovery_required"],
  rollback_pending: ["reverted", "rollback_failed", "manual_recovery_required"],
  reverted: [],
  rollback_failed: ["rollback_pending", "manual_recovery_required"],
  manual_recovery_required: [],
  blocked: [],
  cancelled: [],
};

export function isConnectorMutationTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status as ConnectorMutationStatus);
}

export function canTransitionConnectorMutation(
  from: ConnectorMutationStatus,
  to: ConnectorMutationStatus,
): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function assertConnectorMutationTransition(
  from: ConnectorMutationStatus,
  to: ConnectorMutationStatus,
): void {
  if (!canTransitionConnectorMutation(from, to)) {
    throw new Error(`Invalid connector mutation transition: ${from} -> ${to}`);
  }
}

export function connectorMutationConsumesWriteBudget(status: string): boolean {
  return !["no_op", "blocked", "cancelled"].includes(status);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Connector state must contain finite numbers");
  }
  return value;
}

export function canonicalConnectorJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export async function fingerprintConnectorState(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalConnectorJson(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function connectorErrorRateShouldStop(
  outcomes: readonly { status: string; verificationStatus?: string | null }[],
): boolean {
  const sample = outcomes.slice(0, DEFAULT_CONNECTOR_LIMITS.errorWindowSize);
  if (sample.length < DEFAULT_CONNECTOR_LIMITS.minimumErrorSamples) return false;
  const failures = sample.filter(
    (item) =>
      item.verificationStatus === "failed" ||
      [
        "verification_failed",
        "rollback_failed",
        "manual_recovery_required",
      ].includes(item.status),
  ).length;
  return failures / sample.length >= DEFAULT_CONNECTOR_LIMITS.stopErrorRate;
}
