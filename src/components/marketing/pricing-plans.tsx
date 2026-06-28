import { buttonVariants } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import Link from "next/link";
import { CircleCheckIcon } from "@/components/icons";
import { articlesPerMonth, plans, type PlanId } from "@/lib/billing/plans";
import { creditPacks } from "@/lib/billing/credits";

const POPULAR_PLAN: PlanId = "startup";

const planTagline: Record<PlanId, string> = {
  indie: "Solo creators testing the engines",
  startup: "Growing teams shipping weekly",
  scale: "Brands scaling content output",
  enterprise: "Agencies & multi-brand ops",
};

/**
 * Qualitative highlights per tier. Volume (articles/credits) is rendered
 * separately from the live plan data so the numbers can never drift; these
 * bullets cover the capabilities that step up as the plan grows.
 */
const planFeatures: Record<PlanId, string[]> = {
  indie: [
    "Weekly content autopilot",
    "Publish to dev.to, WordPress, Ghost, Hashnode & webhooks",
    "Full visibility audit across SEO, AEO & GEO",
    "One brand workspace",
  ],
  startup: [
    "Everything in Indie",
    "Scheduled re-audits & monthly progress reports",
    "Priority topic-research queue",
    "Up to 3 brand workspaces",
  ],
  scale: [
    "Everything in Startup",
    "Competitor AI-visibility benchmarking",
    "PDF visibility reports",
    "Up to 10 brand workspaces",
  ],
  enterprise: [
    "Everything in Scale",
    "White-label reports & branding",
    "Agency tools — CRM & proposals",
    "Unlimited workspaces + priority support",
  ],
};

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
            <div className="flex items-center gap-2">
              <Card.Title>Free</Card.Title>
              <Chip variant="soft">$0 / mo</Chip>
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
                    <Chip color="accent" variant="soft">
                      Popular
                    </Chip>
                  ) : null}
                </div>
                <Card.Description>{planTagline[id]}</Card.Description>
              </Card.Header>
              <Card.Content className="flex-1">
                <p className="text-3xl font-semibold leading-none text-foreground tabular-nums">
                  ${plan.price}
                  <span className="text-base font-normal text-muted">/mo</span>
                </p>
                <p className="mt-2 text-sm text-muted tabular-nums">
                  {plan.monthlyCredits.toLocaleString()} credits · ≈
                  {articlesPerMonth(plan.monthlyCredits)} articles/mo
                </p>
                <ul className="mt-5 space-y-2.5 border-t border-border/60 pt-5">
                  {planFeatures[id].map((feature) => (
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
