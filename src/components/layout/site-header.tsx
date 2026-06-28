"use client";

import { buttonVariants } from "@heroui/react/button";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/cn";
import { SgaLogo } from "@/components/icons";
import { NAV_LINKS } from "@/lib/site";

type SiteHeaderProps = {
  className?: string;
};

export function SiteHeader({ className }: SiteHeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300 ease-out",
        scrolled
          ? "border-border bg-surface/70 shadow-sm backdrop-blur-md"
          : "border-transparent bg-transparent",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto flex max-w-6xl items-center justify-between px-4 transition-[height] duration-300 ease-out",
          scrolled ? "h-14" : "h-20",
        )}
      >
        <Link
          href="/"
          aria-label="seogeoaeo.ai home"
          className={cn(
            "origin-left transition-transform duration-300 ease-out",
            scrolled ? "scale-[0.88]" : "scale-100",
          )}
        >
          <SgaLogo />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <div className="mr-2 hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <ThemeToggle />
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "ghost" }), "hidden sm:inline-flex")}
          >
            Sign in
          </Link>
          <Link href="/login" className={buttonVariants()}>
            Get started free
          </Link>
        </nav>
      </div>
    </header>
  );
}
