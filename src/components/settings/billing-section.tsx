"use client";

import { Meter } from "@heroui/react/meter";
import { Table } from "@heroui/react/table";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { BillingActions } from "@/components/billing/billing-actions";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { useCheckoutConfirm } from "@/lib/hooks/use-checkout-confirm";
import { getPlan, isActiveSubscription } from "@/lib/billing/plans";
import { combineQueries, queryKeys, useCredits, useMe } from "@/lib/api/queries";

const billingSkeleton = (
  <div className="space-y-10">
    <CardSkeleton lines={3} />
    <CardSkeleton lines={3} />
  </div>
);

const REASON_LABELS: Record<string, string> = {
  signup_grant: "Signup bonus",
  monthly_grant: "Monthly refill",
  monthly_expire: "Monthly reset",
  topup_purchase: "Credit pack",
  article_generation: "Article generated",
  research_run: "Research run",
  competitor_discovery: "Competitor discovery",
  refund: "Refund",
  adjustment: "Adjustment",
};

const COST_LABELS: Record<string, string> = {
  article_generation: "Generate an article",
  research_run: "Run topic research",
  competitor_discovery: "Discover competitors",
};

function formatReason(reason: string) {
  return REASON_LABELS[reason] ?? reason;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function BillingSection() {
  const searchParams = useSearchParams();
  const upgrade = searchParams.get("upgrade");
  const checkout = searchParams.get("checkout");
  const sessionId = searchParams.get("session_id");
  const queryClient = useQueryClient();
  const router = useRouter();
  const me = useMe();
  const credits = useCredits();
  const query = combineQueries(me, credits);

  // Back from Stripe: confirm the session server-side (idempotent with the
  // webhook) so the new plan / top-up credits show up immediately, then strip
  // the checkout params from the URL.
  useCheckoutConfirm({
    sessionId,
    enabled: checkout === "success",
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
      queryClient.invalidateQueries({ queryKey: queryKeys.credits });
      router.replace("/account?tab=billing");
    },
  });

  return (
    <Section
      query={query}
      errorLabel="Couldn't load billing."
      skeleton={billingSkeleton}
    >
      {([meData, creditsData]) => {
        const subscription = meData.subscription;
        const active = isActiveSubscription(subscription?.status);
        const plan = active && subscription?.planId ? getPlan(subscription.planId) : null;
        const balance = creditsData.balance;
        const costs = creditsData.costs;
        const ledger = creditsData.ledger;
        const grant = subscription?.monthlyCreditGrant ?? 0;
        const pct = grant > 0 ? (balance.monthly / grant) * 100 : 0;
        const meterColor =
          balance.total <= 0 ? "danger" : grant > 0 && pct <= 20 ? "warning" : "success";

        return (
          <div className="space-y-10">
      {!active && upgrade ? (
        <p className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
          You&apos;re out of credits. Pick a plan or grab a top-up pack below to keep generating.
        </p>
      ) : null}

      {/* Credit balance */}
      <div className="space-y-4 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`text-sm font-medium capitalize ${active ? "text-success" : "text-muted"}`}
            >
              {active ? (subscription?.status ?? "active") : "Free"}
            </span>
            {plan ? (
              <span className="text-sm text-foreground">
                {plan.name} · {plan.monthlyCredits.toLocaleString()} credits/mo
              </span>
            ) : null}
          </div>
          <div className="text-right">
            <span className="text-2xl font-semibold text-foreground tabular-nums">
              {balance.total.toLocaleString()}
            </span>
            <span className="ml-1 text-sm text-muted">credits</span>
          </div>
        </div>

        {grant > 0 ? (
          <div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted">
                Monthly credits{" "}
                {subscription?.currentPeriodEnd
                  ? `· resets ${formatDate(subscription.currentPeriodEnd)}`
                  : ""}
              </span>
              <span className="text-foreground tabular-nums">
                {balance.monthly.toLocaleString()} / {grant.toLocaleString()}
              </span>
            </div>
            <Meter
              aria-label="Monthly credits remaining"
              className="mt-2"
              color={meterColor}
              size="sm"
              value={balance.monthly}
              maxValue={grant}
            >
              <Meter.Track>
                <Meter.Fill />
              </Meter.Track>
            </Meter>
          </div>
        ) : null}

        <p className="text-sm text-muted">
          {balance.purchased.toLocaleString()} top-up credits (never expire)
          {active ? "" : " · subscribe for a monthly allowance and auto-publishing"}
        </p>
      </div>

      {/* What credits buy */}
      <div className="rounded-xl ">
        <h3 className="text-sm font-semibold text-foreground">What credits buy</h3>
        <Table className="mt-3">
          <Table.Content aria-label="Credit costs">
            <Table.Header>
              <Table.Column id="action" isRowHeader>
                Action
              </Table.Column>
              <Table.Column id="cost">Credits</Table.Column>
            </Table.Header>
            <Table.Body>
              {Object.entries(costs).map(([key, value]) => (
                <Table.Row key={key} id={key}>
                  <Table.Cell>{COST_LABELS[key] ?? key}</Table.Cell>
                  <Table.Cell>
                    <span className="tabular-nums text-foreground">{value}</span>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table>
      </div>

      {/* Recent activity */}
      {ledger.length > 0 ? (
        <div className="rounded-xl ">
          <h3 className="text-sm font-semibold text-foreground">Recent credit activity</h3>
          <Table className="mt-3">
            <Table.ScrollContainer>
              <Table.Content aria-label="Credit history" className="min-w-[420px]">
                <Table.Header>
                  <Table.Column id="reason" isRowHeader>
                    Activity
                  </Table.Column>
                  <Table.Column id="date">Date</Table.Column>
                  <Table.Column id="delta">Change</Table.Column>
                  <Table.Column id="balance">Balance</Table.Column>
                </Table.Header>
                <Table.Body>
                  {ledger.map((entry) => (
                    <Table.Row key={entry.id} id={entry.id}>
                      <Table.Cell>{formatReason(entry.reason)}</Table.Cell>
                      <Table.Cell>
                        <span className="text-muted">{formatDate(entry.createdAt)}</span>
                      </Table.Cell>
                      <Table.Cell>
                        <span
                          className={`tabular-nums ${entry.delta >= 0 ? "text-success" : "text-foreground"
                            }`}
                        >
                          {entry.delta >= 0 ? "+" : ""}
                          {entry.delta.toLocaleString()}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="tabular-nums text-muted">
                          {entry.balanceAfter?.toLocaleString() ?? "—"}
                        </span>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </div>
      ) : null}

            <BillingActions
              currentPlanId={plan?.id ?? null}
              hasCustomer={Boolean(subscription?.hasStripeCustomer)}
            />
          </div>
        );
      }}
    </Section>
  );
}
