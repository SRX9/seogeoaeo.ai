"use client";

import { Card } from "@heroui/react";
import { useState } from "react";
import posthog from "posthog-js";
import { LoadingButton } from "@/components/ui/loading-button";
import { CheckIcon } from "@/components/icons";
import { apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { useBfcacheReset } from "@/lib/hooks/use-bfcache-reset";
import { cn } from "@/lib/cn";
import { planFeatureList, plans, planTaglines, type PlanId } from "@/lib/billing/plans";
import { creditPacks, type CreditPackId } from "@/lib/billing/credits";

type BillingActionsProps = {
  currentPlanId?: string | null;
  hasCustomer: boolean;
};

const POPULAR_PLAN: PlanId = "startup";

export function BillingActions({ currentPlanId, hasCustomer }: BillingActionsProps) {
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [loadingPack, setLoadingPack] = useState<CreditPackId | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPlan = Boolean(currentPlanId);
  const busy = loadingPlan !== null || loadingPack !== null || portalLoading;

  // Back from Stripe can restore this page from bfcache with the
  // "Redirecting…" state frozen on the buttons: clear it.
  useBfcacheReset(() => {
    setLoadingPlan(null);
    setLoadingPack(null);
    setPortalLoading(false);
  });

  async function startCheckout(planId: PlanId) {
    posthog.capture("subscription_checkout_selected", { plan_id: planId });
    setError(null);
    setLoadingPlan(planId);
    try {
      const data = await apiPost<{ url: string }>("/api/billing/checkout", { planId });
      window.location.href = data.url;
    } catch (err) {
      setError(getErrorMessage(err, "Could not start checkout. Please try again."));
      setLoadingPlan(null);
    }
  }

  async function startTopup(packId: CreditPackId) {
    posthog.capture("credit_pack_checkout_selected", { pack_id: packId });
    setError(null);
    setLoadingPack(packId);
    try {
      const data = await apiPost<{ url: string }>("/api/billing/checkout", { packId });
      window.location.href = data.url;
    } catch (err) {
      setError(getErrorMessage(err, "Could not start checkout. Please try again."));
      setLoadingPack(null);
    }
  }

  async function openPortal() {
    setError(null);
    setPortalLoading(true);
    try {
      const data = await apiPost<{ url: string }>("/api/billing/portal");
      window.location.href = data.url;
    } catch (err) {
      setError(getErrorMessage(err, "Could not open the billing portal. Please try again."));
      setPortalLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">Monthly plans</h3>
          <p className="text-xs leading-relaxed text-muted">
            Credits refresh each billing cycle. Unused monthly credits don&apos;t roll over.
          </p>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {Object.values(plans).map((plan) => {
            const isCurrent = currentPlanId === plan.id;
            // A user with a plan changes it through the Stripe portal so proration
            // and cancellations are handled correctly; new users go to checkout.
            const switchViaPortal = hasPlan && !isCurrent && hasCustomer;

            let label = "Subscribe";
            if (isCurrent) label = "Current plan";
            else if (hasPlan) label = "Switch plan";
            const isThisLoading = loadingPlan === plan.id || (switchViaPortal && portalLoading);

            return (
              <Card
                key={plan.id}
                className={cn(
                  "flex flex-col",
                  isCurrent && "border-success/40 ring-1 ring-success/30",
                )}
              >
                <Card.Header>
                  <div className="flex items-start justify-between gap-2">
                    <Card.Title className="tracking-tight">{plan.name}</Card.Title>
                    {isCurrent ? (
                      <span className="text-xs font-medium tracking-[0.02em] text-success">
                        Current
                      </span>
                    ) : plan.id === POPULAR_PLAN && !hasPlan ? (
                      <span className="text-xs font-medium tracking-[0.02em] text-accent">
                        Popular
                      </span>
                    ) : null}
                  </div>
                  <Card.Description className="leading-relaxed">
                    {planTaglines[plan.id]}
                  </Card.Description>
                </Card.Header>
                <Card.Content className="flex-1">
                  <p className="text-xl font-semibold tracking-tight text-foreground tabular-nums">
                    ${plan.price}
                    <span className="text-sm font-normal text-muted">/mo</span>
                  </p>
                  <p className="mt-1 text-xs tracking-[0.01em] text-muted tabular-nums">
                    {plan.monthlyCredits.toLocaleString()} credits/mo
                  </p>
                  <ul className="mt-3 space-y-1.5 border-t border-border/50 pt-3">
                    {planFeatureList(plan.id).map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-xs text-muted">
                        <CheckIcon aria-hidden className="mt-px size-3.5 shrink-0 text-accent" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </Card.Content>
                <Card.Footer>
                  <LoadingButton
                    fullWidth
                    variant={isCurrent ? "secondary" : "primary"}
                    isPending={isThisLoading}
                    pendingLabel="Redirecting…"
                    isDisabled={isCurrent || busy}
                    onPress={() => (switchViaPortal ? openPortal() : startCheckout(plan.id))}
                  >
                    {label}
                  </LoadingButton>
                </Card.Footer>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">Top-up packs</h3>
          <p className="text-xs leading-relaxed text-muted">
            One-time purchase. Top-up credits never expire and stack on your monthly balance.
          </p>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-3">
          {Object.values(creditPacks).map((pack) => (
            <Card key={pack.id}>
              <Card.Header>
                <Card.Title className="tracking-tight">{pack.name}</Card.Title>
                <Card.Description>
                  {pack.credits.toLocaleString()} credits
                </Card.Description>
              </Card.Header>
              <Card.Content>
                <p className="text-xl font-semibold tracking-tight text-foreground tabular-nums">
                  ${pack.price}
                </p>
              </Card.Content>
              <Card.Footer>
                <LoadingButton
                  fullWidth
                  variant="secondary"
                  isPending={loadingPack === pack.id}
                  pendingLabel="Redirecting…"
                  isDisabled={busy}
                  onPress={() => startTopup(pack.id)}
                >
                  Buy credits
                </LoadingButton>
              </Card.Footer>
            </Card>
          ))}
        </div>
      </div>

      {hasCustomer ? (
        <LoadingButton
          variant="secondary"
          isPending={portalLoading}
          pendingLabel="Opening…"
          onPress={openPortal}
        >
          Manage billing in Stripe
        </LoadingButton>
      ) : null}
    </div>
  );
}
