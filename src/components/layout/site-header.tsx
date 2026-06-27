import { buttonVariants } from "@heroui/react/button";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/cn";
import { SgaLogo } from "@/components/icons";

type SiteHeaderProps = {
  className?: string;
};

export function SiteHeader({ className }: SiteHeaderProps) {
  return (
    <header
      className={cn("border-b border-border bg-surface backdrop-blur", className)}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/">
          <SgaLogo />
        </Link>
        <nav className="flex items-center gap-3">
          <Link href="/#pricing" className="hidden text-sm text-muted hover:text-foreground sm:block">
            Pricing
          </Link>
          <ThemeToggle />
          <Link href="/login" className="text-sm text-muted hover:text-foreground">
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
