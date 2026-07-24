"use client";

import { redirect, usePathname } from "next/navigation";
import {
  HydrationBoundary,
  QueryClientProvider,
  type DehydratedState,
} from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import posthog from "posthog-js";
import { AppShell } from "@/components/layout/app-shell";
import { PageError, PageLoader } from "@/components/feedback/states";
import { createBrowserQueryClient } from "@/lib/api/browser-query-client";
import { ApiError } from "@/lib/api/fetcher";
import { useMe } from "@/lib/api/queries";

function AuthenticatedAppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data, isLoading, error, refetch } = useMe();

  const unauthenticated = error instanceof ApiError && error.status === 401;
  const needsOnboarding = Boolean(data && data.brands.length === 0 && pathname !== "/onboarding");

  useEffect(() => {
    if (data?.user.id) posthog.identify(data.user.id);
  }, [data?.user.id]);

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

/**
 * Authenticated data lives in a user-keyed QueryClient. Leaving this layout
 * destroys the session's cache; a different user can never observe its entries.
 */
export function AppLayoutClient({
  children,
  dehydratedState,
}: {
  children: ReactNode;
  dehydratedState: DehydratedState;
}) {
  const [queryClient] = useState(createBrowserQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={dehydratedState}>
        <AuthenticatedAppLayout>{children}</AuthenticatedAppLayout>
      </HydrationBoundary>
    </QueryClientProvider>
  );
}
