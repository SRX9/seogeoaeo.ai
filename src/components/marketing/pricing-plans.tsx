import { buttonVariants } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import Link from "next/link";
import { CircleCheckIcon } from "@/components/icons";
import { planFeatureList, plans, planTaglines, type PlanId } from "@/lib/billing/plans";
import { creditPacks } from "@/lib/billing/credits";

const POPULAR_PLAN: PlanId = "startup";

const freeFeatures = [
  "Unlimited brand & site setup",
  "Topic & keyword research",
  "60-second visibility snapshot",
  "1 article credit to try generation",
];

function FeatureItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-muted">
      <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-accent" />
      <span>{children}</span>
    </li>
  );
}

/**
 * The full plan grid (Free banner + four paid tiers). Shared by the landing
 * page pricing section and the dedicated `/pricing` page so they never diverge.
 */
export function PricingPlans() {
  return (
    <div>
      <Card className="mb-6 border-accent/30 bg-accent-soft/20">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-baseline gap-2">
              <Card.Title>Free</Card.Title>
              <span className="text-sm font-medium text-muted">$0 / mo</span>
            </div>
            <Card.Description className="mt-1">
              Set up your brand, research topics, and snapshot your visibility — no card required.
            </Card.Description>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 lg:max-w-xl">
            {freeFeatures.map((feature) => (
              <FeatureItem key={feature}>{feature}</FeatureItem>
            ))}
          </ul>
          <Link href="/login" className={`${buttonVariants()} shrink-0`}>
            Get started free
          </Link>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(plans) as PlanId[]).map((id) => {
          const plan = plans[id];
          const isPopular = id === POPULAR_PLAN;
          return (
            <Card
              key={id}
              className={
                isPopular
                  ? "flex flex-col border-accent/40 bg-accent-soft/10 ring-2 ring-accent/60"
                  : "flex flex-col"
              }
            >
              <Card.Header>
                <div className="flex items-start justify-between gap-2">
                  <Card.Title>{plan.name}</Card.Title>
                  {isPopular ? (
                    <span className="text-xs font-medium text-accent">Most popular</span>
                  ) : null}
                </div>
                <Card.Description>{planTaglines[id]}</Card.Description>
              </Card.Header>
              <Card.Content className="flex-1">
                <p className="text-3xl font-semibold leading-none text-foreground tabular-nums">
                  ${plan.price}
                  <span className="text-base font-normal text-muted">/mo</span>
                </p>
                <p className="mt-2 text-sm text-muted tabular-nums">
                  {plan.monthlyCredits.toLocaleString()} credits/mo
                </p>
                <ul className="mt-5 space-y-2.5 border-t border-border/60 pt-5">
                  {planFeatureList(id).map((feature) => (
                    <FeatureItem key={feature}>{feature}</FeatureItem>
                  ))}
                </ul>
              </Card.Content>
              <Card.Footer>
                <Link
                  href="/login"
                  className={`${buttonVariants({
                    variant: isPopular ? "primary" : "secondary",
                  })} w-full`}
                >
                  Choose {plan.name}
                </Link>
              </Card.Footer>
            </Card>
          );
        })}
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        Need more capacity? One-time credit packs from ${creditPacks.small.price} —
        purchased credits never expire and stack on top of your plan.
      </p>
    </div>
  );
}
