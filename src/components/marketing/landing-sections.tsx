import { buttonVariants } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import Link from "next/link";
import {
  ArrowRightIcon,
  BoltIcon,
  CalendarIcon,
  ChartBarIcon,
  CircleCheckIcon,
  GaugeIcon,
  GlobeIcon,
  LayersIcon,
  PenIcon,
  PlugIcon,
  RefreshIcon,
  RocketIcon,
  SearchIcon,
  SparklesIcon,
  UsersIcon,
} from "@/components/icons";
import { plans } from "@/lib/billing/plans";

const heroEvidence = [
  "Multi-engine research",
  "Brand-tuned voice",
  "One-click publish",
];

const heroPreviewPillars = [
  { label: "SEO", value: 82 },
  { label: "AEO", value: 74 },
  { label: "GEO", value: 79 },
];

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft/40 px-3 py-1 text-xs font-medium uppercase tracking-wider text-accent-soft-foreground">
      <span className="size-1.5 rounded-full bg-accent" aria-hidden />
      {children}
    </span>
  );
}

export function Hero() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 pb-16 pt-24 sm:pt-32">
      <div className="mx-auto max-w-3xl text-center">
        <SectionEyebrow>Autonomous SEO, GEO &amp; AEO</SectionEyebrow>
        <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
          Get found across search <span className="text-accent">and</span> AI
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted">
          seogeoaeo.ai measures how discoverable your site is on Google and AI assistants,
          fixes the gaps, and ships brand-tuned, search-optimized articles to every platform
          you publish on — automatically.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/login" className={buttonVariants({ size: "lg" })}>
            Get started free
          </Link>
          <Link
            href="#how-it-works"
            className={buttonVariants({ variant: "secondary", size: "lg" })}
          >
            See how it works
          </Link>
        </div>
        <ul className="mx-auto mt-8 flex max-w-3xl flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted sm:gap-x-10">
          {heroEvidence.map((item) => (
            <li key={item} className="flex items-center gap-2">
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

/** A static, CSS-only "audit + content" product snapshot for credibility. */
function HeroPreview() {
  return (
    <div className="mx-auto mt-16 max-w-4xl">
      <Card className="overflow-hidden border-border/70 bg-surface/60 backdrop-blur">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-8">
          <div>
            <p className="text-sm font-medium text-muted">Visibility score</p>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-5xl font-semibold tabular-nums text-foreground">78</span>
              <span className="pb-1 text-sm text-muted">/ 100</span>
              <span className="mb-1 ml-auto rounded-lg bg-success-soft px-2 py-0.5 text-xs font-medium text-success-soft-foreground">
                +14 this month
              </span>
            </div>
            <div className="mt-6 space-y-4">
              {heroPreviewPillars.map((pillar) => (
                <div key={pillar.label}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{pillar.label}</span>
                    <span className="tabular-nums text-muted">{pillar.value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-border/60">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${pillar.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/40 p-4">
            <p className="text-sm font-medium text-muted">This week&apos;s content</p>
            <ul className="mt-3 space-y-2.5">
              {[
                { title: "How AI assistants pick their sources", status: "Published" },
                { title: "The 2026 guide to answer-engine SEO", status: "Scheduled" },
                { title: "llms.txt: the sitemap for AI", status: "Drafting" },
              ].map((row) => (
                <li
                  key={row.title}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-surface/50 px-3 py-2.5"
                >
                  <span className="truncate text-sm text-foreground">{row.title}</span>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium ${
                      row.status === "Published"
                        ? "text-success"
                        : row.status === "Scheduled"
                          ? "text-accent-soft-foreground"
                          : "text-muted"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`size-1.5 rounded-full ${
                        row.status === "Published"
                          ? "bg-success"
                          : row.status === "Scheduled"
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

const publishTargets = [
  "dev.to",
  "WordPress",
  "Ghost",
  "Hashnode",
  "Webhooks",
  "Markdown export",
];

export function TrustBar() {
  return (
    <section className="border-y border-border/60 bg-surface/30">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 py-8 sm:flex-row sm:justify-between">
        <p className="text-sm font-medium text-muted">Write once, publish everywhere</p>
        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {publishTargets.map((target) => (
            <li key={target} className="text-sm font-medium text-foreground/80">
              {target}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const pillars = [
  {
    icon: SearchIcon,
    name: "SEO",
    full: "Search Engine Optimization",
    blurb: "Rank in the classic blue links on Google and Bing.",
    points: ["Technical & on-page audit", "Core Web Vitals risk", "Schema & rich results"],
  },
  {
    icon: SparklesIcon,
    name: "AEO",
    full: "Answer Engine Optimization",
    blurb: "Become the answer in featured snippets and AI Overviews.",
    points: ["Passage citability scoring", "FAQ & speakable schema", "Answer-block rewrites"],
  },
  {
    icon: GlobeIcon,
    name: "GEO",
    full: "Generative Engine Optimization",
    blurb: "Get cited by ChatGPT, Claude, Perplexity & Gemini.",
    points: ["AI-crawler access checks", "llms.txt generator", "Brand & entity authority"],
  },
];

const capabilities = [
  {
    icon: GaugeIcon,
    title: "Measure & fix your visibility",
    blurb:
      "One audit scores how findable you are across search and AI, then hands you a prioritized, copy-paste fix list — and applies many fixes inside the app.",
    points: [
      "0–100 composite visibility score",
      "Severity-ranked issues with a 30-day plan",
      "Re-audit to prove the gain over time",
    ],
  },
  {
    icon: PenIcon,
    title: "Create & publish content",
    blurb:
      "It learns your brand voice, finds high-intent topics across every engine, writes optimized articles, and publishes them to the platforms you connect.",
    points: [
      "Multi-engine topic research",
      "Brand-tuned, citation-ready drafts",
      "One-click & scheduled publishing",
    ],
  },
];

export function Features() {
  return (
    <section id="features" className="border-t border-border/60 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>The all-in-one suite</SectionEyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Everything to get found — and stay found
          </h2>
          <p className="mt-4 text-muted">
            Most tools only audit, or only write. seogeoaeo.ai does both: it measures your
            visibility, fixes it, and produces the content that earns it.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {capabilities.map((cap) => (
            <Card key={cap.title} className="border-border/70">
              <div className="flex size-11 items-center justify-center rounded-xl border border-accent/30 bg-accent-soft/30 text-accent">
                <cap.icon className="size-6" />
              </div>
              <h3 className="mt-5 text-xl font-semibold text-foreground">{cap.title}</h3>
              <p className="mt-2 text-muted">{cap.blurb}</p>
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
            <h3 className="text-2xl font-semibold tracking-tight text-foreground">
              Optimized for all three engines
            </h3>
            <p className="mt-3 text-muted">
              Search, answer engines, and AI assistants each rank you differently. We cover the
              signals that matter for every one.
            </p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {pillars.map((pillar) => (
              <Card key={pillar.name} className="border-border/70">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg border border-border/60 bg-surface/60 text-accent">
                    <pillar.icon className="size-5" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold leading-none text-foreground">
                      {pillar.name}
                    </p>
                    <p className="mt-1 text-xs text-muted">{pillar.full}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-muted">{pillar.blurb}</p>
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
    title: "Connect your site & brand",
    blurb:
      "Add your URL. We learn your voice, detect your business type, and snapshot where you stand across SEO, AEO, and GEO.",
  },
  {
    icon: GaugeIcon,
    title: "Audit & prioritize",
    blurb:
      "Get a single visibility score with a severity-ranked fix list — from blocked AI crawlers to missing schema and thin content.",
  },
  {
    icon: SparklesIcon,
    title: "Generate optimized content",
    blurb:
      "We research high-intent topics and write citation-ready articles tuned to your brand and the engines you want to win.",
  },
  {
    icon: RocketIcon,
    title: "Publish & prove the gain",
    blurb:
      "Push to your platforms in one click, then re-audit on a schedule to watch your visibility climb month over month.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-border/60 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>How it works</SectionEyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            From invisible to cited in four steps
          </h2>
          <p className="mt-4 text-muted">
            Set it up once. The loop — measure, fix, create, publish — then runs on its own.
          </p>
        </div>

        <ol className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.title} className="relative">
              <Card className="h-full border-border/70">
                <div className="flex items-center justify-between">
                  <div className="flex size-10 items-center justify-center rounded-lg border border-accent/30 bg-accent-soft/30 text-accent">
                    <step.icon className="size-5" />
                  </div>
                  <span className="text-3xl font-semibold tabular-nums text-border">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm text-muted">{step.blurb}</p>
              </Card>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const employeePerks = [
  { icon: CalendarIcon, text: "Shows up every week with new, on-brand articles" },
  { icon: RefreshIcon, text: "Refreshes stale pages and re-audits automatically" },
  { icon: ChartBarIcon, text: "Reports progress so you can see the traffic it earns" },
  { icon: BoltIcon, text: "Never sleeps, never misses a publish, never goes off-brand" },
];

export function ContentEmployee() {
  return (
    <section className="border-t border-border/60 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <Card className="overflow-hidden border-accent/30 bg-accent-soft/10">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <SectionEyebrow>Your content employee</SectionEyebrow>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Like hiring a content team — without the headcount
              </h2>
              <p className="mt-4 text-muted">
                Think of seogeoaeo.ai as a tireless content hire. Once you set the brief, it
                researches, writes, optimizes, and publishes on a weekly cadence — and shows you
                exactly what it shipped and what it moved.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/login" className={buttonVariants()}>
                  Put it to work
                </Link>
                <Link
                  href="#pricing"
                  className={buttonVariants({ variant: "secondary" })}
                >
                  See plans
                </Link>
              </div>
            </div>

            <ul className="grid gap-4">
              {employeePerks.map((perk) => (
                <li
                  key={perk.text}
                  className="flex items-center gap-4 rounded-xl border border-border/60 bg-surface/50 p-4"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent-soft/30 text-accent">
                    <perk.icon className="size-5" />
                  </div>
                  <span className="text-sm text-foreground/90">{perk.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>
    </section>
  );
}

const integrations = [
  { name: "dev.to", blurb: "Publish straight to your dev.to account via API key." },
  { name: "WordPress", blurb: "Post to any self-hosted or WordPress.com site." },
  { name: "Ghost", blurb: "Send drafts or live posts to your Ghost publication." },
  { name: "Hashnode", blurb: "Ship to your Hashnode publication in one click." },
  { name: "Webhooks", blurb: "Fire a signed payload to any custom endpoint." },
  { name: "Markdown export", blurb: "Download clean Markdown for anywhere else." },
];

export function Publish() {
  return (
    <section id="publish" className="border-t border-border/60 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>Publish anywhere</SectionEyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Connect your platforms and ship
          </h2>
          <p className="mt-4 text-muted">
            Approve a draft and it goes live where your audience already is — or export the
            Markdown and take it anywhere.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map((integration) => (
            <Card key={integration.name} className="border-border/70">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-surface/60 text-accent">
                  <LayersIcon className="size-5" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{integration.name}</p>
                  <p className="mt-1 text-sm text-muted">{integration.blurb}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

const freeTeaser = [
  "Brand & site setup",
  "Topic & keyword research",
  "Visibility snapshot",
];

const paidTeaser = [
  "Everything in Free",
  "Article generation & weekly autopilot",
  "Publish everywhere + visibility fixes",
];

export function Pricing() {
  const startingPrice = Math.min(...Object.values(plans).map((plan) => plan.price));
  return (
    <section id="pricing" className="border-t border-border/60 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>Pricing</SectionEyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Start free. Upgrade to publish.
          </h2>
          <p className="mt-4 text-muted">
            Brand setup, research, and your first visibility snapshot are free. Paid plans
            unlock article generation and automated publishing.
          </p>
        </div>

        <div className="mt-12 grid items-stretch gap-6 md:grid-cols-2">
          <Card className="flex flex-col border-border/70">
            <div className="flex items-baseline gap-2">
              <Card.Title>Free</Card.Title>
              <span className="text-2xl font-semibold tabular-nums text-foreground">$0</span>
              <span className="text-sm text-muted">/mo</span>
            </div>
            <Card.Description className="mt-1">
              Everything you need to get set up — no card required.
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
              Get started free
            </Link>
          </Card>

          <Card className="flex flex-col border-accent/40 bg-accent-soft/10 ring-2 ring-accent/60">
            <div className="flex items-baseline gap-2">
              <Card.Title>Paid plans</Card.Title>
              <span className="text-2xl font-semibold tabular-nums text-foreground">
                from ${startingPrice}
              </span>
              <span className="text-sm text-muted">/mo</span>
            </div>
            <Card.Description className="mt-1">
              Scale article output and publishing across four tiers.
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
              Compare all plans
            </Link>
          </Card>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
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
    q: "What's the difference between SEO, AEO, and GEO?",
    a: "SEO wins the classic blue links on Google and Bing. AEO (Answer Engine Optimization) wins featured snippets and AI Overviews — being the extracted answer. GEO (Generative Engine Optimization) wins citations inside AI assistants like ChatGPT, Claude, and Perplexity. We optimize for all three at once.",
  },
  {
    q: "Do I need to be technical?",
    a: "No. Connect your site, and we handle the audit, the fixes, the writing, and the publishing. Findings come with plain-language explanations and copy-paste solutions — and many fixes apply automatically inside the app.",
  },
  {
    q: "Where can I publish?",
    a: "dev.to, WordPress, Ghost, and Hashnode are built in, plus signed webhooks to any custom endpoint and one-click Markdown export. Connect a platform once and publish to it in a click or on a schedule.",
  },
  {
    q: "How does the weekly autopilot work?",
    a: "Set your brand and cadence once. Each cycle it researches high-intent topics, drafts optimized articles in your voice, and queues them to publish — then re-audits so you can see your visibility improve over time.",
  },
  {
    q: "What are credits?",
    a: "Every AI action costs credits — an article is 100 credits, a research run is 20. Each plan includes a monthly credit allowance, and you can buy one-time top-up packs that never expire if you need more.",
  },
  {
    q: "Is there really a free plan?",
    a: "Yes. Free covers unlimited brand setup, topic research, and a visibility snapshot, with one article credit so you can try generation. No credit card required to start.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="border-t border-border/60 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <SectionEyebrow>FAQ</SectionEyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Questions, answered
          </h2>
        </div>

        <div className="mt-12 divide-y divide-border/60 border-y border-border/60">
          {faqs.map((faq) => (
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
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="px-4 py-24">
      <div className="mx-auto max-w-4xl">
        <Card className="overflow-hidden border-accent/30 bg-accent-soft/15 text-center">
          <div className="mx-auto max-w-2xl px-2 py-8">
            <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-accent/30 bg-accent-soft/30 text-accent">
              <UsersIcon className="size-6" />
            </div>
            <h2 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Make your site the one AI recommends
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted">
              Set up your brand, see your visibility score, and publish your first optimized
              article today — free.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/login" className={buttonVariants({ size: "lg" })}>
                Get started free
              </Link>
              <Link
                href="/pricing"
                className={buttonVariants({ variant: "secondary", size: "lg" })}
              >
                View pricing
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
