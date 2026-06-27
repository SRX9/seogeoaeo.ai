import { buttonVariants } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import Link from "next/link";
import { articlesPerMonth, plans } from "@/lib/billing/plans";

const POPULAR_PLAN = "startup";

export function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 text-center">
      <p className="mb-4 text-sm font-medium uppercase tracking-wider text-muted">
        Autonomous SEO, GEO & AEO
      </p>
      <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
        Research, write, and publish optimized content on autopilot
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
        seogeoaeo.ai learns your brand, discovers high-intent topics across search & AI engines,
        generates optimized articles, and ships them to every platform you connect.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/login" className={buttonVariants({ size: "lg" })}>
          Get started free
        </Link>
        <Link href="#pricing" className={buttonVariants({ size: "lg", variant: "secondary" })}>
          See plans
        </Link>
      </div>
      <p className="mt-4 text-sm text-muted">
        Free to browse, set up brands, and run topic research. No credit card required.
      </p>
    </section>
  );
}

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-4 py-16">
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-bold text-foreground">Start free. Upgrade to publish.</h2>
        <p className="mx-auto mt-2 max-w-2xl text-muted">
          Brand setup and topic research are free forever. Paid plans unlock automatic
          article generation and publishing — weekly caps keep quality high.
        </p>
      </div>

      <Card className="mb-4 border-accent/30 bg-accent-soft/30">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <Card.Title>Free</Card.Title>
              <Chip variant="soft">$0 / mo</Chip>
            </div>
            <Card.Description className="mt-1">
              Browse your dashboard, set up unlimited brands, and run topic research at no cost.
            </Card.Description>
          </div>
          <Link href="/login" className={`${buttonVariants()} shrink-0`}>
            Get started free
          </Link>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Object.entries(plans).map(([id, plan]) => {
          const isPopular = id === POPULAR_PLAN;
          return (
            <Card key={id} className={isPopular ? "border-accent/40" : undefined}>
              <Card.Header>
                <div className="flex items-start justify-between gap-2">
                  <Card.Title>{plan.name}</Card.Title>
                  {isPopular ? (
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
                <p className="text-3xl font-semibold leading-none text-foreground tabular-nums">
                  ${plan.price}
                  <span className="text-base font-normal text-muted">/mo</span>
                </p>
              </Card.Content>
              <Card.Footer>
                <Link
                  href="/login"
                  className={`${buttonVariants({ variant: isPopular ? "primary" : "secondary" })} w-full`}
                >
                  Choose {plan.name}
                </Link>
              </Card.Footer>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
