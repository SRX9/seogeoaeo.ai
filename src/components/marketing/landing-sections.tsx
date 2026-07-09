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
        <SectionEyebrow>Hire an AI employee — not another dashboard</SectionEyebrow>
        <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
          Meet <span className="text-accent">Claudia</span> — she keeps your brand findable
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted">
          Claudia audits you on Google and AI assistants, fixes what she can, writes and
          publishes content that moves the score, and checks in weekly. You pay, connect, and
          approve — she does the rest.
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
            <p className="text-sm font-medium text-muted">Claudia this week</p>
            <ul className="mt-3 space-y-2.5">
              {[
                { title: "Published “How AI assistants pick sources”", status: "Done" },
                { title: "Fixed schema on 3 key pages", status: "Done" },
                { title: "Drafting comparison page for Perplexity gap", status: "Working" },
              ].map((row) => (
                <li
                  key={row.title}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-surface/50 px-3 py-2.5"
                >
                  <span className="truncate text-sm text-foreground">{row.title}</span>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium ${
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
    <section className="border-y border-border/60 bg-surface/30">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 py-8 sm:flex-row sm:justify-between">
        <p className="text-sm font-medium text-muted">She publishes where your audience already is</p>
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
    title: "She measures & fixes visibility",
    blurb:
      "Claudia scores how findable you are on Google and AI assistants, queues fixes by impact, and applies the safe ones when you put her on Autopilot.",
    points: [
      "Score with delta — never a vanity number alone",
      "One inbox of approvals, not 35 tools",
      "Re-audits on schedule to prove the gain",
    ],
  },
  {
    icon: PenIcon,
    title: "She writes & publishes content",
    blurb:
      "She learns your voice, picks topics with a traffic thesis, writes human-sounding pieces, and ships them to the CMS you connect.",
    points: [
      "Evidence-backed topic queue",
      "Brand-tuned, citation-ready drafts",
      "Publish on Autopilot or after your OK",
    ],
  },
];

export function Features() {
  return (
    <section id="features" className="border-t border-border/60 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>What she does every week</SectionEyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            One employee. Both halves of the job.
          </h2>
          <p className="mt-4 text-muted">
            Most products are toolboxes you operate. Claudia is the hire who operates them —
            visibility and content, closed-loop, in your brand&apos;s voice.
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
    title: "You hire her (3 minutes)",
    blurb:
      "Share your site. She reads the brand, proposes voice and competitors, and you confirm — almost no typing.",
  },
  {
    icon: GaugeIcon,
    title: "She onboards herself",
    blurb:
      "First audit, AI-answer check, topic research, quick-win fixes, first article, and a Day-0 brief. You can watch or leave.",
  },
  {
    icon: SparklesIcon,
    title: "She works the standing loop",
    blurb:
      "Daily writing within plan caps, cadence audits, fix dispatch, and answer tracking — logged in plain language.",
  },
  {
    icon: RocketIcon,
    title: "You only decide exceptions",
    blurb:
      "Approve drafts or fixes on Copilot, connect GSC/CMS once, read her weekly memo. Autopilot means even fewer taps.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-border/60 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>How she works</SectionEyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Onboard an employee — not a project plan
          </h2>
          <p className="mt-4 text-muted">
            Your job: pay, connect, approve. Hers: measure, fix, write, publish, prove.
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
  { icon: CalendarIcon, text: "Shows up daily with research, drafts, and publishes" },
  { icon: RefreshIcon, text: "Re-audits and applies safe fixes on your plan cadence" },
  { icon: ChartBarIcon, text: "Weekly memo: score delta, AI mentions, traffic proof" },
  { icon: BoltIcon, text: "Never sleeps, never invents work you can't verify in the log" },
];

export function ContentEmployee() {
  return (
    <section className="border-t border-border/60 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <Card className="overflow-hidden border-accent/30 bg-accent-soft/10">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <SectionEyebrow>Meet Claudia</SectionEyebrow>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Your autonomous visibility &amp; content hire
              </h2>
              <p className="mt-4 text-muted">
                Not a sidebar of tools you have to operate. An employee who already knows the
                job — search, answer boxes, AI assistants, and the content that moves them —
                and checks in like a great hire on Monday morning.
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
            Connect once. On Autopilot she publishes for you; on Copilot she waits for your OK —
            or export Markdown and take it anywhere.
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
  "Meet Claudia & set up the brand",
  "She pre-fills voice, competitors & use cases",
  "Free visibility snapshot to see the gap",
];

const paidTeaser = [
  "Claudia works every day on your brand",
  "Articles, audits, and safe fixes included in plan",
  "Weekly memo + proof stack (score, AI answers, traffic)",
];

export function Pricing() {
  const startingPrice = Math.min(...Object.values(plans).map((plan) => plan.price));
  return (
    <section id="pricing" className="border-t border-border/60 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <SectionEyebrow>Plans</SectionEyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Salary for an employee — not a taxi meter
          </h2>
          <p className="mt-4 text-muted">
            Try the free check to see the gap. Hire Claudia on a plan so she can write, fix, and
            report — safe fixes are included, never charged per click.
          </p>
        </div>

        <div className="mt-12 grid items-stretch gap-6 md:grid-cols-2">
          <Card className="flex flex-col border-border/70">
            <div className="flex items-baseline gap-2">
              <Card.Title>Preview</Card.Title>
              <span className="text-2xl font-semibold tabular-nums text-foreground">$0</span>
              <span className="text-sm text-muted">/mo</span>
            </div>
            <Card.Description className="mt-1">
              See who she is and where you stand — no card required.
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

          <Card className="flex flex-col border-accent/40 bg-accent-soft/10 ring-2 ring-accent/60">
            <div className="flex items-baseline gap-2">
              <Card.Title>Hire Claudia</Card.Title>
              <span className="text-2xl font-semibold tabular-nums text-foreground">
                from ${startingPrice}
              </span>
              <span className="text-sm text-muted">/mo</span>
            </div>
            <Card.Description className="mt-1">
              Four capacity tiers — she works; you glance and approve.
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
    q: "Is this another SEO dashboard?",
    a: "No. The product is Claudia — an autonomous employee. Your day-to-day is her status, inbox, and weekly memo. The full scorecard and toolbox live under Workshop for power users, not as the default.",
  },
  {
    q: "What does Claudia actually do?",
    a: "She measures how findable you are on Google (search), answer boxes, and AI assistants; prepares or applies safe fixes; researches topics with a traffic thesis; writes and can publish articles; and reports score delta, AI mentions, and real traffic when Search Console is connected.",
  },
  {
    q: "Do I need to be technical?",
    a: "No. Share your site, confirm what she inferred, pick Autopilot or Copilot, and start a plan. Findings use owner language — not jargon — and many fixes are one click.",
  },
  {
    q: "Autopilot vs Copilot?",
    a: "Autopilot: she publishes and applies safe on-site fixes herself (everything logged and reversible). Copilot: she prepares the same work and waits for your approval in Inbox. You can switch anytime.",
  },
  {
    q: "What are credits?",
    a: "Credits budget heavy AI work (articles, research, audits). Safe fixes are plan-included — never metered per fix, because an employee is salaried, not a taxi. Top-up packs never expire if you need more volume.",
  },
  {
    q: "Can I try before hiring her?",
    a: "Yes. Free brand setup and a visibility snapshot show the gap. Paid plans put Claudia on the standing loop so she can write, fix, and report every week.",
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
              Hire the employee who already knows the job
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted">
              Share your site. Claudia sets herself up, starts working, and only pings you when
              something needs a human.
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
