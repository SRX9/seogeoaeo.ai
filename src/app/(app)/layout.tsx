"use client";

import { redirect, usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageError, PageLoader } from "@/components/feedback/states";
import { ApiError } from "@/lib/api/fetcher";
import { useMe } from "@/lib/api/queries";

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data, isLoading, error, refetch } = useMe();

  const unauthenticated = error instanceof ApiError && error.status === 401;
  const needsOnboarding = Boolean(data && data.brands.length === 0 && pathname !== "/onboarding");

  if (unauthenticated) {
    redirect("/login");
  }

  if (needsOnboarding) {
    redirect("/onboarding");
  }

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <PageLoader label="Loading your workspace…" />
      </div>
    );
  }

  // Onboarding is a fullscreen, distraction-free flow: no sidebar/shell.
  if (error || !data) {
    return (
      <div className="min-h-screen">
        <PageError error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  if (pathname === "/onboarding") {
    return <>{children}</>;
  }

  return (
    <AppShell user={data.user} brands={data.brands} activeBrandId={data.activeBrandId}>
      {children}
    </AppShell>
  );
}
