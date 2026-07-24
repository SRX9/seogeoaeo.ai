"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRightIcon, MenuIcon, SgaLogo, XIcon } from "@/components/icons";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/cn";
import { NAV_LINKS } from "@/lib/site";

type SiteHeaderProps = {
  className?: string;
  variant?: "default" | "overlay";
};

export function SiteHeader({ className, variant = "default" }: SiteHeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: session } = authClient.useSession();

  useEffect(() => {
    const updateScrollState = () => setScrolled(window.scrollY > 24);
    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollState);
  }, []);

  const overHero = variant === "overlay" && !scrolled && !menuOpen;

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 bg-transparent transition-colors duration-300",
        overHero ? "text-white" : "text-foreground",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto flex items-center justify-between transition-[width,max-width,height,margin,background-color,box-shadow,padding] duration-300",
          overHero
            ? "h-[4.75rem] w-full max-w-[90rem] px-5 sm:px-8 lg:px-12"
            : variant === "overlay"
              ? "mt-3 h-16 w-[calc(100%-1.5rem)] max-w-[88rem] rounded-xl bg-background/84 px-4 shadow-[0_0_0_1px_color-mix(in_oklab,var(--border)_68%,transparent),0_12px_40px_-20px_rgb(0_0_0/0.38)] backdrop-blur-2xl sm:w-[calc(100%-2rem)] sm:px-6 lg:px-8"
              : "h-[4.75rem] w-full max-w-none bg-background/92 px-5 shadow-[0_1px_0_color-mix(in_oklab,var(--border)_65%,transparent)] backdrop-blur-xl sm:px-8 lg:px-12",
        )}
      >
        <Link
          href="/"
          aria-label="SeoGeoAeo AI home"
          className={cn(
            "rounded-md outline-none transition-[opacity,transform] hover:opacity-80 active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-current",
            overHero && "[&_div]:text-white [&_span]:text-white/55",
          )}
        >
          <SgaLogo iconClassName="size-8" />
        </Link>

        <nav aria-label="Primary navigation" className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current",
                overHero ? "text-white/68 hover:text-white" : "text-muted hover:text-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href={session ? "/dashboard" : "/login"}
            className={cn(
              "hidden min-h-11 items-center px-3 text-sm font-medium transition-colors sm:inline-flex",
              overHero ? "text-white/72 hover:text-white" : "text-muted hover:text-foreground",
            )}
          >
            {session ? "Dashboard" : "Sign in"}
          </Link>
          <Link
            href={session ? "/dashboard" : "/login"}
            className={cn(
              "hidden min-h-11 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-[background-color,color,transform] active:scale-[0.96] sm:inline-flex",
              overHero ? "bg-white text-zinc-950 hover:bg-white/88" : "bg-foreground text-background hover:opacity-88",
            )}
          >
            {session ? "Open workspace" : "Start free"}
            <ArrowRightIcon className="size-4" />
          </Link>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            onClick={() => setMenuOpen((open) => !open)}
            className={cn(
              "relative grid size-11 place-items-center rounded-md transition-[background-color,transform] active:scale-[0.96] lg:hidden",
              overHero ? "bg-white/10 text-white backdrop-blur-md" : "bg-default text-foreground",
            )}
          >
            <MenuIcon className={cn("size-5 transition-[opacity,scale,filter]", menuOpen && "scale-25 opacity-0 blur-sm")} />
            <XIcon className={cn("absolute size-5 scale-25 opacity-0 blur-sm transition-[opacity,scale,filter]", menuOpen && "scale-100 opacity-100 blur-none")} />
          </button>
        </div>
      </div>

      <div
        className={cn(
          "grid overflow-hidden bg-background transition-[grid-template-rows,opacity,margin,box-shadow,border-radius] duration-300 lg:hidden",
          variant === "overlay" && "mx-3 mt-2 rounded-xl shadow-[0_0_0_1px_color-mix(in_oklab,var(--border)_68%,transparent),0_18px_45px_-24px_rgb(0_0_0/0.45)] sm:mx-4",
          menuOpen ? "grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0">
          <nav aria-label="Mobile navigation" className="mx-5 border-t border-border py-4 sm:mx-8">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="flex min-h-12 items-center justify-between border-b border-border/60 text-base font-medium text-foreground"
              >
                {link.label}
                <ArrowRightIcon className="size-4 text-muted" />
              </Link>
            ))}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Link href="/login" className="grid min-h-11 place-items-center rounded-md border border-border text-sm font-semibold text-foreground">
                Sign in
              </Link>
              <Link href="/login" className="grid min-h-11 place-items-center rounded-md bg-foreground text-sm font-semibold text-background">
                Start free
              </Link>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
