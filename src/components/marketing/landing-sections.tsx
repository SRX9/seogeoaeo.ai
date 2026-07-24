import { buttonVariants } from "@heroui/react/button";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightIcon,
  AutomationIcon,
  ChartBarIcon,
  CheckIcon,
  CircleCheckIcon,
  CodeBlockIcon,
  GlobeIcon,
  InsightIcon,
  PenIcon,
  PlusIcon,
  RefreshIcon,
  ResearchIcon,
  SearchIcon,
  ShieldIcon,
  UserInputIcon,
} from "@/components/icons";
import { plans } from "@/lib/billing/plans";
import { cn } from "@/lib/cn";
import styles from "./landing-sections.module.css";

function SectionHeading({
  eyebrow,
  title,
  description,
  inverse = false,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  inverse?: boolean;
}) {
  return (
    <div className="max-w-3xl">
      <p className={cn(styles.eyebrow, inverse ? "text-white/48" : "text-zinc-500")}>{eyebrow}</p>
      <h2 className={cn("type-display mt-5 text-4xl sm:text-6xl", inverse ? "text-white" : "text-zinc-950")}>
        {title}
      </h2>
      {description ? (
        <p className={cn("mt-6 max-w-2xl text-pretty text-base leading-7 sm:text-lg", inverse ? "text-white/58" : "text-zinc-600")}>
          {description}
        </p>
      ) : null}
    </div>
  );
}

const signals = [
  { icon: ResearchIcon, label: "Find", detail: "The highest-impact job" },
  { icon: PenIcon, label: "Prepare", detail: "A finished deliverable" },
  { icon: UserInputIcon, label: "Approve", detail: "You decide what ships" },
  { icon: ChartBarIcon, label: "Prove", detail: "Recheck what changed" },
] as const;

