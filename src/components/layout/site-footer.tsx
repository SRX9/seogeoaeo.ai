import Link from "next/link";
import { SgaLogo } from "@/components/icons";
import { FOOTER_LINKS, SITE_NAME } from "@/lib/site";

/** Shared marketing footer for the public pages (landing, pricing, legal). */
export function SiteFooter() {
  return (
    <footer className="border-t border-border/40 bg-surface/30 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <SgaLogo />
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Measure your visibility across search and AI, fix the gaps, and publish
              optimized content automatically.
            </p>
          </div>

          {FOOTER_LINKS.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                {group.title}
              </h3>
              <ul className="mt-4 space-y-3">
                {group.links.map((link) => (
                  <li key={`${group.title}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="pressable inline-block rounded-md text-sm text-muted hover-fine:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border/40 pt-6 text-sm text-muted sm:flex-row">
          <span suppressHydrationWarning>
            © {new Date().getFullYear()} {SITE_NAME}
          </span>
          <span className="text-xs tracking-[0.02em]">Autonomous SEO, GEO &amp; AEO</span>
        </div>
      </div>
    </footer>
  );
}
