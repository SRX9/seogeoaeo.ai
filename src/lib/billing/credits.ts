/**
 * Single source of truth for credit pricing. Each billable AI action declares a
 * credit cost here; adding a new feature is just a new entry. The UI reads these
 * values so the published cost and the enforced cost can never drift.
 */
export const CREDIT_COSTS = {
  article_generation: 100,
  research_run: 20,
  competitor_discovery: 15,
  // Visibility suite (V8.4). Users buy outcomes, not tool access. No per-fix key —
  // auto-fixes are plan-included with a monthly cap ("salaried, not a taxi meter").
  visibility_audit: 50,
  answer_run: 10,
  competitor_benchmark: 40,
  pdf_report: 25,
  tool_run_basic: 5,
  tool_run_ai: 20,
} as const;

export type BillableAction = keyof typeof CREDIT_COSTS;

/** Visibility actions that spend credits (never fixes; never proof surfaces). */
export type VisibilityAction =
  | "visibility_audit"
  | "answer_run"
  | "competitor_benchmark"
  | "pdf_report"
  | "tool_run_basic"
  | "tool_run_ai";

/**
 * One-time credits granted to a brand-new workspace so users can produce one
 * article (the "aha" moment) before paying. Lands in the never-expiring bucket.
 */
export const SIGNUP_GRANT_CREDITS = 100;

export type CreditPackId = "small" | "medium" | "large";

export type CreditPack = {
  id: CreditPackId;
  name: string;
  credits: number;
  price: number;
};

/**
 * One-time top-up packs. Purchased credits never expire and stack on top of the
 * monthly plan allowance — overage capacity for subscribers who burn through
 * their monthly grant.
 */
export const creditPacks: Record<CreditPackId, CreditPack> = {
  small: { id: "small", name: "Small", credits: 2000, price: 19 },
  medium: { id: "medium", name: "Medium", credits: 6000, price: 49 },
  large: { id: "large", name: "Large", credits: 15000, price: 99 },
};

export function getCreditPack(packId: string): CreditPack | undefined {
  return creditPacks[packId as CreditPackId];
}

export function getPackStripePriceId(packId: CreditPackId): string | undefined {
  const envMap: Record<CreditPackId, string | undefined> = {
    small: process.env.STRIPE_PRICE_PACK_SMALL,
    medium: process.env.STRIPE_PRICE_PACK_MEDIUM,
    large: process.env.STRIPE_PRICE_PACK_LARGE,
  };
  return envMap[packId];
}

