"use client";

import type { ReactNode } from "react";
import type { SessionUser } from "@/lib/auth/session";
import { BrandCapsule } from "@/components/layout/brand-capsule";
import { AgentCommandMenu } from "@/components/layout/agent-command-menu";
import { FloatingAgentDock } from "@/components/layout/floating-agent-dock";
import { WorkshopBanner } from "@/components/layout/workshop-banner";

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
  return (
    <div className="app-shell min-h-screen bg-background">
      <BrandCapsule user={user} brands={brands} activeBrandId={activeBrandId} />
      <main className="app-shell-content mx-auto w-full max-w-7xl px-5 pt-24 sm:px-8 lg:px-10">
        <WorkshopBanner />
        {children}
      </main>
      <FloatingAgentDock />
      <AgentCommandMenu />
    </div>
  );
}
