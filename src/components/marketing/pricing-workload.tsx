import { Card } from "@heroui/react/card";
import { CircleCheckIcon } from "@/components/icons";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { PricingPlans } from "@/components/marketing/pricing-plans";

const INCLUDED_WORK = [
  "Brand, audience, competitor, and buyer context",
  "Opportunity research across search and AI answers",
  "Content drafts, publishing workflows, and performance follow-up",
  "Copy-ready coding-agent prompts or step-by-step manual fixes",
  "Search Console evidence and a weekly outcome report",
];

export function PricingWorkload() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <section className="px-4 pb-20 pt-24 sm:pb-28 sm:pt-32">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-accent">
                Monthly work capacity
              </p>
              <h1 className="type-display mt-5 text-balance text-4xl text-foreground sm:text-6xl sm:leading-[1.02]">
                The same Claudia. Choose how much work she can do.
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-8 text-muted">
                Every paid plan includes the same research, judgment, content, prepared fixes,
                and reporting. Higher tiers give Claudia a larger monthly workload.
              </p>
            </div>

            <Card variant="transparent" className="mx-auto mt-12 max-w-5xl rounded-none border-y border-border/60 px-0 py-7">
              <Card.Header>
                <Card.Title>Included with every paid plan</Card.Title>
                <Card.Description className="mt-1 max-w-3xl leading-6 text-pretty">
                  Plan choice never locks a capability. It only sets Claudia&apos;s monthly workload.
                </Card.Description>
              </Card.Header>
              <Card.Content>
                <ul className="grid gap-3 md:grid-cols-2">
                  {INCLUDED_WORK.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-muted">
                      <CircleCheckIcon className="mt-1 size-4 shrink-0 text-accent" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Card.Content>
            </Card>

            <div className="mt-14">
              <PricingPlans />
            </div>

          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
