import type { Metadata } from "next";
import { buttonVariants } from "@heroui/react/button";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { CircleCheckIcon } from "@/components/icons";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Plans for Claudia | seogeoaeo.ai",
  description:
    "Choose a monthly workload for Claudia. Plans cover research, writing, audits, prepared site fixes, and weekly reporting.",
  alternates: { canonical: `${SITE_URL}/pricing` },
};

const includedEverywhere = [
  "Regular checks across Google, answer boxes, and AI assistants",
  "Writing based on your brand voice and search evidence",
  "Research, writing, and publishing within your plan limits",
  "A monthly allowance for prepared site fixes",
  "One inbox for approvals and connection requests",
  "A weekly report and a complete work log",
];

const pricingFaqs = [
  {
    q: "What does a plan include?",
    a: "Each plan gives Claudia a monthly credit allowance and a limit for prepared site fixes. Credits cover heavier work such as articles, research, and audits. After you install a site fix, Claudia checks it again during the next audit.",
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
    a: "Claudia pauses work that needs credits and records the reason in the work log. You can add more credits or wait for the next monthly allowance.",
  },
];

export default function PricingPage() {
  return (
    <div>
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-4 pb-12 pt-24 text-center sm:pt-32">
          <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden />
            Plans
          </span>
          <h1 className="type-display mt-6 text-4xl text-foreground sm:text-5xl sm:leading-[1.05]">
            Choose Claudia&apos;s monthly workload
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-muted">
            Start with a free site check. Pick a paid plan when you want Claudia to research,
            write, audit, and report on a regular schedule.
          </p>
        </section>

        <section className="px-4 pb-8">
          <div className="mx-auto max-w-6xl">
            <PricingPlans />
          </div>
        </section>

        <section className="px-4 py-16">
          <div className="mx-auto max-w-4xl">
            <div className="border-y border-border/60 py-8">
              <h2 className="type-title text-xl text-foreground">Every paid hire includes</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Every plan includes the same workflow. Higher tiers cover more credits, more
                frequent audits, and more prepared fixes.
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
            </div>
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
