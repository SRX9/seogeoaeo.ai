export const INTERNAL_LINK_EVALUATOR_VERSION = "internal-link-targets.v1";
export const METADATA_EVALUATOR_VERSION = "content-metadata.v1";

export type InternalLinkRecommendation = {
  target: string;
  anchorText?: string;
};

export type KnownInternalTarget = {
  target: string;
  canonicalTarget?: string | null;
  available?: boolean;
};

export type InternalLinkEvaluation = {
  passed: boolean;
  evaluatorVersion: typeof INTERNAL_LINK_EVALUATOR_VERSION;
  validTargets: string[];
  invalidTargets: Array<{
    target: string;
    reason: "invalid" | "external" | "unknown" | "unavailable";
  }>;
  blockingReasons: string[];
};

function normalizedInternalUrl(target: string, siteOrigin: URL): URL | null {
  try {
    const url = new URL(target, siteOrigin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
    return url;
  } catch {
    return null;
  }
}

/** Validate every recommended target against the brand's known, live URL set. */
export function validateInternalLinkTargets(input: {
  siteOrigin: string;
  recommendations: readonly InternalLinkRecommendation[];
  knownTargets: readonly KnownInternalTarget[];
}): InternalLinkEvaluation {
  let siteOrigin: URL;
  try {
    siteOrigin = new URL(input.siteOrigin);
  } catch {
    return {
      passed: false,
      evaluatorVersion: INTERNAL_LINK_EVALUATOR_VERSION,
      validTargets: [],
      invalidTargets: input.recommendations.map(({ target }) => ({ target, reason: "invalid" })),
      blockingReasons: ["The brand site origin is invalid."],
    };
  }

  const known = new Map<string, boolean>();
  for (const item of input.knownTargets) {
    for (const candidate of [item.target, item.canonicalTarget]) {
      if (!candidate) continue;
      const url = normalizedInternalUrl(candidate, siteOrigin);
      if (url && url.origin === siteOrigin.origin) {
        known.set(url.href, item.available !== false);
      }
    }
  }

  const validTargets: string[] = [];
  const invalidTargets: InternalLinkEvaluation["invalidTargets"] = [];
  for (const recommendation of input.recommendations) {
    const url = normalizedInternalUrl(recommendation.target, siteOrigin);
    if (!url) {
      invalidTargets.push({ target: recommendation.target, reason: "invalid" });
    } else if (url.origin !== siteOrigin.origin) {
      invalidTargets.push({ target: recommendation.target, reason: "external" });
    } else if (!known.has(url.href)) {
      invalidTargets.push({ target: recommendation.target, reason: "unknown" });
    } else if (known.get(url.href) !== true) {
      invalidTargets.push({ target: recommendation.target, reason: "unavailable" });
    } else {
      validTargets.push(recommendation.target);
    }
  }

  return {
    passed: invalidTargets.length === 0,
    evaluatorVersion: INTERNAL_LINK_EVALUATOR_VERSION,
    validTargets,
    invalidTargets,
    blockingReasons: invalidTargets.map(
      ({ target, reason }) => `Internal-link target "${target}" is ${reason}.`,
    ),
  };
}

export type ContentMetadata = {
  title: string;
  description: string;
  socialTitle?: string | null;
  socialDescription?: string | null;
};

export type MetadataClaimFinding = {
  field: keyof ContentMetadata;
  kind: "superlative" | "statistic";
  claim: string;
  supported: boolean;
};

export type MetadataEvaluation = {
  passed: boolean;
  evaluatorVersion: typeof METADATA_EVALUATOR_VERSION;
  findings: MetadataClaimFinding[];
  blockingReasons: string[];
};

const SUPERLATIVE_PATTERN =
  /\b(?:best|leading|fastest|easiest|cheapest|most (?:trusted|popular|accurate|effective)|number one|only|ultimate)\b|#1/gi;
const STATISTIC_PATTERN =
  /(?:[$€£]\s?\d[\d,.]*|\b\d+(?:\.\d+)?\s?(?:%|x|times|million|billion|users?|customers?|companies?|hours?|days?)(?=\s|[.,;:!?]|$)|\bone in \d+\b)/gi;

function normalizedClaim(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9%$€£]+/g, " ").trim().replace(/\s+/g, " ");
}

function claimIsSupported(claim: string, fieldValue: string, supportedClaims: readonly string[]) {
  const normalizedNeedle = normalizedClaim(claim);
  const contextTokens = new Set(
    normalizedClaim(fieldValue)
      .split(" ")
      .filter((token) => token.length > 2),
  );
  return supportedClaims.some((support) => {
    const normalizedSupport = normalizedClaim(support);
    if (!normalizedSupport.includes(normalizedNeedle)) return false;
    const supportTokens = normalizedSupport.split(" ").filter((token) => token.length > 2);
    return supportTokens.some((token) => contextTokens.has(token) && token !== normalizedNeedle);
  });
}

/** Block metadata that adds claims not explicitly supported by verified facts. */
export function validateContentMetadata(input: {
  metadata: ContentMetadata;
  supportedClaims?: readonly string[];
}): MetadataEvaluation {
  const supportedClaims = input.supportedClaims ?? [];
  const fields = Object.entries(input.metadata) as Array<
    [keyof ContentMetadata, string | null | undefined]
  >;
  const findings: MetadataClaimFinding[] = [];
  const blockingReasons: string[] = [];

  if (!input.metadata.title.trim()) blockingReasons.push("Metadata title is missing.");
  if (!input.metadata.description.trim()) blockingReasons.push("Metadata description is missing.");

  for (const [field, value] of fields) {
    if (!value) continue;
    for (const [kind, pattern] of [
      ["superlative", SUPERLATIVE_PATTERN],
      ["statistic", STATISTIC_PATTERN],
    ] as const) {
      pattern.lastIndex = 0;
      for (const match of value.matchAll(pattern)) {
        const claim = match[0];
        const supported = claimIsSupported(claim, value, supportedClaims);
        findings.push({ field, kind, claim, supported });
        if (!supported) {
          blockingReasons.push(`Metadata ${field} contains unsupported ${kind} "${claim}".`);
        }
      }
    }
  }

  return {
    passed: blockingReasons.length === 0,
    evaluatorVersion: METADATA_EVALUATOR_VERSION,
    findings,
    blockingReasons,
  };
}
