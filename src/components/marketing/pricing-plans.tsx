import { buttonVariants } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import Link from "next/link";
import { CircleCheckIcon } from "@/components/icons";
import {
  articleDraftEquivalent,
  planFeatureList,
  plans,
  planTaglines,
  type PlanId,
} from "@/lib/billing/plans";
import { creditPacks } from "@/lib/billing/credits";

const POPULAR_PLAN: PlanId = "startup";

const freeFeatures = [
  "Set up your first brand",
  "Review the voice, audience, and competitors Claudia finds",
  "Run a quick site and visibility snapshot",
  "See the first evidence-backed opportunities",
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

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(plans) as PlanId[]).map((id) => {
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
                <p className="mt-3 text-sm font-medium tracking-[0.01em] text-foreground tabular-nums">
                  {plan.monthlyCredits.toLocaleString()} work credits/month
                </p>
                <p className="mt-1 text-xs leading-5 text-muted text-pretty">
                  Up to {articleDraftEquivalent(plan).toLocaleString()} article-draft equivalents if every credit is used for writing.
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
                  Choose {plan.name} capacity
                </Link>
              </Card.Footer>
            </Card>
          );
        })}
      </div>

      <p className="mt-6 text-center text-sm leading-relaxed text-muted">
        Claudia&apos;s capabilities do not change between paid plans. More credits mean more
        research, writing, audits, and answer checks. One-time capacity starts at ${creditPacks.small.price}.
      </p>
    </div>
  );
}
