"use client";

import { AppLayout } from "@heroui-pro/react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth/session";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import { AgentCommandMenu } from "@/components/layout/agent-command-menu";
import { AppNavbar } from "@/components/layout/app-navbar";
import { AppSidebar } from "@/components/layout/app-sidebar";

type BrandOption = {
  id: string;
  name: string;
  identity?: { logoUrl: string | null; colors: Array<{ hex: string }> } | null;
};

export function AppShell({
  children,
  user,
  brands,
  activeBrandId,
}: {
  children: ReactNode;
  user: SessionUser;
  brands: BrandOption[];
  activeBrandId: string | null;
}) {
  const [isCommandOpen, setCommandOpen] = useState(false);
  const router = useProgressRouter();
  const navigate = useCallback((href: string) => router.push(href), [router]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <AppLayout
      className="app-shell"
      navbar={
        <AppNavbar firstName={user.name.trim().split(/\s+/)[0] || "there"} />
      }
      navigate={navigate}
      sidebar={
        <AppSidebar
          user={user}
          brands={brands}
          activeBrandId={activeBrandId}
          onOpenCommand={() => setCommandOpen(true)}
        />
      }
      sidebarCollapsible="offcanvas"
    >
      {children}
      <AgentCommandMenu isOpen={isCommandOpen} onOpenChange={setCommandOpen} />
    </AppLayout>
  );
}
