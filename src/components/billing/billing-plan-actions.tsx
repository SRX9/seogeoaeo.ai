"use client";

import { Card } from "@heroui/react";
import { useState } from "react";
import posthog from "posthog-js";
import { CheckIcon } from "@/components/icons";
import { LoadingButton } from "@/components/ui/loading-button";
import { apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { cn } from "@/lib/cn";
import { useBfcacheReset } from "@/lib/hooks/use-bfcache-reset";
import { planFeatureList, plans, planTaglines, type PlanId } from "@/lib/billing/plans";

const SELF_SERVE_PLANS: PlanId[] = ["indie", "startup", "scale"];

export function BillingPlanActions({
  currentPlanId,
  hasCustomer,
}: {
  currentPlanId?: string | null;
  hasCustomer: boolean;
}) {
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPlan = Boolean(currentPlanId);
  const busy = loadingPlan !== null || portalLoading;

  useBfcacheReset(() => {
    setLoadingPlan(null);
    setPortalLoading(false);
  });

  async function startCheckout(planId: PlanId) {
    posthog.capture("subscription_checkout_selected", { plan_id: planId });
    setError(null);
    setLoadingPlan(planId);
    try {
      const data = await apiPost<{ url: string }>("/api/billing/checkout", { planId });
      window.location.href = data.url;
    } catch (failure) {
      setError(getErrorMessage(failure, "Could not start checkout. Please try again."));
      setLoadingPlan(null);
    }
  }

  async function openPortal() {
    setError(null);
    setPortalLoading(true);
    try {
      const data = await apiPost<{ url: string }>("/api/billing/portal");
      window.location.href = data.url;
    } catch (failure) {
      setError(getErrorMessage(failure, "Could not open billing. Please try again."));
      setPortalLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm leading-6 text-danger">{error}</p> : null}
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Choose Claudia&apos;s workload</h3>
        <p className="mt-1 text-sm leading-6 text-muted">
          Every plan includes the same capabilities. The plan changes how much work Claudia handles.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {SELF_SERVE_PLANS.map((planId) => {
          const plan = plans[planId];
          const isCurrent = currentPlanId === plan.id;
          const switchViaPortal = hasPlan && !isCurrent && hasCustomer;
          const isPending = loadingPlan === plan.id || (switchViaPortal && portalLoading);
          return (
            <Card key={plan.id} className={cn("flex flex-col", isCurrent && "border-success/50")}>
              <Card.Header>
                <div className="flex items-start justify-between gap-3">
                  <Card.Title>{plan.name}</Card.Title>
                  {isCurrent ? <span className="text-xs font-medium text-success">Current</span> : null}
                </div>
                <Card.Description>{planTaglines[plan.id]}</Card.Description>
              </Card.Header>
              <Card.Content className="flex-1">
                <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                  ${plan.price}<span className="text-sm font-normal text-muted"> / month</span>
                </p>
                <ul className="mt-5 space-y-2 border-t border-border/50 pt-5">
                  {planFeatureList(plan.id).map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-xs leading-5 text-muted">
                      <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-accent" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </Card.Content>
              <Card.Footer>
                <LoadingButton
                  fullWidth
                  variant={isCurrent ? "secondary" : "primary"}
                  isPending={isPending}
                  pendingLabel="Redirecting…"
                  isDisabled={isCurrent || busy}
                  onPress={() => (switchViaPortal ? openPortal() : startCheckout(plan.id))}
                >
                  {isCurrent ? "Current plan" : hasPlan ? "Switch plan" : `Choose ${plan.name}`}
                </LoadingButton>
              </Card.Footer>
            </Card>
          );
        })}
      </div>
      {hasCustomer ? (
        <LoadingButton variant="secondary" isPending={portalLoading} pendingLabel="Opening…" onPress={openPortal}>
          Manage billing in Stripe
        </LoadingButton>
      ) : null}
    </div>
  );
}
