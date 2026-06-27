import { CREDIT_COSTS } from "@/lib/billing/credits";

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

/**
 * Placeholder plan id for workspaces that haven't purchased anything yet. It is
 * not a purchasable tier (kept out of `plans`), so a new user is on "Free"
 * rather than an inactive paid plan. Entitlement is driven by subscription
 * status, so this value is only a label until checkout sets a real plan.
 */
export const FREE_PLAN_ID = "free";

export function isActiveSubscription(status: string | null | undefined) {
  return status ? ACTIVE_SUBSCRIPTION_STATUSES.has(status) : false;
}

export type PlanId = "indie" | "startup" | "scale" | "enterprise";

export type Plan = {
  id: PlanId;
  name: string;
  price: number;
  /** Credits granted each billing cycle (reset, use-it-or-lose-it). */
  monthlyCredits: number;
};

const planIds: PlanId[] = ["indie", "startup", "scale", "enterprise"];

export const plans: Record<PlanId, Plan> = {
  indie: { id: "indie", name: "Indie", price: 29, monthlyCredits: 2000 },
  startup: { id: "startup", name: "Startup", price: 69, monthlyCredits: 5000 },
  scale: { id: "scale", name: "Scale", price: 199, monthlyCredits: 22000 },
  enterprise: { id: "enterprise", name: "Enterprise", price: 499, monthlyCredits: 130000 },
};

export function getPlan(planId: string): Plan | undefined {
  return plans[planId as PlanId];
}

/** Approximate articles a plan's monthly credits buy — for display only. */
export function articlesPerMonth(monthlyCredits: number): number {
  return Math.floor(monthlyCredits / CREDIT_COSTS.article_generation);
}

export function getStripePriceId(planId: PlanId): string | undefined {
  const envMap: Record<PlanId, string | undefined> = {
    indie: process.env.STRIPE_PRICE_INDIE,
    startup: process.env.STRIPE_PRICE_STARTUP,
    scale: process.env.STRIPE_PRICE_SCALE,
    enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
  };
  return envMap[planId];
}

export function planFromStripePriceId(priceId: string): PlanId | null {
  for (const planId of planIds) {
    if (getStripePriceId(planId) === priceId) {
      return planId;
    }
  }
  return null;
}
