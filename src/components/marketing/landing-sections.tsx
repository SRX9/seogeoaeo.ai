import { buttonVariants } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import Link from "next/link";
import {
  ArrowRightIcon,
  CalendarIcon,
  ChartBarIcon,
  CircleCheckIcon,
  GaugeIcon,
  GlobeIcon,
  PenIcon,
  PlugIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  InsightIcon,
  UsersIcon,
} from "@/components/icons";
import { plans } from "@/lib/billing/plans";

const heroEvidence = [
  "Chooses the next best action",
  "Produces copy-ready implementation",
  "Follows up with real evidence",
];

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
      <span className="size-1.5 rounded-full bg-accent" aria-hidden />
      {children}
    </span>
  );
}

export function Hero() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 pb-20 pt-24 sm:pt-32">
      <div className="mx-auto max-w-3xl text-center">
        <SectionEyebrow>Your organic growth operator</SectionEyebrow>
        <h1 className="type-display mt-7 text-4xl text-foreground sm:text-6xl sm:leading-[1.02]">
          Meet <span className="text-accent">Claudia</span>. She turns organic opportunities into finished work.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted sm:text-xl sm:leading-relaxed">
          Built for SaaS companies and growth-focused brands, Claudia finds the highest-value
          SEO, AEO, or GEO action, prepares exactly what needs to ship, and follows up on the result.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/login" className={buttonVariants({ size: "lg" })}>
            Hire Claudia
          </Link>
          <Link
            href="#how-it-works"
            className={buttonVariants({ variant: "secondary", size: "lg" })}
          >
            See how she works
          </Link>
        </div>
        <ul className="mx-auto mt-9 flex max-w-3xl flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted sm:gap-x-10">
          {heroEvidence.map((item) => (
            <li key={item} className="flex items-center gap-2 tracking-[0.01em]">
              <CircleCheckIcon className="size-4 text-accent" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <HeroPreview />
    </section>
  );
}

/** A static operator snapshot: priority, reasoning, deliverable, and recent work. */
function HeroPreview() {
  return (
    <div className="mx-auto mt-16 max-w-4xl">
      <Card variant="transparent" className="rounded-none border-y border-border/60 py-8">
        <div className="grid gap-6 p-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-8">
          <div>
            <p className="text-sm font-medium tracking-[0.01em] text-accent">Current priority</p>
            <h2 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-foreground text-balance">
              Refresh the comparison page already close to page one
            </h2>
            <dl className="mt-6 space-y-4 border-t border-border/50 pt-5">
              <div>
                <dt className="text-xs font-medium text-muted">Why now</dt>
                <dd className="mt-1 text-sm leading-6 text-foreground text-pretty">
                  Search Console shows rising impressions, position 12, and a clear CTR gap.
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted">Deliverable</dt>
                <dd className="mt-1 text-sm leading-6 text-foreground text-pretty">
                  Revised copy, metadata, internal links, and a copy-ready implementation prompt.
                </dd>
              </div>
            </dl>
          </div>

          <div className="border-y border-border/50 py-4 md:border-y-0 md:border-l md:pl-8">
            <p className="text-sm font-medium tracking-[0.01em] text-muted">Completed this week</p>
            <ul className="mt-3 divide-y divide-border/40">
              {[
                { title: "Found three striking-distance buyer queries", status: "Done" },
                { title: "Prepared schema prompt for three key pages", status: "Done" },
                { title: "Refreshing the comparison page", status: "Working" },
              ].map((row) => (
                <li
                  key={row.title}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <span className="truncate text-sm text-foreground">{row.title}</span>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium tracking-[0.01em] ${
                      row.status === "Done"
                        ? "text-success"
                        : row.status === "Working"
                          ? "text-accent-soft-foreground"
                          : "text-muted"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`size-1.5 rounded-full ${
                        row.status === "Done"
                          ? "bg-success"
                          : row.status === "Working"
                            ? "bg-accent"
                            : "bg-muted/60"
                      }`}
                    />
                    {row.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}

const pillars = [
  {
    icon: SearchIcon,
    name: "SEO",
    full: "Search Engine Optimization",
    blurb: "Improve how your pages rank in Google and Bing.",
    points: ["Technical & on-page audit", "Core Web Vitals risk", "Schema & rich results"],
  },
  {
    icon: InsightIcon,
    name: "AEO",
    full: "Answer Engine Optimization",
    blurb: "Give search engines clear answers they can quote.",
    points: ["Passage citability scoring", "FAQ & speakable schema", "Answer-block rewrites"],
  },
  {
    icon: GlobeIcon,
    name: "GEO",
    full: "Generative Engine Optimization",
    blurb: "Help ChatGPT, Claude, Perplexity, and Gemini find and cite your brand.",
    points: ["AI-crawler access checks", "llms.txt generator", "Brand & entity authority"],
  },
];

const capabilities = [
  {
    icon: InsightIcon,
    title: "She decides what matters next",
    blurb:
      "Claudia combines your brand, buyer questions, Search Console, competitors, site health, and AI answers into one ranked opportunity queue.",
    points: [
      "Priorities backed by real evidence",
      "Existing pages considered before new content",
      "One useful next action, not another dashboard",
    ],
  },
  {
    icon: PenIcon,
    title: "She produces finished work",
    blurb:
      "She writes in your voice and turns technical recommendations into handoffs your team can use immediately.",
    points: [
      "Research-backed drafts and page refreshes",
      "Prompts for Claude Code, Codex, and Cursor",
      "Step-by-step instructions for manual changes",
    ],
  },
  {
    icon: ChartBarIcon,
    title: "She follows up on outcomes",
    blurb:
      "Claudia keeps the baseline, checks what changed, and reports the evidence without making you interpret a wall of metrics.",
    points: [
      "Search Console traffic and position checks",
      "AI-answer and site rechecks",
      "A concise weekly outcome report",
    ],
  },
];

export function Features() {
  return (
    <section id="features" className="border-t border-border/40 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>What she does every week</SectionEyebrow>
          <h2 className="type-display mt-5 text-3xl text-foreground sm:text-4xl">
            One operator. One continuous growth loop.
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted">
            Claudia investigates, prioritizes, produces, and follows up. The individual analyzers
            stay behind the scenes unless you want to inspect the evidence.
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {capabilities.map((cap) => (
            <Card key={cap.title} variant="transparent" className="rounded-none border-y border-border/50 px-0 py-7">
              <div className="flex size-9 items-center justify-center text-accent">
                <cap.icon className="size-6" />
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
                {cap.title}
              </h3>
              <p className="mt-2 leading-relaxed text-muted">{cap.blurb}</p>
              <ul className="mt-5 space-y-2.5">
                {cap.points.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-sm text-foreground/90">
                    <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-accent" />
                    {point}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <div className="mt-16">
          <div className="mx-auto max-w-2xl text-center">
            <h3 className="type-title text-2xl text-foreground sm:text-3xl">
              Three methods, one priority queue
            </h3>
            <p className="mt-3 leading-relaxed text-muted">
              SEO, AEO, and GEO are how Claudia investigates opportunities. You manage one
              operator, not three separate products.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {pillars.map((pillar) => (
              <Card key={pillar.name} variant="transparent" className="rounded-none border-y border-border/50 px-0 py-6">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center text-accent">
                    <pillar.icon className="size-5" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold leading-none tracking-tight text-foreground">
                      {pillar.name}
                    </p>
                    <p className="mt-1 text-xs tracking-[0.01em] text-muted">{pillar.full}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted">{pillar.blurb}</p>
                <ul className="mt-4 space-y-2">
                  {pillar.points.map((point) => (
                    <li key={point} className="flex items-start gap-2 text-sm text-foreground/90">
                      <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-accent" />
                      {point}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const steps = [
  {
    icon: PlugIcon,
    title: "You hire her (3 minutes)",
    blurb:
      "Share your site. She drafts your brand voice, audience, and competitor list for you to confirm.",
  },
  {
    icon: GaugeIcon,
    title: "She chooses the best next action",
    blurb:
      "She weighs search demand, existing pages, competitors, buyer questions, and site issues by likely impact.",
  },
  {
    icon: PenIcon,
    title: "She prepares the finished work",
    blurb:
      "You receive the draft, refresh, exact code prompt, or manual checklist needed to ship the improvement.",
  },
  {
    icon: RefreshIcon,
    title: "You ship it; she follows up",
    blurb:
      "Publish through a connected CMS or use the handoff. Claudia rechecks the evidence and tells you what to do next.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-border/40 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>How she works</SectionEyebrow>
          <h2 className="type-display mt-5 text-3xl text-foreground sm:text-4xl">
            From opportunity to verified follow-up
          </h2>
          <p className="mt-4 leading-relaxed text-muted">
            Connect the evidence once. Claudia keeps the work moving and asks only when she needs
            context, approval, or confirmation that a change is live.
          </p>
        </div>

        <ol className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.title} className="relative">
              <Card variant="transparent" className="h-full rounded-none border-t border-border/60 px-0 py-6">
                <div className="flex items-center justify-between">
                  <div className="flex size-9 items-center justify-center text-accent">
                    <step.icon className="size-5" />
                  </div>
                  <span className="text-3xl font-semibold tabular-nums tracking-tight text-border">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.blurb}</p>
              </Card>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const employeePerks = [
  { icon: CalendarIcon, text: "Keeps one ranked queue of the most useful work" },
  { icon: PenIcon, text: "Produces content, coding prompts, and manual instructions" },
  { icon: RefreshIcon, text: "Rechecks shipped changes against the original evidence" },
  { icon: ChartBarIcon, text: "Reports outcomes, open decisions, and the next priority" },
];

export function ContentEmployee() {
  return (
    <section className="border-t border-border/40 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <Card variant="transparent" className="overflow-hidden rounded-none border-y border-border/60 py-9">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <SectionEyebrow>Meet Claudia</SectionEyebrow>
              <h2 className="type-display mt-5 text-3xl text-foreground sm:text-4xl">
                Your organic growth operator
              </h2>
              <p className="mt-4 leading-relaxed text-muted">
                Claudia handles the recurring work that usually gets split across SEO tools,
                content calendars, technical audits, and weekly reporting. You see the priority,
                the deliverable, and the evidence in one place.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/login" className={buttonVariants()}>
                  Hire Claudia
                </Link>
                <Link
                  href="#pricing"
                  className={buttonVariants({ variant: "secondary" })}
                >
                  See plans
                </Link>
              </div>
            </div>

            <ul className="divide-y divide-border/50 border-y border-border/50">
              {employeePerks.map((perk) => (
                <li
                  key={perk.text}
                  className="flex items-center gap-4 py-4"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center text-accent">
                    <perk.icon className="size-5" />
                  </div>
                  <span className="text-sm leading-snug text-foreground/90">{perk.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
    </section>
  );
}

const freeTeaser = [
  "Set up the brand and buyer context",
  "Review the voice and competitors she finds",
  "See the first evidence-backed opportunities",
];

const paidTeaser = [
  "The same Claudia on every paid plan",
  "More credits mean more completed work",
  "Article equivalents make capacity easy to compare",
];

export function Pricing() {
  const startingPrice = Math.min(...Object.values(plans).map((plan) => plan.price));
  return (
    <section id="pricing" className="border-t border-border/40 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>Plans</SectionEyebrow>
          <h2 className="type-display mt-5 text-3xl text-foreground sm:text-4xl">
            Pick a plan that fits the workload
          </h2>
          <p className="mt-4 leading-relaxed text-muted">
            Every paid plan includes the same capabilities. Choose the monthly capacity Claudia
            can spend on research, writing, audits, answer checks, and prepared fixes.
          </p>
        </div>

        <div className="mt-12 grid items-stretch gap-5 md:grid-cols-2">
          <Card variant="transparent" className="flex flex-col rounded-none border-y border-border/60 px-0 py-7">
            <div className="flex items-baseline gap-2">
              <Card.Title>Preview</Card.Title>
              <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                $0
              </span>
              <span className="text-sm text-muted">/mo</span>
            </div>
            <Card.Description className="mt-1">
              Let Claudia learn the brand and show what she would tackle first.
            </Card.Description>
            <ul className="mt-5 flex-1 space-y-2.5">
              {freeTeaser.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-muted">
                  <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-accent" />
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/login" className={`${buttonVariants({ variant: "secondary" })} mt-6 w-full`}>
              Start free
            </Link>
          </Card>

          <Card variant="transparent" className="flex flex-col rounded-none border-y-2 border-accent/60 px-0 py-7">
            <div className="flex items-baseline gap-2">
              <Card.Title>Hire Claudia</Card.Title>
              <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                from ${startingPrice}
              </span>
              <span className="text-sm text-muted">/mo</span>
            </div>
            <Card.Description className="mt-1">
              Choose how much work Claudia can complete each month.
            </Card.Description>
            <ul className="mt-5 flex-1 space-y-2.5">
              {paidTeaser.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-foreground/90">
                  <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-accent" />
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/pricing" className={`${buttonVariants()} mt-6 w-full`}>
              Compare capacity tiers
            </Link>
          </Card>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/pricing"
            className="pressable inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-accent hover-fine:underline"
          >
            See full pricing &amp; FAQ
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

const faqs = [
  {
    q: "Is this another SEO dashboard?",
    a: "No. Claudia is the main product. Most days, you only need her current priority, Inbox, Work history, and weekly outcome report. Detailed evidence appears inside the work that needs it.",
  },
  {
    q: "What does Claudia actually do?",
    a: "She learns the brand, investigates search and AI-answer opportunities, chooses the strongest next action, writes or prepares the work, and follows up using Search Console and fresh checks.",
  },
  {
    q: "Do I need to be technical?",
    a: "No. For code changes, Claudia gives you a complete prompt to paste into Claude Code, Codex, or Cursor. For CMS or hosting changes, she gives you a step-by-step manual checklist and tells you how to verify it.",
  },
  {
    q: "Why are there different plans if Claudia is the same?",
    a: "The capabilities are the same. Plans change Claudia's monthly work credits, daily pace, and monitoring volume. Higher capacity means more research, drafts, audits, answer checks, and prepared changes can be completed.",
  },
  {
    q: "What are credits?",
    a: "Credits are Claudia's work capacity. An article draft uses more capacity than a research run or answer check, so each plan shows an article-draft equivalent for easy comparison. Actual output depends on the mix of work Claudia prioritizes.",
  },
  {
    q: "Can I try before hiring her?",
    a: "Yes. You can set up the brand and review a free site snapshot before choosing monthly work capacity.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="border-t border-border/40 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <SectionEyebrow>FAQ</SectionEyebrow>
          <h2 className="type-display mt-5 text-3xl text-foreground sm:text-4xl">
            Questions, answered
          </h2>
        </div>

        <div className="mt-12 divide-y divide-border/40 border-y border-border/40">
          {faqs.map((faq) => (
            <details key={faq.q} className="group py-5">
              <summary className="pressable flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg text-left text-base font-medium tracking-tight text-foreground [&::-webkit-details-marker]:hidden">
                {faq.q}
                <span className="flex size-7 shrink-0 items-center justify-center text-muted transition-transform duration-ui ease-out-strong group-open:rotate-45">
                  <PlusIcon className="size-4" />
                </span>
              </summary>
              <p className="mt-3 text-pretty text-sm leading-relaxed text-muted">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="px-4 py-24">
      <div className="mx-auto max-w-4xl">
        <Card variant="transparent" className="overflow-hidden rounded-none border-y border-border/60 py-10 text-center">
          <div className="mx-auto max-w-2xl px-2 py-10">
            <div className="mx-auto flex size-10 items-center justify-center text-accent">
              <UsersIcon className="size-6" />
            </div>
            <h2 className="type-display mt-6 text-3xl text-foreground sm:text-4xl">
              Put Claudia to work on your site
            </h2>
            <p className="mx-auto mt-4 max-w-xl leading-relaxed text-muted">
              Share your site and review the brand details Claudia finds. She can start with the
              audit and tell you exactly what needs your decision.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3 justify-center">
              <Link href="/login" className={buttonVariants({ size: "lg" })}>
                Hire Claudia
              </Link>
              <Link
                href="/pricing"
                className={buttonVariants({ variant: "secondary", size: "lg" })}
              >
                View plans
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
