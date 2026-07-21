"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "@/app/help/integrations/publishing-guide-page.module.css";

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.7 9.1a2.5 2.5 0 0 1 4.8.9c0 1.8-2.5 2.1-2.5 3.7M12 17h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const links = [
  { label: "Quick setup", href: "#quick-setup", active: true },
  { label: "Secret safety", href: "#secret-safety", active: false },
  { label: "Provider comparison", href: "#provider-comparison", active: false },
  { label: "Troubleshooting", href: "#troubleshooting", active: false },
] as const;

export function PublishingGuideContents() {
  const [open, setOpen] = useState(true);

  return (
    <div className={styles.contentsColumn}>
      <button
        className={styles.contentsTrigger}
        type="button"
        aria-expanded={open}
        aria-controls="publishing-guide-contents"
        onClick={() => setOpen((value) => !value)}
      >
        <ListIcon />
        Contents
      </button>

      {open ? (
        <aside id="publishing-guide-contents" className={styles.contentsPopover} aria-label="Page contents">
          <div className={styles.contentsHeader}>
            <h2>Contents</h2>
            <button type="button" aria-label="Close contents" onClick={() => setOpen(false)}>
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <nav className={styles.contentsNav} aria-label="On this page">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={link.active ? styles.activeContentsLink : styles.contentsLink}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <Link className={styles.stillNeedHelp} href="/contact">
            <HelpIcon />
            Still need help?
          </Link>
        </aside>
      ) : null}
    </div>
  );
}
