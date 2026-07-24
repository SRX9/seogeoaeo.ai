"use client";

import { Accordion, Alert, Button, Card, Meter } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import { BillingPlanActions } from "@/components/billing/billing-plan-actions";
import { ToneText } from "@/components/ui/status-text";
import { LoadingButton } from "@/components/ui/loading-button";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { ChevronRightIcon } from "@/components/icons";
import { apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { combineQueries, queryKeys, useCredits, useMe } from "@/lib/api/queries";
import { getPlan, isActiveSubscription } from "@/lib/billing/plans";
import { useCheckoutConfirm } from "@/lib/hooks/use-checkout-confirm";

const billingSkeleton = (
  <div className="space-y-4">
    <CardSkeleton lines={3} className="min-h-56 rounded-2xl" />
    <CardSkeleton lines={2} className="min-h-28 rounded-2xl" />
    <CardSkeleton lines={3} className="min-h-36 rounded-2xl" />
  </div>
);
const BILLING_REASONS = new Set(["monthly_grant", "topup_purchase"]);

function formatDate(value: string | null, withYear = false) {
  if (!value) return "Not available";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

function daysUntil(value: string | null) {
  if (!value) return null;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));
}

export function BillingSection() {
  const searchParams = useSearchParams();
  const upgrade = searchParams.get("upgrade");
  const checkout = searchParams.get("checkout");
  const sessionId = searchParams.get("session_id");
  const queryClient = useQueryClient();
  const router = useProgressRouter();
  const query = combineQueries(useMe(), useCredits());
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  useCheckoutConfirm({
    sessionId,
    enabled: checkout === "success",
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
      queryClient.invalidateQueries({ queryKey: queryKeys.credits });
      router.replace("/account?tab=billing");
    },
  });

  async function openPortal() {
    setPortalError(null);
    setPortalLoading(true);
    try {
      const data = await apiPost<{ url: string }>("/api/billing/portal");
      window.location.href = data.url;
    } catch (error) {
      setPortalError(getErrorMessage(error, "Could not open the billing portal. Please try again."));
      setPortalLoading(false);
    }
  }

  return (
    <Section query={query} errorLabel="Couldn't load billing." skeleton={billingSkeleton}>
      {([meData, creditsData]) => {
        const subscription = meData.subscription;
        const active = isActiveSubscription(subscription?.status);
        const plan = active && subscription?.planId ? getPlan(subscription.planId) : null;
        const balance = creditsData.balance;
        const grant = subscription?.monthlyCreditGrant ?? 0;
        const monthlyLeft = Math.min(balance.monthly, grant);
        const usedCredits = grant > 0 ? Math.max(0, grant - monthlyLeft) : 0;
        const usedPercent = grant > 0 ? Math.min(100, Math.round((usedCredits / grant) * 100)) : 0;
        const billingEntries = creditsData.ledger
          .filter((entry) => BILLING_REASONS.has(entry.reason))
          .slice(0, 3);
        const resetDays = daysUntil(subscription?.currentPeriodEnd ?? null);

        return (
          <div className="space-y-6">
            {!active && upgrade ? (
              <Alert status="warning">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>Plan Required</Alert.Title>
                  <Alert.Description>Choose a plan to give Claudia more monthly work capacity.</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
            {portalError ? (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>Couldn&apos;t Open Billing</Alert.Title>
                  <Alert.Description>{portalError}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}

            <Card>
              <Card.Header className="flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Card.Title>{plan?.name ?? "Free"} Plan</Card.Title>
                    <ToneText tone={active ? "success" : "default"}>
                      {active ? "Active" : "Free"}
                    </ToneText>
                  </div>
                  <Card.Description>
                    {active && subscription?.currentPeriodEnd
                      ? `Renews ${formatDate(subscription.currentPeriodEnd, true)}`
                      : "Upgrade when you are ready for Claudia to take on recurring work."}
                  </Card.Description>
                </div>
                <Button
                  className="w-full sm:w-auto"
                  variant="secondary"
                  isPending={portalLoading}
                  isDisabled={!subscription?.hasStripeCustomer}
                  onPress={openPortal}
                >
                  Manage Plan
                </Button>
              </Card.Header>
              <Card.Content className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-surface-secondary p-4">
                  <p className="text-xs text-muted">Plan Price</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    ${plan?.price ?? 0}<span className="text-sm font-normal text-muted"> / mo</span>
                  </p>
                </div>
                <div className="rounded-xl bg-surface-secondary p-4">
                  <p className="text-xs text-muted">Monthly Workload</p>
                  <p className="mt-2 text-base font-semibold leading-6">
                    {plan ? plan.name : "Preview only"}
                  </p>
                </div>
                <div className="rounded-xl bg-surface-secondary p-4">
                  <p className="text-xs text-muted">Next Cycle</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {resetDays === null ? "—" : resetDays}
                    <span className="text-sm font-normal text-muted"> {resetDays === 1 ? "day" : "days"}</span>
                  </p>
                </div>
              </Card.Content>
            </Card>

            <Card>
              <Card.Header className="flex-row items-start justify-between gap-4">
                <div>
                  <Card.Title>Monthly Workload</Card.Title>
                  <Card.Description>{100 - usedPercent}% of this month&apos;s capacity remains</Card.Description>
                </div>
                <strong className="text-xl font-semibold tabular-nums">{usedPercent}%</strong>
              </Card.Header>
              <Card.Content>
                <Meter
                  aria-label="Monthly workload used"
                  color={usedPercent >= 90 ? "danger" : usedPercent >= 80 ? "warning" : "accent"}
                  size="sm"
                  value={usedCredits}
                  maxValue={Math.max(1, grant)}
                >
                  <Meter.Track><Meter.Fill /></Meter.Track>
                </Meter>
                <p className="mt-3 text-sm text-muted">
                  Claudia has used <span className="font-medium text-foreground tabular-nums">{usedPercent}%</span> of the included monthly workload.
                  {balance.purchased > 0 ? " Additional capacity is available if the monthly workload runs out." : ""}
                </p>
              </Card.Content>
            </Card>

            <Card>
              <Card.Header>
                <Card.Title>Latest Invoices</Card.Title>
                <Card.Description>Recent subscription and capacity activity.</Card.Description>
              </Card.Header>
              <Card.Content className="divide-y divide-separator">
                {billingEntries.length ? billingEntries.map((entry) => (
                  <div key={entry.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {entry.reason === "monthly_grant" ? `${plan?.name ?? "Plan"} renewal` : "Additional capacity"}
                      </p>
                      <p className="mt-1 text-xs text-muted">{formatDate(entry.createdAt, true)}</p>
                    </div>
                    <span className="text-sm font-medium tabular-nums">
                      {entry.reason === "monthly_grant" && plan ? `$${plan.price.toFixed(2)}` : "Added"}
                    </span>
                    {subscription?.hasStripeCustomer ? (
                      <LoadingButton size="sm" variant="secondary" isPending={portalLoading} onPress={openPortal}>Open</LoadingButton>
                    ) : null}
                  </div>
                )) : <p className="py-8 text-center text-sm text-muted">No invoices yet.</p>}
              </Card.Content>
            </Card>

            <Accordion
              variant="surface"
              defaultExpandedKeys={!active || Boolean(upgrade) ? ["plans"] : []}
            >
              <Accordion.Item id="plans">
                <Accordion.Heading>
                  <Accordion.Trigger>
                    {active ? "Plan Details" : "Choose a Plan"}
                    <Accordion.Indicator><ChevronRightIcon /></Accordion.Indicator>
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <Accordion.Body>
                    <BillingPlanActions currentPlanId={plan?.id ?? null} hasCustomer={Boolean(subscription?.hasStripeCustomer)} />
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </div>
        );
      }}
    </Section>
  );
}
