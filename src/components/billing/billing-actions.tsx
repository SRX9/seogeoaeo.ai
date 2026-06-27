"use client";

import { Card, Chip } from "@heroui/react";
import { useState } from "react";
import { LoadingButton } from "@/components/ui/loading-button";
import { apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { articlesPerMonth, plans, type PlanId } from "@/lib/billing/plans";
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

  async function startCheckout(planId: PlanId) {
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
          <h3 className="text-sm font-semibold text-foreground">Monthly plans</h3>
          <p className="text-xs text-muted">
            Credits refresh each billing cycle. Unused monthly credits don&apos;t roll over.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              <Card key={plan.id} className={isCurrent ? "border-success/40" : undefined}>
                <Card.Header>
                  <div className="flex items-start justify-between gap-2">
                    <Card.Title>{plan.name}</Card.Title>
                    {isCurrent ? (
                      <Chip color="success" variant="soft">
                        Current
                      </Chip>
                    ) : plan.id === POPULAR_PLAN && !hasPlan ? (
                      <Chip color="accent" variant="soft">
                        Popular
                      </Chip>
                    ) : null}
                  </div>
                  <Card.Description>
                    {plan.monthlyCredits.toLocaleString()} credits/mo · ≈
                    {articlesPerMonth(plan.monthlyCredits)} articles
                  </Card.Description>
                </Card.Header>
                <Card.Content>
                  <p className="text-xl font-semibold text-foreground tabular-nums">
                    ${plan.price}
                    <span className="text-sm font-normal text-muted">/mo</span>
                  </p>
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
          <h3 className="text-sm font-semibold text-foreground">Top-up packs</h3>
          <p className="text-xs text-muted">
            One-time purchase. Top-up credits never expire and stack on your monthly balance.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {Object.values(creditPacks).map((pack) => (
            <Card key={pack.id}>
              <Card.Header>
                <Card.Title>{pack.name}</Card.Title>
                <Card.Description>{pack.credits.toLocaleString()} credits</Card.Description>
              </Card.Header>
              <Card.Content>
                <p className="text-xl font-semibold text-foreground tabular-nums">${pack.price}</p>
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