export function Hero() {
  return (
    <section className={styles.hero}>
      <video
        aria-hidden
        autoPlay
        className={styles.heroVideo}
        loop
        muted
        playsInline
        poster="/og-image.png"
        preload="metadata"
      >
        <source src="/claudua_animated.mp4" type="video/mp4" />
      </video>
      <div aria-hidden className={styles.heroWash} />
      <div aria-hidden className={styles.heroGrain} />

      <div className={styles.heroInner}>
        <div className={styles.heroCopy}>
          <p className={styles.heroKicker}>
            <span aria-hidden />
            Meet Claudia, your AI employee for organic growth
          </p>
          <h1 className="type-display max-w-5xl text-[clamp(3.35rem,8.3vw,8.5rem)] leading-[0.88] text-white">
            The SEO work gets done.
            <span className="block text-white/48">You stay in control.</span>
          </h1>
          <div className={styles.heroSupport}>
            <p>
              Share your website and goals. Claudia finds the best next move, prepares the work, and checks the result—while every sensitive decision stays with you.
            </p>
            <div className={styles.heroActions}>
              <div className="flex flex-wrap gap-3">
                <Link href="/login" className={styles.primaryCta}>
                  Give Claudia a job
                  <ArrowRightIcon className="size-4" />
                </Link>
                <Link href="#how-it-works" className={styles.glassCta}>
                  See how it works
                </Link>
              </div>
              <p className={styles.heroReassurance}>
                <CheckIcon className="size-4" />
                First job free. No card required.
              </p>
            </div>
          </div>
        </div>

        <div className={styles.signalBlock}>
          <p className={styles.signalIntro}>From your URL to a measured result</p>
          <div className={styles.signalRail}>
            {signals.map((item, index) => (
              <div key={item.label} className={styles.signalItem}>
                <span className={styles.signalNumber}>{String(index + 1).padStart(2, "0")}</span>
                <item.icon className="size-5 shrink-0 text-white/74" />
                <div>
                  <p>{item.label}</p>
                  <span>{item.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const outcomes = [
  {
    number: "01",
    icon: ResearchIcon,
    title: "She finds the work worth doing.",
    description: "Search Console, competitors, buyer questions, technical health, and AI answers become one ranked plan.",
    result: "One evidence-backed priority—not another dashboard to manage.",
  },
  {
    number: "02",
    icon: PenIcon,
    title: "She prepares the complete deliverable.",
    description: "Get a publish-ready article, page refresh, schema change, implementation prompt, or exact checklist in your voice.",
    result: "Work your marketer, writer, or developer can ship today.",
  },
  {
    number: "03",
    icon: ChartBarIcon,
    title: "She comes back with proof.",
    description: "Every change keeps its baseline. Claudia rechecks rankings, traffic, site health, and AI visibility after launch.",
    result: "A clear outcome tied back to the original decision.",
  },
] as const;

export function Features() {
  return (
    <>
      <section id="features" className={styles.editorialSection}>
        <div className="mx-auto max-w-[90rem] px-5 sm:px-8 lg:px-12">
          <div className={styles.sectionIntro}>
            <SectionHeading
              eyebrow="The operating loop"
              title="Less tool work. More finished work."
              description="SeoGeoAeo AI puts Claudia to work across research, content, technical fixes, and measurement. You get finished work with the reasoning attached."
            />
            <p className={styles.sideNote}>One AI employee across SEO, AEO, GEO, content, and technical execution.</p>
          </div>

          <div className={styles.outcomeGrid}>
            {outcomes.map((outcome) => (
              <article key={outcome.title} className={styles.outcomeCard}>
                <div className="flex items-center justify-between">
                  <outcome.icon className="size-6 text-zinc-900" />
                  <span className="text-sm tabular-nums text-zinc-400">{outcome.number}</span>
                </div>
                <h3>{outcome.title}</h3>
                <p>{outcome.description}</p>
                <div className={styles.outcomeResult}>
                  <span>What changes</span>
                  <strong>{outcome.result}</strong>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <Deliverables />
    </>
  );
}

const deliverables = [
  { icon: SearchIcon, label: "Technical & on-page", title: "Fix the pages that are holding growth back", text: "Site health, internal links, metadata, schema, and page-level opportunities—prioritized by likely impact." },
  { icon: PenIcon, label: "Content production", title: "Turn real customer demand into publishable work", text: "Research-backed articles, comparisons, refreshes, and briefs written around what your buyers are already asking." },
  { icon: InsightIcon, label: "Answer optimization", title: "Make your expertise easier to quote", text: "Clear answer blocks, FAQ structure, source support, and citability checks for traditional and AI answer engines." },
  { icon: GlobeIcon, label: "AI search visibility", title: "See where your brand shows up—and where it does not", text: "Crawler access, entity signals, tracked prompts, competitive answer share, and practical steps to close visibility gaps." },
  { icon: CodeBlockIcon, label: "Implementation", title: "Hand off changes without losing the reasoning", text: "Copy-ready prompts for coding agents, precise instructions for your team, or direct publishing when you authorize it." },
  { icon: RefreshIcon, label: "Monitoring", title: "Keep learning after the work ships", text: "Fresh checks and concise reports connect every action to what moved, what stalled, and what deserves attention next." },
] as const;

function Deliverables() {
  return (
    <section className={styles.deliverablesSection}>
      <div className="mx-auto max-w-[90rem] px-5 sm:px-8 lg:px-12">
        <SectionHeading
          inverse
          eyebrow="What Claudia can own"
          title="One employee who remembers how all the work connects."
          description="Research does not disappear before writing starts. Strategy does not get lost during implementation. Claudia keeps the context and follows the work through."
        />
        <div className={styles.deliverableList}>
          {deliverables.map((item, index) => (
            <article key={item.title} className={styles.deliverableRow}>
              <span className="tabular-nums">{String(index + 1).padStart(2, "0")}</span>
              <div className={styles.deliverableIcon}><item.icon className="size-5" /></div>
              <p className={styles.deliverableLabel}>{item.label}</p>
              <h3>{item.title}</h3>
              <p className={styles.deliverableText}>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const steps = [
  { title: "Share your site", text: "Claudia maps your brand, audience, and competitors. You correct anything she missed." },
  { title: "Set the guardrails", text: "Choose what she can do automatically and what should always wait for your approval." },
  { title: "Review the next move", text: "See the priority, reasoning, evidence, deliverable, and one clear decision." },
  { title: "Watch the outcome", text: "Ship through a connected platform or use the handoff. Claudia rechecks and continues the loop." },
] as const;

export function HowItWorks() {
  return (
    <section id="how-it-works" className={styles.howSection}>
      <div className="mx-auto max-w-[90rem] px-5 sm:px-8 lg:px-12">
        <div className={styles.howGrid}>
          <div>
            <SectionHeading
              eyebrow="How it works"
              title="Set up your AI employee in three minutes."
              description="You decide what Claudia may handle and what needs your approval. She works independently inside those boundaries and shows you what she is doing."
            />
            <Link href="/login" className={styles.textLink}>
              Set up your brand <ArrowRightIcon className="size-4" />
            </Link>
          </div>
          <ol className={styles.steps}>
            {steps.map((step, index) => (
              <li key={step.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><h3>{step.title}</h3><p>{step.text}</p></div>
              </li>
            ))}
          </ol>
        </div>

        <OperatorWorkspace />
      </div>
    </section>
  );
}

function OperatorWorkspace() {
  return (
    <div className={styles.workspace}>
      <div className={styles.workspaceLead}>
        <p className={styles.eyebrow}>Live operator workspace</p>
        <h3>One priority.<br />The evidence beside it.</h3>
        <p>Claudia keeps the plan, work, approvals, and follow-up in one place, so you can manage outcomes instead of managing another tool.</p>
        <div className={styles.controlList}>
          {[
            { icon: AutomationIcon, title: "Auto-run", text: "Research and safe recurring checks" },
            { icon: UserInputIcon, title: "Ask first", text: "Brand, technical, and publishing decisions" },
            { icon: ShieldIcon, title: "Always traceable", text: "Evidence, actions, and outcomes" },
          ].map((item) => (
            <div key={item.title}>
              <item.icon className="size-5" />
              <span><strong>{item.title}</strong><small>{item.text}</small></span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.workspacePanel}>
        <div className={styles.workspaceHeader}>
          <div className="flex items-center gap-3">
            <Image alt="" className="size-9 object-contain" height={36} src="/claudia-bg-free-logo.png" width={36} />
            <div><strong>Claudia</strong><span>Working on your next move</span></div>
          </div>
          <p><span aria-hidden /> Live</p>
        </div>
        <div className={styles.workspaceBody}>
          <p className={styles.panelLabel}>Current priority</p>
          <h4>Refresh the comparison page already close to page one.</h4>
          <div className={styles.evidenceGrid}>
            <div><span>Why now</span><strong>Position 12</strong><p>Impressions are rising while clicks remain flat.</p></div>
            <div><span>Ready to ship</span><strong>5 changes</strong><p>Copy, metadata, links, schema, and handoff.</p></div>
          </div>
          <div className={styles.workTrace}>
            <p className={styles.panelLabel}>Work trace</p>
            {["Opportunity found", "Refresh prepared", "Approval requested", "Follow-up scheduled"].map((item, index) => (
              <div key={item}><CheckIcon className="size-3.5" /><span>{item}</span><small>{index < 2 ? "Done" : index === 2 ? "Waiting" : "Planned"}</small></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const freeItems = ["Automatic brand discovery", "First content opportunity", "Initial SEO, AEO, and GEO checklist"];
const paidItems = ["The same AI employee on every plan", "Research, writing, prepared fixes, and monitoring", "More capacity for useful work"];

export function Pricing() {
  const startingPrice = Math.min(...Object.values(plans).map((plan) => plan.price));
  return (
    <section id="pricing" className={styles.pricingSection}>
      <div className="mx-auto max-w-[90rem] px-5 sm:px-8 lg:px-12">
        <div className={styles.pricingGrid}>
          <SectionHeading
            eyebrow="Simple capacity pricing"
            title="Start with one job. Keep her on when you want work moving every week."
            description="Every paid plan includes the same Claudia and the same skills. You only choose how much work she can complete each month."
          />
          <div className={styles.priceCards}>
            <PriceCard title="Preview" price="$0" suffix="to get started" items={freeItems} href="/login" cta="Start free" />
            <PriceCard title="Operator plans" price={`$${startingPrice}`} suffix="per month" items={paidItems} href="/pricing" cta="Compare plans" primary />
          </div>
        </div>
      </div>
    </section>
  );
}

function PriceCard({ title, price, suffix, items, href, cta, primary = false }: { title: string; price: string; suffix: string; items: string[]; href: string; cta: string; primary?: boolean }) {
  return (
    <article className={cn(styles.priceCard, primary && styles.priceCardPrimary)}>
      <p>{title}</p>
      <div className={styles.price}><strong>{price}</strong><span>{suffix}</span></div>
      <ul>{items.map((item) => <li key={item}><CircleCheckIcon className="size-4" />{item}</li>)}</ul>
      <Link href={href} className={cn(buttonVariants({ variant: primary ? "primary" : "outline" }), "mt-8 w-full")}>{cta}</Link>
    </article>
  );
}

const faqs = [
  ["Is Claudia another SEO dashboard?", "No. Claudia is the AI employee inside SeoGeoAeo AI. She uses the data to choose and prepare work, then shows you the priority, evidence, deliverable, and outcome."],
  ["What does she actually deliver?", "Depending on the opportunity: an article draft, page refresh, technical fix, schema, implementation prompt, manual checklist, or monitoring report."],
  ["Do I need to understand SEO, AEO, or GEO?", "No. Claudia translates the analysis into a specific action and explains why it matters. The underlying evidence stays available when you want it."],
  ["Can Claudia publish changes?", "Yes, when you connect a supported destination and authorize it. Otherwise she provides copy-ready content or an exact handoff for your team."],
  ["How much control do I keep?", "You set guardrails by category. Safe recurring work can run automatically, while sensitive actions wait for approval. Every action remains visible."],
] as const;

export function Faq() {
  return (
    <section id="faq" className={styles.faqSection}>
      <div className="mx-auto grid max-w-[90rem] gap-16 px-5 sm:px-8 lg:grid-cols-[0.7fr_1.3fr] lg:px-12">
        <SectionHeading eyebrow="Frequently asked" title="What it means to put Claudia to work." description="She does the recurring work. You keep authority over the decisions that affect your brand and website." />
        <div className={styles.faqList}>
          {faqs.map(([question, answer]) => (
            <details key={question}>
              <summary><span>{question}</span><PlusIcon className="size-5" /></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className={styles.finalSection}>
      <div className={styles.finalInner}>
        <p className={styles.eyebrow}>Your first job is free</p>
        <h2 className="type-display">Put Claudia to work.<br /><span>See what she finds.</span></h2>
        <p>Give her your site and goals. She will learn the brand, assess your visibility, and show you the first job she would take on.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/login" className={styles.primaryCta}>Give Claudia a job <ArrowRightIcon className="size-4" /></Link>
          <Link href="/pricing" className={styles.finalSecondary}>View pricing</Link>
        </div>
        <Image aria-hidden alt="" className={styles.finalImage} height={600} src="/claudia-bg-free-logo.png" width={600} />
      </div>
    </section>
  );
}
