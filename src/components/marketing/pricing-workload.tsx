import { Card } from "@heroui/react/card";
import {
  ChartBarIcon,
  CircleCheckIcon,
  PenIcon,
  SearchIcon,
} from "@/components/icons";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { CREDIT_COSTS } from "@/lib/billing/credits";

const INCLUDED_WORK = [
  "Brand, audience, competitor, and buyer context",
  "Opportunity research across search and AI answers",
  "Content drafts, publishing workflows, and performance follow-up",
  "Copy-ready coding-agent prompts or step-by-step manual fixes",
  "Search Console evidence and a weekly outcome report",
];

const CAPACITY_EXAMPLES = [
  {
    icon: PenIcon,
    title: "Article draft",
    value: CREDIT_COSTS.article_generation,
    description: "Research-backed long-form draft in your brand voice.",
  },
  {
    icon: SearchIcon,
    title: "Research run",
    value: CREDIT_COSTS.research_run,
    description: "New opportunities ranked from demand and competitive gaps.",
  },
  {
    icon: ChartBarIcon,
    title: "Visibility audit",
    value: CREDIT_COSTS.visibility_audit,
    description: "A fresh evidence pass across the site, search, and AI readiness.",
  },
] as const;

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
                and reporting. Higher tiers add credits, so Claudia can complete more work and
                monitor a wider surface each month.
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

            <section className="mx-auto mt-20 max-w-5xl" aria-labelledby="capacity-heading">
              <div className="max-w-2xl">
                <h2 id="capacity-heading" className="type-title text-2xl text-foreground sm:text-3xl">
                  How work credits translate into output
                </h2>
                <p className="mt-3 text-pretty leading-7 text-muted">
                  Claudia spends capacity only when she performs heavier work. The article number
                  on each plan is a maximum comparison; a real month normally mixes several kinds
                  of work.
                </p>
              </div>
              <div className="mt-8 grid gap-5 md:grid-cols-3">
                {CAPACITY_EXAMPLES.map((example) => (
                  <Card key={example.title} variant="transparent" className="rounded-none border-t border-border/60 px-0 py-6">
                    <example.icon className="size-5 text-accent" />
                    <Card.Title className="mt-4">{example.title}</Card.Title>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                      {example.value} credits
                    </p>
                    <Card.Description className="mt-2 leading-6 text-pretty">
                      {example.description}
                    </Card.Description>
                  </Card>
                ))}
              </div>
              <p className="mt-6 max-w-3xl text-sm leading-6 text-muted text-pretty">
                Prepared site-fix instructions are included within each plan&apos;s workload limits.
                Purchased top-up credits do not expire.
              </p>
            </section>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
