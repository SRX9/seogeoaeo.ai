import Link from "next/link";
import { SgaLogo } from "@/components/icons";
import { FOOTER_LINKS, SITE_NAME } from "@/lib/site";

/** Shared marketing footer for the public pages (landing, pricing, legal). */
export function SiteFooter() {
  return (
    <footer className="bg-[#111214] text-white">
      <div className="mx-auto max-w-[90rem] px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <SgaLogo className="flex items-center gap-2.5 [&_div]:text-white [&_span]:text-white/55" />
            <p className="mt-5 text-sm leading-6 text-white/45">
              SeoGeoAeo AI gives your business Claudia, an AI employee who finds,
              prepares, and follows up on organic growth work.
            </p>
          </div>

          {FOOTER_LINKS.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-semibold uppercase tracking-[0.13em] text-white/45">
                {group.title}
              </h3>
              <ul className="mt-4 space-y-3">
                {group.links.map((link) => (
                  <li key={`${group.title}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="pressable inline-block rounded-md text-sm text-white/65 hover-fine:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-3 border-t border-white/12 pt-6 text-sm text-white/38 sm:flex-row">
          <span suppressHydrationWarning>
            © {new Date().getFullYear()} {SITE_NAME}
          </span>
          <span className="text-xs tracking-[0.02em]">Your AI employee for organic growth</span>
        </div>
      </div>
    </footer>
  );
}
