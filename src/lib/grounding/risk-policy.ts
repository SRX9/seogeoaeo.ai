export const CONTENT_RISK_EVALUATOR_VERSION = "content-risk.v1";

export const CONTENT_RISK_CATEGORIES = [
  "medical_health",
  "legal",
  "financial",
  "safety",
  "regulated_products",
  "employment_discrimination",
  "minors",
  "reputational_allegations",
  "comparative_claims",
] as const;

export type ContentRiskCategory = (typeof CONTENT_RISK_CATEGORIES)[number];
export type ContentRiskLevel = "low" | "medium" | "high";
export type ContentSourceTier =
  | "tier_1_primary"
  | "tier_2_authoritative"
  | "tier_3_general";

export type ContentRiskInput = {
  title: string;
  body: string;
  metadata?: readonly string[];
  strongestSourceTier?: ContentSourceTier | null;
  humanReviewApproved?: boolean;
  adviceSupported?: boolean;
  disclaimerRequired?: boolean;
  disclaimerPresent?: boolean;
};

export type ContentRiskEvaluation = {
  passed: boolean;
  evaluatorVersion: typeof CONTENT_RISK_EVALUATOR_VERSION;
  categories: ContentRiskCategory[];
  riskLevel: ContentRiskLevel;
  humanReviewRequired: boolean;
  minimumSourceTier: ContentSourceTier | null;
  unsupportedAdviceDetected: boolean;
  blockingReasons: string[];
};

const CATEGORY_PATTERNS: Record<ContentRiskCategory, readonly RegExp[]> = {
  medical_health: [
    /\b(?:medical|medicine|health(?:care)?|diagnos(?:is|e|ed|ing)|symptoms?|treatments?|therap(?:y|ies)|diseases?|dosage|patients?|cancer|diabetes|mental health|depression|anxiety)\b/i,
    /\b(?:acetaminophen|antibiotics?|aspirin|ibuprofen|insulin|medications?|medicines?|paracetamol|pills?|prescription|dose|doses)\b/i,
  ],
  legal: [
    /\b(?:legal advice|attorneys?|lawyers?|litigation|liability|statutory|lawsuits?|contracts? law|legal rights?|regulatory compliance)\b/i,
  ],
  financial: [
    /\b(?:bankruptcy|financial advice|invest(?:ing|ment|ments)|stocks?|securities|cryptocurrency|crypto|memecoins?|mortgages?|loans?|credit score|tax(?:es|ation)?|retirement|insurance|portfolio)\b/i,
  ],
  safety: [
    /\b(?:safety|hazards?|dangerous|emergency|fire safety|electrical safety|chemical exposure|protective equipment|poisoning|injury prevention)\b/i,
  ],
  regulated_products: [
    /\b(?:alcohol|tobacco|nicotine|vaping|cannabis|marijuana|gambling|betting|firearms?|guns?|prescription drugs?|controlled substances?)\b/i,
  ],
  employment_discrimination: [
    /\b(?:employment law|employees?|hiring|firing|layoffs?|wages?|workplace harassment|workplace discrimination|protected class|equal opportunity)\b/i,
  ],
  minors: [
    /\b(?:minors?|underage|children|child safety|teenagers?|parental consent|school students?)\b/i,
  ],
  reputational_allegations: [
    /\b(?:accused of|alleged(?:ly)?|under investigation|committed fraud|is (?:a )?scam|lawsuit against|criminal misconduct|corrupt(?:ion)?|deceptive practices)\b/i,
  ],
  comparative_claims: [
    /\b(?:vs\.?|versus|compared (?:with|to)|better than|worse than|faster than|cheaper than|outperforms?|competitors?|alternative to|best (?:choice|option|platform|product|service))\b/i,
  ],
};

const HIGH_RISK_CATEGORIES = new Set<ContentRiskCategory>([
  "medical_health",
  "legal",
  "financial",
  "safety",
  "regulated_products",
  "employment_discrimination",
  "minors",
  "reputational_allegations",
]);

const SOURCE_TIER_RANK: Record<ContentSourceTier, number> = {
  tier_1_primary: 1,
  tier_2_authoritative: 2,
  tier_3_general: 3,
};

const ADVICE_PATTERN =
  /(?:\b(?:you should|you must|we recommend|take|start taking|stop taking|declare bankruptcy|double (?:a |the |your )?(?:dose|dosage|insulin|medication)|buy|sell|invest in|file (?:a )?(?:claim|lawsuit)|fire (?:the|an?) employee)\b|(?:^|[\n.!?]\s*)double\s+(?:a |the |your )?[\p{L}][\p{L}\p{N}-]*\b)/iu;
const HIGH_IMPACT_ADVICE_PATTERN =
  /(?:\b(?:take|start taking|stop taking|declare bankruptcy|double (?:a |the |your )?(?:dose|dosage|insulin|medication)|buy|sell|invest in|file (?:a )?(?:claim|lawsuit)|fire (?:the|an?) employee)\b|(?:^|[\n.!?]\s*)double\s+(?:a |the |your )?[\p{L}][\p{L}\p{N}-]*\b)/iu;

function sourceTierMeets(
  actual: ContentSourceTier | null | undefined,
  required: ContentSourceTier | null,
): boolean {
  if (!required) return true;
  return actual != null && SOURCE_TIER_RANK[actual] <= SOURCE_TIER_RANK[required];
}

/**
 * Deterministic content-risk policy. High-risk content cannot pass until a
 * human has approved it and tier-one source support has been recorded.
 */
export function evaluateContentRisk(input: ContentRiskInput): ContentRiskEvaluation {
  const text = [input.title, input.body, ...(input.metadata ?? [])].join("\n");
  const categories = CONTENT_RISK_CATEGORIES.filter((category) =>
    CATEGORY_PATTERNS[category].some((pattern) => pattern.test(text)),
  );
  // Unknown high-impact imperatives route to review even when the vocabulary
  // classifier cannot confidently name a regulated category.
  const highRisk =
    categories.some((category) => HIGH_RISK_CATEGORIES.has(category)) ||
    HIGH_IMPACT_ADVICE_PATTERN.test(text);
  const riskLevel: ContentRiskLevel = highRisk
    ? "high"
    : categories.includes("comparative_claims")
      ? "medium"
      : "low";
  const humanReviewRequired = riskLevel === "high";
  const minimumSourceTier: ContentSourceTier | null =
    riskLevel === "high"
      ? "tier_1_primary"
      : riskLevel === "medium"
        ? "tier_2_authoritative"
        : null;
  const unsupportedAdviceDetected =
    riskLevel === "high" && ADVICE_PATTERN.test(text) && input.adviceSupported !== true;
  const blockingReasons: string[] = [];

  if (humanReviewRequired && input.humanReviewApproved !== true) {
    blockingReasons.push("High-risk content requires recorded human approval.");
  }
  if (!sourceTierMeets(input.strongestSourceTier, minimumSourceTier)) {
    blockingReasons.push(`Content requires ${minimumSourceTier?.replaceAll("_", " ")} sources.`);
  }
  if (unsupportedAdviceDetected) {
    blockingReasons.push("High-risk advice is not supported by the claim ledger.");
  }
  if (input.disclaimerRequired === true && input.disclaimerPresent !== true) {
    blockingReasons.push("The required content disclaimer is missing.");
  }

  return {
    passed: blockingReasons.length === 0,
    evaluatorVersion: CONTENT_RISK_EVALUATOR_VERSION,
    categories,
    riskLevel,
    humanReviewRequired,
    minimumSourceTier,
    unsupportedAdviceDetected,
    blockingReasons,
  };
}
