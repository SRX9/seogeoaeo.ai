import type { ConnectorCapability } from "@/lib/integrations/capabilities";
import { simulateOwnerPolicies, type ActiveOwnerPolicy } from "@/lib/agent/policies";

export type AuthorityMode = "FULL_AUTO" | "REVIEW";
export type AuthorityDecision = "allow" | "require_approval" | "deny";

export type AuthorityRequest = {
  mode: AuthorityMode;
  capability: ConnectorCapability | "observe" | "prepare";
  availableCapabilities?: readonly ConnectorCapability[];
  riskLevel: "low" | "medium" | "high" | "critical";
  resourceRef: string;
  ownerConstraints?: string[];
  grantedCapabilities?: readonly ConnectorCapability[];
  canonicalPolicies?: readonly ActiveOwnerPolicy[];
  destination?: string | null;
  categories?: readonly string[];
  approvalValidated?: boolean;
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

const CONSTRAINT_STOP_WORDS = new Set([
  "never",
  "dont",
  "must",
  "avoid",
  "publish",
  "publishing",
  "create",
  "update",
  "change",
  "automatically",
  "meta",
  "metadata",
  "schema",
  "robots",
  "llms",
  "txt",
  "article",
  "articles",
  "page",
  "pages",
  "anything",
  "everything",
]);

export function isActionBlockedByOwnerConstraint(
  instruction: string,
  capability: ConnectorCapability,
  resourceRef: string,
): boolean {
  const normalized = instruction.toLowerCase();
  if (!/\b(?:never|avoid|must\s+not|do\s+not|don't|dont)\b/.test(normalized)) {
    return false;
  }

  const mentionsPublish = /\bpublish(?:ing)?\b/.test(normalized);
  const mentionsMetadata = /\bmeta(?:data)?\b/.test(normalized);
  const mentionsSchema = /\bschema\b/.test(normalized);
  const mentionsRobots = /\brobots(?:\.txt)?\b/.test(normalized);
  const mentionsLlms = /\bllms(?:\.txt|\s+txt)?\b/.test(normalized);
  const mentionsUpdate = /\bupdate\b/.test(normalized);
  const hasActionScope =
    mentionsPublish ||
    mentionsMetadata ||
    mentionsSchema ||
    mentionsRobots ||
    mentionsLlms ||
    mentionsUpdate;

  const appliesToCapability =
    !hasActionScope ||
    (mentionsPublish && capability.startsWith("article.")) ||
    (mentionsMetadata && capability.includes("meta.update")) ||
    (mentionsSchema && capability.includes("schema.update")) ||
    (mentionsRobots && capability === "robots.update") ||
    (mentionsLlms && capability === "llms_txt.update") ||
    (mentionsUpdate && capability.endsWith(".update"));
  if (!appliesToCapability) return false;

  const resourceTerms = normalized
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(
      (word) =>
        word.length >= 3 &&
        !CONSTRAINT_STOP_WORDS.has(word) &&
        word !== "not" &&
        word !== "the" &&
        word !== "for" &&
        word !== "with",
    );
  if (resourceTerms.length === 0) return true;

  const target = resourceRef.toLowerCase();
  const compactTarget = target.replace(/[^a-z0-9]+/g, "");
  return resourceTerms.some(
    (term) => target.includes(term) || compactTarget.includes(term.replace(/[^a-z0-9]+/g, "")),
  );
}

/** Owner prohibitions that apply to drafting, without treating publish-only rules as write bans. */
export function isArticleGenerationBlockedByOwnerConstraint(
  instruction: string,
  topic: string,
): boolean {
  const normalized = instruction.toLowerCase();
  if (!/\b(?:never|avoid|must\s+not|do\s+not|don't|dont)\b/.test(normalized)) {
    return false;
  }

  const mentionsWriting = /\b(?:write|writing|draft|drafting|create|creating)\b/.test(
    normalized,
  );
  const mentionsPublishing = /\bpublish(?:ing)?\b/.test(normalized);
  if (mentionsPublishing && !mentionsWriting) return false;

  const resourceTerms = normalized
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(
      (word) =>
        word.length >= 3 &&
        !CONSTRAINT_STOP_WORDS.has(word) &&
        ![
          "not",
          "the",
          "for",
          "with",
          "about",
          "content",
          "blog",
          "post",
          "posts",
          "write",
          "writing",
          "draft",
          "drafting",
        ].includes(word),
    );
  if (resourceTerms.length === 0) return mentionsWriting;

  const target = topic.toLowerCase();
  const compactTarget = target.replace(/[^a-z0-9]+/g, "");
  return resourceTerms.some(
    (term) => target.includes(term) || compactTarget.includes(term.replace(/[^a-z0-9]+/g, "")),
  );
}

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

  const canonical = simulateOwnerPolicies(request.canonicalPolicies ?? [], {
    capability: request.capability,
    resourceRef: request.resourceRef,
    destination: request.destination,
    categories: request.categories,
    approvalValidated: request.approvalValidated,
  });
  if (canonical.decision === "deny") {
    return { decision: "deny", reason: canonical.reason };
  }

  const blocked = request.ownerConstraints?.find((constraint) => {
    return isActionBlockedByOwnerConstraint(
      constraint,
      request.capability as ConnectorCapability,
      request.resourceRef,
    );
  });
  if (blocked) {
    return { decision: "deny", reason: `Blocked by owner constraint: ${blocked}` };
  }

  if (request.riskLevel === "critical" || request.riskLevel === "high") {
    return { decision: "require_approval", reason: "High-risk live changes require an owner." };
  }

  if (request.capability.startsWith("site.")) {
    return {
      decision: "require_approval",
      reason: "Broad site changes remain owner-approved even when a connector supports them.",
    };
  }

  if (request.mode === "REVIEW") {
    if (canonical.decision === "allow") {
      return { decision: "allow", reason: canonical.reason };
    }
    if (request.grantedCapabilities?.includes(request.capability)) {
      return {
        decision: "allow",
        reason: `The owner explicitly granted ${request.capability}.`,
      };
    }
    return { decision: "require_approval", reason: "Copilot mode requires review before acting." };
  }

  return {
    decision: "allow",
    reason: "Autopilot allows this low-risk action on Claudia-owned content.",
  };
}
