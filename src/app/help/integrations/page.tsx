import type { Metadata } from "next";
import Link from "next/link";
import { InsightIcon } from "@/components/icons";
import { PublishingGuideContents } from "@/components/integrations/publishing-guide-contents";
import { SITE_URL } from "@/lib/site";
import styles from "./publishing-guide-page.module.css";

export const metadata: Metadata = {
  title: "Publishing Integration Setup Guide",
  description:
    "Connect your preferred publishing platform in a few simple, secure steps.",
  alternates: { canonical: `${SITE_URL}/help/integrations` },
};

type IconProps = {
  className?: string;
};

function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h13M14 7l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MessageIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 11.5a8 8 0 0 1-8.5 8A8.7 8.7 0 0 1 7.8 18L3 19l1.2-4.3A8 8 0 1 1 20 11.5Z" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BoltIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m13.5 2.8-8 11.1h5.8l-.8 7.3 8-11.1h-5.8l.8-7.3Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LinkIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m9.1 14.9-1.5 1.5a3.75 3.75 0 0 1-5.3-5.3l3.1-3.2a3.75 3.75 0 0 1 5.3 0M14.9 9.1l1.5-1.5a3.75 3.75 0 0 1 5.3 5.3l-3.1 3.2a3.75 3.75 0 0 1-5.3 0M8.6 15.4l6.8-6.8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function KeyIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14.2 8.8a5 5 0 1 1-2.9-4.5 5 5 0 0 1 2.9 4.5Zm0 0L22 16.6v2.5h-2.7v2.2h-2.7v-2.2h-2.7v-2.5h-2.1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7.2" cy="8.8" r="1" fill="currentColor" />
    </svg>
  );
}

function CheckIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="m8.2 12 2.5 2.5 5.3-5.3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.2 19 6v5.2c0 4.4-2.7 7.6-7 9.6-4.3-2-7-5.2-7-9.6V6l7-2.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function HomeIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m4 10 8-7 8 7v10h-6v-6h-4v6H4V10Z" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GearIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9.7 3.4 10.4 2h3.2l.7 1.4 1.5.6 1.5-.5 2.2 2.2-.5 1.5.6 1.5 1.4.7v3.2l-1.4.7-.6 1.5.5 1.5-2.2 2.2-1.5-.5-1.5.6-.7 1.4h-3.2l-.7-1.4-1.5-.6-1.5.5-2.2-2.2.5-1.5-.6-1.5-1.4-.7V9.4l1.4-.7.6-1.5-.5-1.5 2.2-2.2 1.5.5 1.5-.6Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
      <circle cx="12" cy="11" r="3.1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function TagIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3.5 5.5v6.2L12.8 21l8.2-8.2-9.3-9.3H5.5a2 2 0 0 0-2 2Z" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.25" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function UserIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="7.5" r="4" stroke="currentColor" strokeWidth="1.55" />
      <path d="M4.5 21c.7-4.2 3.2-6.3 7.5-6.3s6.8 2.1 7.5 6.3" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
    </svg>
  );
}

const setupSteps = [
  {
    title: "Connect your platform",
    description: "Choose your platform and authorize the connection.",
    icon: LinkIcon,
  },
  {
    title: "Add your secret key",
    description: "Add your API key or token to secure the integration.",
    icon: KeyIcon,
  },
  {
    title: "Test and publish",
    description: "Run a quick test, then start publishing content.",
    icon: CheckIcon,
  },
] as const;

const dockLinks = [
  { label: "Home", href: "/", icon: HomeIcon, active: true },
  { label: "How it works", href: "/#how-it-works", icon: GearIcon, active: false },
  { label: "Pricing", href: "/pricing", icon: TagIcon, active: false },
  { label: "Sign in", href: "/login", icon: UserIcon, active: false },
] as const;

export default function IntegrationsHelpPage() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="publishing-guide-title">
          <div className={styles.heroCopy}>
            <div className={styles.helpBadge}>
              <span aria-hidden="true" />
              Help
            </div>
            <h1 id="publishing-guide-title" className={styles.title}>
              Publishing integration
              <br />
              setup guide
            </h1>
            <p className={styles.lede}>
              Connect your preferred platform in just a few steps
              <br className={styles.desktopBreak} /> to start publishing with Claudia.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primaryAction} href="/settings?tab=integrations">
                Open settings
                <ArrowRightIcon className={styles.actionIcon} />
              </Link>
              <Link className={styles.secondaryAction} href="/contact">
                <MessageIcon className={styles.messageIcon} />
                Contact support
              </Link>
            </div>
          </div>
          <PublishingGuideContents />
        </section>

        <section id="quick-setup" className={styles.quickCard} aria-labelledby="quick-setup-title">
          <header className={styles.quickHeader}>
            <span className={styles.headerIcon}>
              <BoltIcon />
            </span>
            <span>
              <h2 id="quick-setup-title">Quick setup</h2>
              <p>Get connected and publishing in three simple steps.</p>
            </span>
          </header>

          <ol className={styles.steps}>
            {setupSteps.map((step, index) => {
              const StepIcon = step.icon;
              return (
                <li key={step.title} className={styles.step}>
                  <div className={styles.stepVisual}>
                    <span className={styles.stepNumber}>{index + 1}</span>
                    <span className={styles.stepIcon}>
                      <StepIcon />
                    </span>
                  </div>
                  <div className={styles.stepCopy}>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                  {index < setupSteps.length - 1 ? (
                    <ArrowRightIcon className={styles.stepArrow} />
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>

        <section id="secret-safety" className={styles.safetyCard} aria-labelledby="secret-safety-title">
          <span className={styles.safetyIcon}>
            <ShieldIcon />
          </span>
          <div className={styles.safetyCopy}>
            <h2 id="secret-safety-title">Secret safety</h2>
            <p>
              Your keys are encrypted and never shared. You can rotate or remove them anytime
              <br className={styles.desktopBreak} /> from your settings.
            </p>
          </div>
          <span className={styles.secureBadge}>Your data is secure</span>
        </section>

        <span id="provider-comparison" className={styles.anchorTarget} aria-hidden="true" />
        <span id="troubleshooting" className={styles.anchorTarget} aria-hidden="true" />
      </main>

      <nav className={styles.dock} aria-label="Primary navigation">
        <div className={styles.dockLinks}>
          {dockLinks.map((item) => {
            const DockIcon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={item.active ? styles.activeDockLink : styles.dockLink}
                aria-current={item.active ? "page" : undefined}
              >
                <DockIcon className={styles.dockIcon} />
                <span>{item.label}</span>
                {item.active ? <span className={styles.activeDot} aria-hidden="true" /> : null}
              </Link>
            );
          })}
        </div>
        <span className={styles.dockDivider} aria-hidden="true" />
        <Link className={styles.hireButton} href="/login">
          <InsightIcon className={styles.insightIcon} />
          Put Claudia to work
        </Link>
      </nav>
    </div>
  );
}
