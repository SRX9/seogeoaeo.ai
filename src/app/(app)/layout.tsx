"use client";

import { redirect, usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageError, PageLoader } from "@/components/feedback/states";
import { ApiError } from "@/lib/api/fetcher";
import { useMe, usePrefetchAppData } from "@/lib/api/queries";

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data, isLoading, error, refetch } = useMe();

  const unauthenticated = error instanceof ApiError && error.status === 401;
  const needsOnboarding = Boolean(data && data.brands.length === 0 && pathname !== "/onboarding");

  // Once the workspace is ready, warm the other nav pages' data in the
  // background so switching to them is instant.
  usePrefetchAppData(Boolean(data) && !needsOnboarding && !unauthenticated);

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

  // Onboarding is a fullscreen, distraction-free flow — no sidebar/shell.
  if (pathname === "/onboarding") {
    return <>{children}</>;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen">
        <PageError error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <AppShell user={data.user} brands={data.brands} activeBrandId={data.activeBrandId}>
      {children}
    </AppShell>
  );
}
