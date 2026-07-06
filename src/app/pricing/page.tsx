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
  title: "Pricing — seogeoaeo.ai",
  description:
    "Simple, credit-based pricing for the all-in-one SEO·AEO·GEO suite. Start free, " +
    "then upgrade to generate and publish optimized content automatically.",
  alternates: { canonical: `${SITE_URL}/pricing` },
};

const includedEverywhere = [
  "Visibility audit across SEO, AEO & GEO",
  "Brand-tuned article generation",
  "Multi-engine topic research",
  "Publish to dev.to, WordPress, Ghost, Hashnode & webhooks",
  "Weekly content autopilot & scheduling",
  "Markdown export",
];

const pricingFaqs = [
  {
    q: "How do credits work?",
    a: "Every AI action spends credits — an article costs 100 credits, a research run 20. Each plan refreshes a monthly credit allowance. Unused monthly credits don't roll over, but one-time top-up packs you buy never expire.",
  },
  {
    q: "Can I change plans or cancel anytime?",
    a: "Yes. Upgrade, downgrade, or cancel whenever you like from your billing settings. Changes take effect at the start of your next cycle, and you keep access through the period you've paid for.",
  },
  {
    q: "What happens when I run out of credits?",
    a: "Generation pauses until your next monthly refresh, or you can buy a top-up pack to keep going. Purchased credits stack on top of your plan and never expire.",
  },
  {
    q: "Do you offer an agency or white-label plan?",
    a: "Enterprise includes white-label reports and agency tools like a prospect CRM and proposals. If you need something custom for a larger team, reach out and we'll tailor it.",
  },
];

export default function PricingPage() {
  return (
    <div>
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-4 pb-12 pt-24 text-center sm:pt-32">
          <span className="inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft/40 px-3 py-1 text-xs font-medium uppercase tracking-wider text-accent-soft-foreground">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden />
            Pricing
          </span>
          <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Pricing that scales with your output
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-muted">
            Start free with brand setup, research, and a visibility snapshot. Upgrade when
            you&apos;re ready to generate and publish — and only pay for the volume you need.
          </p>
        </section>

        <section className="px-4 pb-8">
          <div className="mx-auto max-w-6xl">
            <PricingPlans />
          </div>
        </section>

        <section className="px-4 py-16">
          <div className="mx-auto max-w-4xl">
            <Card className="border-border/70">
              <h2 className="text-xl font-semibold text-foreground">
                Every paid plan includes
              </h2>
              <p className="mt-1 text-sm text-muted">
                The full suite — plans differ by monthly credits, workspaces, and reporting depth.
              </p>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {includedEverywhere.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-foreground/90">
                    <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-accent" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </section>

        <section className="border-t border-border/60 px-4 py-20">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-center text-3xl font-semibold tracking-tight text-foreground">
              Pricing questions
            </h2>
            <div className="mt-10 divide-y divide-border/60 border-y border-border/60">
              {pricingFaqs.map((faq) => (
                <details key={faq.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-medium text-foreground [&::-webkit-details-marker]:hidden">
                    {faq.q}
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border/70 text-muted transition-transform duration-200 group-open:rotate-45">
                      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
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
                Get started free
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
