/**
 * Single source of truth for credit pricing. Each billable AI action declares a
 * credit cost here; adding a new feature is just a new entry. The UI reads these
 * values so the published cost and the enforced cost can never drift.
 */
export const CREDIT_COSTS = {
  article_generation: 100,
  research_run: 20,
  competitor_discovery: 15,
} as const;

export type BillableAction = keyof typeof CREDIT_COSTS;

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

const packIds: CreditPackId[] = ["small", "medium", "large"];

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

export function packFromStripePriceId(priceId: string): CreditPackId | null {
  for (const packId of packIds) {
    if (getPackStripePriceId(packId) === priceId) {
      return packId;
    }
  }
  return null;
}
