"use client";

import { AppLayout, Navbar, Sidebar } from "@heroui-pro/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserInputIcon } from "@/components/icons";
import { appRouteTitle } from "@/components/layout/app-navigation";
import { useDashboard, useInboxSummaryCount } from "@/lib/api/queries";

export function AppNavbar({ firstName }: { firstName: string }) {
  const pathname = usePathname();
  const title = appRouteTitle(pathname, firstName);
  const dashboard = useDashboard({ enabled: false });
  const shellCount = useInboxSummaryCount(pathname !== "/dashboard");
  const needsInputCount =
    pathname === "/dashboard"
      ? (dashboard.data?.home.needsInputCount ?? 0)
      : shellCount;

  return (
    <Navbar className="app-navbar" maxWidth="xl">
      <Navbar.Header className="gap-3 px-5">
        <AppLayout.MenuToggle />
        <Sidebar.Trigger />
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold tracking-[-0.02em] text-foreground">
          {title}
        </h1>
        {needsInputCount > 0 ? (
          <Link
            href="/dashboard#needs-input"
            className="flex min-h-11 shrink-0 items-center gap-2 text-sm font-medium text-warning no-underline transition-transform active:scale-[0.96] sm:min-h-10"
          >
            <UserInputIcon className="size-4" />
            <span className="hidden sm:inline">Needs your input</span>
            <span className="tabular-nums">· {needsInputCount}</span>
          </Link>
        ) : null}
      </Navbar.Header>
    </Navbar>
  );
}
