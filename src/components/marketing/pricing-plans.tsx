import { buttonVariants } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import Link from "next/link";
import { CircleCheckIcon } from "@/components/icons";
import {
  planFeatureList,
  plans,
  planTaglines,
  type PlanId,
} from "@/lib/billing/plans";

const POPULAR_PLAN: PlanId = "startup";
const SELF_SERVE_PLANS: PlanId[] = ["indie", "startup", "scale"];

const freeFeatures = [
  "Set up your first brand",
  "Review the product, audience, and competitors Claudia finds",
  "See the first content opportunity",
  "Get an initial SEO, AEO, and GEO checklist",
];

function FeatureItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm leading-snug text-muted">
      <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-accent" />
      <span>{children}</span>
    </li>
  );
}

/**
 * Shared capacity grid. Every paid plan includes the same Claudia; the tiers
 * only change how much work she can complete and monitor each month.
 */
export function PricingPlans() {
  return (
    <div>
      <Card variant="transparent" className="mb-8 rounded-none border-y border-border/60 px-0 py-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-baseline gap-2">
              <Card.Title className="tracking-tight">Free</Card.Title>
              <span className="text-sm font-medium tracking-[0.01em] text-muted">$0 / mo</span>
            </div>
            <Card.Description className="mt-1 leading-relaxed">
              Let Claudia learn the brand and show what she would tackle first.
            </Card.Description>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 lg:max-w-xl">
            {freeFeatures.map((feature) => (
              <FeatureItem key={feature}>{feature}</FeatureItem>
            ))}
          </ul>
          <Link href="/login" className={`${buttonVariants()} shrink-0`}>
            Start free
          </Link>
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-3">
        {SELF_SERVE_PLANS.map((id) => {
          const plan = plans[id];
          const isPopular = id === POPULAR_PLAN;
          return (
            <Card
              key={id}
              className={
                isPopular
                  ? "flex flex-col border-accent/60"
                  : "flex flex-col border-border/60"
              }
            >
              <Card.Header>
                <div className="flex items-start justify-between gap-2">
                  <Card.Title className="tracking-tight">{plan.name}</Card.Title>
                  {isPopular ? (
                    <span className="text-xs font-medium tracking-[0.02em] text-accent">
                      Best starting point
                    </span>
                  ) : null}
                </div>
                <Card.Description className="leading-relaxed">{planTaglines[id]}</Card.Description>
              </Card.Header>
              <Card.Content className="flex-1">
                <p className="text-3xl font-semibold leading-none tracking-tight text-foreground tabular-nums">
                  ${plan.price}
                  <span className="text-base font-normal text-muted">/mo</span>
                </p>
                <ul className="mt-5 space-y-2.5 border-t border-border/40 pt-5">
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

      <p className="mt-6 text-center text-sm leading-relaxed text-muted">
        Claudia&apos;s capabilities do not change between plans. Choose a lighter monthly workload,
        consistent weekly work, or continuous higher-volume work.
      </p>
    </div>
  );
}
