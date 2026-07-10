import type { Metadata } from "next";
import { buttonVariants } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { CircleCheckIcon } from "@/components/icons";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Plans — Hire Claudia | seogeoaeo.ai",
  description:
    "Salary-style plans for Claudia, your autonomous SEO·AEO·GEO employee. Safe fixes included, " +
    "not metered per click. Start free, then hire her to write, fix, and report every week.",
  alternates: { canonical: `${SITE_URL}/pricing` },
};

const includedEverywhere = [
  "Visibility loop across Google, answer boxes & AI assistants",
  "Brand-tuned writing with a traffic thesis per piece",
  "Daily research → write → publish (within plan caps)",
  "Safe fixes included in plan — never per-fix charges",
  "Inbox for the rare decisions she needs from you",
  "Weekly memo + work log in plain language",
];

const pricingFaqs = [
  {
    q: "Is this a taxi meter for SEO tools?",
    a: "No. Plans are closer to a salary: she works on a cadence. Heavy AI jobs use credits so volume stays fair. Preparing site fixes (robots, schema, meta) is plan-included — never metered per fix. You install ready artifacts on your site; Claudia re-checks on the next audit.",
  },
  {
    q: "How do credits work?",
    a: "Credits budget articles, research, and audits. Each plan refreshes a monthly allowance. Unused monthly credits don't roll over; one-time top-up packs never expire.",
  },
  {
    q: "Can I change plans or cancel anytime?",
    a: "Yes. Upgrade, downgrade, or cancel from billing. Changes take effect next cycle; you keep access through the period you've paid for.",
  },
  {
    q: "What happens when credits run out?",
    a: "She pauses heavy jobs gracefully, logs it, and can email you. Top up or wait for the monthly refresh — she won't invent work she can't fund.",
  },
];

export default function PricingPage() {
  return (
    <div>
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-4 pb-12 pt-24 text-center sm:pt-32">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent-soft/35 px-3.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-accent-soft-foreground">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden />
            Plans
          </span>
          <h1 className="type-display mt-6 text-4xl text-foreground sm:text-5xl sm:leading-[1.05]">
            Capacity for the employee you hired
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-muted">
            Preview free. Hire Claudia on a plan so she can write, fix, and report —
            more capacity as you scale, not more dashboards.
          </p>
        </section>

        <section className="px-4 pb-8">
          <div className="mx-auto max-w-6xl">
            <PricingPlans />
          </div>
        </section>

        <section className="px-4 py-16">
          <div className="mx-auto max-w-4xl">
            <Card className="material-panel border-border/50">
              <h2 className="type-title text-xl text-foreground">Every paid hire includes</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Same employee, different capacity — credits, cadence, and fix volume.
              </p>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {includedEverywhere.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 text-sm leading-snug text-foreground/90"
                  >
                    <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-accent" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </section>

        <section className="border-t border-border/40 px-4 py-20">
          <div className="mx-auto max-w-3xl">
            <h2 className="type-title text-center text-3xl text-foreground">Plan questions</h2>
            <div className="mt-10 divide-y divide-border/40 border-y border-border/40">
              {pricingFaqs.map((faq) => (
                <details key={faq.q} className="group py-5">
                  <summary className="pressable flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg text-left text-base font-medium tracking-tight text-foreground [&::-webkit-details-marker]:hidden">
                    {faq.q}
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted transition-transform duration-ui ease-out-strong group-open:rotate-45">
                      <svg
                        viewBox="0 0 24 24"
                        className="size-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        aria-hidden
                      >
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                  </summary>
                  <p className="mt-3 text-pretty text-sm leading-relaxed text-muted">{faq.a}</p>
                </details>
              ))}
            </div>

            <div className="mt-12 text-center">
              <Link href="/login" className={buttonVariants({ size: "lg" })}>
                Hire Claudia
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
