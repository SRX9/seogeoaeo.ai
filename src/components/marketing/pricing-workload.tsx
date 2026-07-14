"use client";

import Link from "next/link";
import { useState } from "react";
import { planFeatureList, plans, type PlanId } from "@/lib/billing/plans";
import styles from "./pricing-workload.module.css";

type BillingCycle = "monthly" | "annual";

const planOrder: PlanId[] = ["indie", "startup", "scale", "enterprise"];

const planMessages: Record<PlanId, string> = {
  indie: "Perfect for getting started with AI visibility.",
  startup: "Grow organic visibility and strengthen authority.",
  scale: "Expand reach and dominate your niche.",
  enterprise: "Industry leadership with maximum coverage.",
};

function PlanGlyph({ planId }: { planId: PlanId }) {
  if (planId === "startup") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="m3 17 6-6 4 4 8-9M16 6h5v5" />
      </svg>
    );
  }
  if (planId === "scale") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="1" />
      </svg>
    );
  }
  if (planId === "enterprise") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M4 21V8h9v13M13 12h7v9M7 11h2M7 15h2M7 19h2M16 15h1M16 18h1M2 21h20" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3.5 14.2 9l5.5 2.2-5.5 2.2L12 19l-2.2-5.6-5.5-2.2L9.8 9zM19 3v4M21 5h-4" />
    </svg>
  );
}

function TrustIcon({ kind }: { kind: "review" | "citation" | "secure" }) {
  if (kind === "citation") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M9.5 14.5 14.5 9M7 16.5l-1.5 1.5a4 4 0 0 1-5.5-5.8l3.4-3.4a4 4 0 0 1 5.6 0M17 7.5 18.5 6A4 4 0 0 1 24 11.8l-3.4 3.4a4 4 0 0 1-5.6 0" />
      </svg>
    );
  }
  if (kind === "secure") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2.8 20 6v5.3c0 5-3.2 8.3-8 9.9-4.8-1.6-8-4.9-8-9.9V6z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function DockIcon({ kind }: { kind: "home" | "work" | "pricing" | "account" }) {
  if (kind === "work") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </svg>
    );
  }
  if (kind === "pricing") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M20 13 13 20 4 11V4h7z" />
        <circle cx="8.5" cy="8.5" r="1" />
      </svg>
    );
  }
  if (kind === "account") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="m3 11 9-8 9 8v10h-6v-6H9v6H3z" />
    </svg>
  );
}

export function PricingWorkload() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden>
        <span className={styles.waveLeft} />
        <span className={styles.waveRight} />
      </div>

      <section className={styles.content} aria-labelledby="pricing-heading">
        <div className={styles.eyebrow}><span />Plans</div>
        <h1 id="pricing-heading">Choose Claudia&apos;s workload</h1>

        <div className={styles.cycleRow}>
          <div className={styles.cycleControl} role="group" aria-label="Billing cycle">
            <button
              type="button"
              className={cycle === "monthly" ? styles.cycleActive : undefined}
              aria-pressed={cycle === "monthly"}
              onClick={() => setCycle("monthly")}
            >
              Monthly
            </button>
            <button
              type="button"
              className={cycle === "annual" ? styles.cycleActive : undefined}
              aria-pressed={cycle === "annual"}
              onClick={() => setCycle("annual")}
            >
              Annual
            </button>
          </div>
          <span className={styles.savings}>Save up to 20%</span>
        </div>

        <div className={styles.planGrid}>
          {planOrder.map((id) => {
            const plan = plans[id];
            const featured = id === "startup";
            const price = cycle === "annual" ? Math.round(plan.price * 0.8) : plan.price;
            return (
              <article key={id} className={`${styles.planCard} ${featured ? styles.featured : ""}`}>
                {featured ? <span className={styles.popular}>Most popular</span> : null}
                <h2>{plan.name}</h2>
                <p className={styles.price}>
                  <span className={styles.currency}>$</span>
                  <strong>{price}</strong>
                  <span className={styles.per}>/mo</span>
                </p>
                <div className={styles.allowance}>
                  <strong>{plan.monthlyCredits.toLocaleString()}</strong>
                  <span>credits/month</span>
                </div>
                <div
                  className={`${styles.message} ${
                    id === "scale"
                      ? styles.messageScale
                      : id === "enterprise"
                        ? styles.messageEnterprise
                        : ""
                  }`}
                >
                  <span className={styles.glyph}><PlanGlyph planId={id} /></span>
                  <p>{planMessages[id]}</p>
                </div>
                <Link
                  href={`/login?plan=${id}&billing=${cycle}`}
                  className={`${styles.choose} ${featured ? styles.chooseFeatured : ""}`}
                >
                  Choose {plan.name}
                </Link>
              </article>
            );
          })}
        </div>

        <div className={styles.trustStrip}>
          <strong>Every paid hire includes</strong>
          <span><TrustIcon kind="review" />Owner-reviewed answers</span>
          <span><TrustIcon kind="citation" />Trusted citations</span>
          <span><TrustIcon kind="secure" />Secure &amp; private by design</span>
        </div>

        <details className={styles.details}>
          <summary className={styles.compare}>
            Compare all details
            <svg viewBox="0 0 24 24" aria-hidden><path d="m7 9 5 5 5-5" /></svg>
          </summary>
          <div className={styles.detailGrid}>
            {planOrder.map((id) => (
              <section key={id}>
                <h3>{plans[id].name}</h3>
                <ul>
                  {planFeatureList(id).map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
              </section>
            ))}
          </div>
        </details>
      </section>

      <nav className={styles.dock} aria-label="Public navigation">
        <div className={styles.dockSurface}>
          <Link href="/" className={styles.dockItem}><DockIcon kind="home" /><span>Home</span></Link>
          <Link href="/#how-it-works" className={styles.dockItem}><DockIcon kind="work" /><span>How it works</span></Link>
          <Link href="/pricing" className={`${styles.dockItem} ${styles.dockActive}`} aria-current="page"><DockIcon kind="pricing" /><span>Pricing</span><i /></Link>
          <Link href="/login" className={styles.dockItem}><DockIcon kind="account" /><span>Sign in</span></Link>
          <span className={styles.dockDivider} aria-hidden />
          <Link href="/login" className={styles.hire}><PlanGlyph planId="indie" />Hire Claudia</Link>
        </div>
      </nav>
    </main>
  );
}
