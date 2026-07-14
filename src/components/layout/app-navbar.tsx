"use client";

import { AppLayout, Navbar, Sidebar } from "@heroui-pro/react";
import { usePathname } from "next/navigation";
import { appRouteTitle } from "@/components/layout/app-navigation";

export function AppNavbar({ firstName }: { firstName: string }) {
  const pathname = usePathname();
  const title = appRouteTitle(pathname, firstName);

  return (
    <Navbar className="app-navbar" maxWidth="xl">
      <Navbar.Header className="px-5">
        <AppLayout.MenuToggle />
        <Sidebar.Trigger />
        <h1 className="truncate text-xl font-semibold tracking-[-0.02em] text-foreground">
          {title}
        </h1>
      </Navbar.Header>
    </Navbar>
  );
}
