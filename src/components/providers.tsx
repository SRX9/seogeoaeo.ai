"use client";

import { RouterProvider } from "@heroui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Suspense, useCallback, useState, type ReactNode } from "react";
import {
  NavigationProgress,
  useProgressRouter,
} from "@/components/feedback/navigation-progress";
import { createBrowserQueryClient } from "@/lib/api/browser-query-client";

/**
 * Persistent client-side data cache for live route data. The app shell still
 * uses server components for authenticated workspace bootstrap data.
 */
export function Providers({ children }: { children: ReactNode }) {
  const router = useProgressRouter();
  const navigate = useCallback((path: string) => router.push(path), [router]);
  const [client] = useState(createBrowserQueryClient);

  // Wire HeroUI/react-aria link navigation (e.g. `href` on Table rows) to
  // Next's client router so navigable collections do SPA transitions instead
  // of full-page loads. Uses HeroUI's re-exported RouterProvider so it shares
  // the same react-aria context instance the components consume.
  return (
    <RouterProvider navigate={navigate}>
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </RouterProvider>
  );
}
