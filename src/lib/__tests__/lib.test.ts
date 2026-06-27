import { describe, expect, it } from "vitest";
import { cn } from "@/lib/cn";
import {
  getStripePriceId,
  isActiveSubscription,
  planFromStripePriceId,
  plans,
} from "@/lib/billing/plans";

describe("cn", () => {
  it("merges tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-white", false && "hidden", "font-medium")).toBe(
      "text-white font-medium",
    );
  });
});

describe("plans", () => {
  it("defines all subscription tiers", () => {
    expect(Object.keys(plans)).toEqual(["indie", "startup", "scale", "enterprise"]);
    expect(plans.startup.monthlyCredits).toBe(5000);
  });

  it("detects active subscription statuses", () => {
    expect(isActiveSubscription("active")).toBe(true);
    expect(isActiveSubscription("trialing")).toBe(true);
    expect(isActiveSubscription("inactive")).toBe(false);
  });

  it("maps stripe price ids when configured", () => {
    const previous = process.env.STRIPE_PRICE_STARTUP;
    process.env.STRIPE_PRICE_STARTUP = "price_startup_test";
    expect(getStripePriceId("startup")).toBe("price_startup_test");
    expect(planFromStripePriceId("price_startup_test")).toBe("startup");
    process.env.STRIPE_PRICE_STARTUP = previous;
  });
});
