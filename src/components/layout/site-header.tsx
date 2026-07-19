"use client";

import { buttonVariants } from "@heroui/react/button";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/cn";
import { SgaLogo } from "@/components/icons";
import { NAV_LINKS } from "@/lib/site";

type SiteHeaderProps = {
  className?: string;
};

function subscribeToScroll(onStoreChange: () => void) {
  window.addEventListener("scroll", onStoreChange, { passive: true });
  return () => window.removeEventListener("scroll", onStoreChange);
}

function getScrolledSnapshot() {
  return window.scrollY > 8;
}

function getServerScrolledSnapshot() {
  return false;
}

export function SiteHeader({ className }: SiteHeaderProps) {
  const scrolled = useSyncExternalStore(
    subscribeToScroll,
    getScrolledSnapshot,
    getServerScrolledSnapshot,
  );
  // Logged-in visitors get a single "Open dashboard" CTA instead of the
  // sign-in/sign-up pair. While the session is resolving we keep the logged-out
  // CTAs (the common case for a marketing page) to avoid a layout jump.
  const { data: session } = authClient.useSession();

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-[background-color,border-color,box-shadow,backdrop-filter,height] duration-ui ease-out-strong",
        scrolled
          ? "material-chrome scroll-edge relative border-transparent"
          : "border-b border-transparent bg-transparent",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto flex max-w-6xl items-center justify-between px-4 transition-[height] duration-ui ease-out-strong",
          scrolled ? "h-14" : "h-20",
        )}
      >
        <Link
          href="/"
          aria-label="seogeoaeo.ai home"
          className={cn(
            "origin-left rounded-lg transition-transform duration-ui ease-out-strong motion-reduce:transition-none",
            scrolled ? "scale-[0.88]" : "scale-100",
          )}
        >
          <SgaLogo />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <div className="mr-2 hidden items-center gap-0.5 lg:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="pressable rounded-full px-3 py-2 text-sm font-medium tracking-[0.01em] text-muted hover-fine:bg-default/50 hover-fine:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <ThemeToggle />
          {session ? (
            <Link href="/dashboard" className={buttonVariants()}>
              Open Claudia
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: "ghost" }), "hidden sm:inline-flex")}
              >
                Sign in
              </Link>
              <Link href="/login" className={buttonVariants()}>
                Hire Claudia
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
