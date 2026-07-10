import type { ConnectorCapability } from "@/lib/integrations/capabilities";

export type AuthorityMode = "FULL_AUTO" | "REVIEW";
export type AuthorityDecision = "allow" | "require_approval" | "deny";

export type AuthorityRequest = {
  mode: AuthorityMode;
  capability: ConnectorCapability | "observe" | "prepare";
  availableCapabilities?: readonly ConnectorCapability[];
  riskLevel: "low" | "medium" | "high" | "critical";
  resourceRef: string;
  ownerConstraints?: string[];
};

export type AuthorityResult = {
  decision: AuthorityDecision;
  reason: string;
};

const LIVE_CAPABILITIES = new Set<ConnectorCapability>([
  "article.create",
  "article.update",
  "article.meta.update",
  "article.schema.update",
  "site.meta.update",
  "site.schema.update",
  "robots.update",
  "llms_txt.update",
]);

/** Deterministic safety boundary. Model output never changes this result. */
export function authorizeAction(request: AuthorityRequest): AuthorityResult {
  if (request.capability === "observe" || request.capability === "prepare") {
    return { decision: "allow", reason: "Observation and reversible preparation are allowed." };
  }

  if (
    LIVE_CAPABILITIES.has(request.capability) &&
    !request.availableCapabilities?.includes(request.capability)
  ) {
    return {
      decision: "deny",
      reason: `The active connector does not declare ${request.capability}.`,
    };
  }

  const target = request.resourceRef.toLowerCase();
  const blocked = request.ownerConstraints?.find((constraint) => {
    const normalized = constraint.toLowerCase();
    return (
      (normalized.includes("never") || normalized.includes("do not")) &&
      normalized
        .split(/\W+/)
        .filter((word) => word.length > 4)
        .some((word) => target.includes(word))
    );
  });
  if (blocked) {
    return { decision: "deny", reason: `Blocked by owner constraint: ${blocked}` };
  }

  if (request.riskLevel === "critical" || request.riskLevel === "high") {
    return { decision: "require_approval", reason: "High-risk live changes require an owner." };
  }

  if (request.mode === "REVIEW") {
    return { decision: "require_approval", reason: "Copilot mode requires review before acting." };
  }

  if (request.capability.startsWith("site.")) {
    return {
      decision: "require_approval",
      reason: "Broad site changes remain owner-approved even when a connector supports them.",
    };
  }

  return {
    decision: "allow",
    reason: "Autopilot allows this low-risk action on Claudia-owned content.",
  };
}
