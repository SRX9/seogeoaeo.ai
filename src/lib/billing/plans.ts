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

/** Visibility-suite plan caps (V8.4) — gate cadence + counts like article caps. */
export type VisibilityCaps = {
  /** Auto re-audit cadence for Claudia's monitoring (V7.3/V8.5). */
  monitoringCadence: "none" | "monthly" | "weekly";
  /** Tracked-prompt count for answer-share (V5.5). */
  trackedPrompts: number;
  /** Auto-fixes Claudia may apply per month (plan-included, not credits). */
  autoFixCap: number;
  /** Competitors benchmarked (V6.4). */
  competitors: number;
  /** Whether PDF reports are plan-included (V6.2). */
  pdfReports: boolean;
};

export type Plan = {
  id: PlanId;
  name: string;
  price: number;
  /** Credits granted each billing cycle (reset, use-it-or-lose-it). */
  monthlyCredits: number;
  /**
   * Upper bound on how many articles the daily content agent writes per day for
   * this plan. The daily cron spreads work evenly (this many per day) instead of
   * burning the whole month in one Monday run. Credits remain the real budget —
   * whichever runs out first (this cap or the credit balance) stops writing.
   */
  dailyArticleCap: number;
  visibility: VisibilityCaps;
};

const planIds: PlanId[] = ["indie", "startup", "scale", "enterprise"];

export const plans: Record<PlanId, Plan> = {
  indie: {
    id: "indie",
    name: "Indie",
    price: 29,
    monthlyCredits: 2000,
    dailyArticleCap: 1,
    visibility: { monitoringCadence: "monthly", trackedPrompts: 5, autoFixCap: 10, competitors: 1, pdfReports: false },
  },
  startup: {
    id: "startup",
    name: "Startup",
    price: 69,
    monthlyCredits: 5000,
    dailyArticleCap: 3,
    visibility: { monitoringCadence: "monthly", trackedPrompts: 10, autoFixCap: 30, competitors: 3, pdfReports: true },
  },
  scale: {
    id: "scale",
    name: "Scale",
    price: 199,
    monthlyCredits: 22000,
    dailyArticleCap: 10,
    visibility: { monitoringCadence: "weekly", trackedPrompts: 25, autoFixCap: 100, competitors: 5, pdfReports: true },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    price: 499,
    monthlyCredits: 130000,
    dailyArticleCap: 40,
    visibility: { monitoringCadence: "weekly", trackedPrompts: 100, autoFixCap: 1000, competitors: 20, pdfReports: true },
  },
};

const FREE_VISIBILITY_CAPS: VisibilityCaps = {
  monitoringCadence: "none",
  trackedPrompts: 0,
  autoFixCap: 0,
  competitors: 0,
  pdfReports: false,
};

/** Visibility caps for a plan id — unknown / "free" (unsubscribed) gets nothing. */
export function visibilityCapsForPlan(planId: string | null | undefined): VisibilityCaps {
  return getPlan(planId ?? "")?.visibility ?? FREE_VISIBILITY_CAPS;
}

export function getPlan(planId: string): Plan | undefined {
  return plans[planId as PlanId];
}

/**
 * Daily article cap for a plan id. Unknown / "free" (unsubscribed) plans get 0 —
 * the daily agent only writes for active, paid plans.
 */
export function dailyArticleCapForPlan(planId: string | null | undefined): number {
  if (!planId) return 0;
  return plans[planId as PlanId]?.dailyArticleCap ?? 0;
}

/** Approximate articles a plan's monthly credits buy — for display only. */
export function articlesPerMonth(monthlyCredits: number): number {
  return Math.floor(monthlyCredits / CREDIT_COSTS.article_generation);
}

/** One-line taglines per plan, shared by every pricing surface. */
export const planTaglines: Record<PlanId, string> = {
  indie: "Solo creators testing the engines",
  startup: "Growing teams shipping weekly",
  scale: "Brands scaling content output",
  enterprise: "Agencies & multi-brand ops",
};

const CADENCE_LABELS: Record<VisibilityCaps["monitoringCadence"], string> = {
  none: "No",
  monthly: "Monthly",
  weekly: "Weekly",
};

/**
 * The full feature list a plan buys — Claudia's content autopilot, the
 * visibility suite, and publishing — shown on every pricing surface (marketing
 * pricing, onboarding paywall, billing tab). Derived from the plan's real caps
 * so the copy can never drift from what's enforced.
 */
export function planFeatureList(planId: PlanId): string[] {
  const plan = plans[planId];
  const caps = plan.visibility;
  return [
    `Claudia writes up to ${articlesPerMonth(plan.monthlyCredits)} articles/mo (${plan.dailyArticleCap}/day)`,
    "Daily content autopilot — research, write & publish",
    `${CADENCE_LABELS[caps.monitoringCadence]} visibility audits across SEO, AEO & GEO`,
    `${caps.trackedPrompts} tracked AI prompts (ChatGPT, Perplexity, Gemini)`,
    `Up to ${caps.autoFixCap} auto-fixes/mo applied by Claudia`,
    `${caps.competitors} competitor${caps.competitors === 1 ? "" : "s"} benchmarked`,
    ...(caps.pdfReports ? ["PDF visibility reports"] : []),
    "Publish to WordPress, Ghost, dev.to, Hashnode & webhooks",
    "Google Search Console traffic proof",
  ];
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
