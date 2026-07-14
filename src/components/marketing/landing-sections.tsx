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
  LaunchIcon,
  SearchIcon,
  InsightIcon,
  UsersIcon,
} from "@/components/icons";
import { plans } from "@/lib/billing/plans";

const heroEvidence = [
  "Works while you're offline",
  "You only approve exceptions",
  "Proves gains with real traffic",
];

const heroPreviewPillars = [
  { label: "Google & search", value: 82 },
  { label: "Answer boxes", value: 74 },
  { label: "AI assistants", value: 79 },
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
        <SectionEyebrow>Your SEO and AI visibility hire</SectionEyebrow>
        <h1 className="type-display mt-7 text-4xl text-foreground sm:text-6xl sm:leading-[1.02]">
          Meet <span className="text-accent">Claudia</span>. She keeps your brand findable.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted sm:text-xl sm:leading-relaxed">
          Claudia checks how your brand shows up in Google and AI answers, prepares site fixes,
          and writes content in your voice. Each week, she tells you what changed and what needs
          your attention.
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

/** A static, CSS-only "audit + content" product snapshot for credibility. */
function HeroPreview() {
  return (
    <div className="mx-auto mt-16 max-w-4xl">
      <Card variant="transparent" className="rounded-none border-y border-border/60 py-8">
        <div className="grid gap-6 p-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-8">
          <div>
            <p className="text-sm font-medium tracking-[0.01em] text-muted">Visibility score</p>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-5xl font-semibold tabular-nums tracking-tight text-foreground">
                78
              </span>
              <span className="pb-1 text-sm text-muted">/ 100</span>
              <span className="mb-1 ml-auto rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-medium tracking-[0.01em] text-success-soft-foreground">
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
                  <div className="h-1.5 overflow-hidden rounded-full bg-border/50">
                    <div
                      className="h-full w-full origin-left rounded-full bg-accent transition-transform duration-ui ease-out-strong motion-reduce:transition-none"
                      style={{ transform: `scaleX(${pillar.value / 100})` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-y border-border/50 py-4">
            <p className="text-sm font-medium tracking-[0.01em] text-muted">Claudia this week</p>
            <ul className="mt-3 divide-y divide-border/40">
              {[
                { title: 'Published "How AI assistants pick sources"', status: "Done" },
                { title: "Fixed schema on 3 key pages", status: "Done" },
                { title: "Drafting comparison page for Perplexity gap", status: "Working" },
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
    <section className="border-y border-border/50">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 py-9 sm:flex-row sm:justify-between">
        <p className="text-sm font-medium tracking-[0.01em] text-muted">
          She publishes where your audience already is
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {publishTargets.map((target) => (
            <li
              key={target}
              className="text-sm font-medium tracking-tight text-foreground/80"
            >
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
    icon: GaugeIcon,
    title: "She measures & fixes visibility",
    blurb:
      "Claudia scores how findable you are on Google and AI assistants, queues fixes by impact, and prepares ready-to-install artifacts you deploy on your site.",
    points: [
      "A score that shows what changed",
      "Prepared fixes in one inbox",
      "Scheduled audits that track progress",
    ],
  },
  {
    icon: PenIcon,
    title: "She writes & publishes content",
    blurb:
      "She learns your voice, picks topics with a traffic thesis, writes human-sounding pieces, and ships them to the CMS you connect.",
    points: [
      "Topic ideas tied to search evidence",
      "Drafts written in your brand voice",
      "Automatic publishing or review first",
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
            One employee for visibility and content
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted">
            Claudia handles the recurring work: audits, fixes, research, writing, and reporting.
            You can follow every task without spending your week inside another SEO tool.
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-2">
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
              Built for search and AI answers
            </h3>
            <p className="mt-3 leading-relaxed text-muted">
              Google, answer boxes, and AI assistants look for different signals. Claudia checks
              each one and explains what to fix.
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
    title: "She onboards herself",
    blurb:
      "She runs the first audit, checks AI answers, researches topics, and prepares the first useful work.",
  },
  {
    icon: InsightIcon,
    title: "She works the standing loop",
    blurb:
      "She writes, audits, and follows up on a schedule. Every task appears in the work log.",
  },
  {
    icon: LaunchIcon,
    title: "You only decide exceptions",
    blurb:
      "Review drafts when you want to, install prepared site fixes, and read the weekly report. Autopilot can publish approved work for you.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-border/40 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>How she works</SectionEyebrow>
          <h2 className="type-display mt-5 text-3xl text-foreground sm:text-4xl">
            Set her up once, then let her work
          </h2>
          <p className="mt-4 leading-relaxed text-muted">
            Connect your site and choose how much Claudia can do on her own. She takes it from
            there and asks when she needs a decision.
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
  { icon: CalendarIcon, text: "Researches topics and writes on your plan schedule" },
  { icon: RefreshIcon, text: "Runs new audits and prepares the next fixes" },
  { icon: ChartBarIcon, text: "Sends a weekly report with scores, AI mentions, and traffic" },
  { icon: BoltIcon, text: "Keeps a work log so you can check every claim" },
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
                Your visibility and content specialist
              </h2>
              <p className="mt-4 leading-relaxed text-muted">
                Claudia handles the work that usually gets pushed to next week. She checks search
                and AI visibility, prepares fixes, writes useful content, and reports back every
                Monday.
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
    <section id="publish" className="border-t border-border/40 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>Publish anywhere</SectionEyebrow>
          <h2 className="type-display mt-5 text-3xl text-foreground sm:text-4xl">
            Connect your platforms and ship
          </h2>
          <p className="mt-4 leading-relaxed text-muted">
            Connect once. Autopilot can publish for you, while Copilot waits for your approval.
            You can also export clean Markdown whenever you need it.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map((integration) => (
            <Card key={integration.name} variant="transparent" className="rounded-none border-y border-border/50 px-0 py-5">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-surface/70 text-accent">
                  <LayersIcon className="size-5" />
                </div>
                <div>
                  <p className="font-semibold tracking-tight text-foreground">
                    {integration.name}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{integration.blurb}</p>
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
  "Meet Claudia & set up the brand",
  "She pre-fills voice, competitors & use cases",
  "A free visibility snapshot for your site",
];

const paidTeaser = [
  "Claudia works every day on your brand",
  "Articles, audits, and prepared fixes included",
  "A weekly report with scores, AI answers, and traffic",
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
            Start with a free site check. A paid plan gives Claudia a monthly budget for writing,
            audits, fixes, and reporting.
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
              Set up your brand and check your site. No card required.
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
              Choose how much work Claudia can take on each month.
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
    a: "Claudia is the main product. Most days, you only need her status, inbox, and weekly report. The detailed scorecard and individual tools are still available in Workshop when you need them.",
  },
  {
    q: "What does Claudia actually do?",
    a: "She checks how your brand appears in Google, answer boxes, and AI assistants. She then prepares site fixes, researches topics, writes articles, and can publish them. Connect Search Console and her reports will also include real traffic.",
  },
  {
    q: "Do I need to be technical?",
    a: "No. Share your site, check the brand details Claudia found, and choose Autopilot or Copilot. She explains issues in plain language and gives you copy-ready files or code when a fix cannot be applied directly.",
  },
  {
    q: "Autopilot vs Copilot?",
    a: "Autopilot publishes articles to your CMS. Copilot waits for your approval first. Both modes prepare site fixes in your inbox, and you can switch modes whenever you like.",
  },
  {
    q: "What are credits?",
    a: "Credits pay for heavier work such as articles, research, and audits. Your plan includes a monthly allowance for prepared site fixes. If you need more volume, top-up credits do not expire.",
  },
  {
    q: "Can I try before hiring her?",
    a: "Yes. You can set up your brand and run a visibility snapshot for free. A paid plan starts Claudia's regular writing, audit, and reporting schedule.",
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
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted transition-transform duration-ui ease-out-strong group-open:rotate-45">
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
