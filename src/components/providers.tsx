"use client";

import { RouterProvider } from "@heroui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, useCallback, useState, type ReactNode } from "react";
import {
  NavigationProgress,
  useProgressRouter,
} from "@/components/feedback/navigation-progress";
import { ApiError } from "@/lib/api/fetcher";
import { queryPolicy } from "@/lib/api/query-policy";

function retryTransientFailure(failureCount: number, error: unknown) {
  if (failureCount >= 1) return false;
  if (!(error instanceof ApiError)) return true;
  return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;
}

/**
 * Client-side data layer. The whole app fetches through React Query talking
 * directly to /api routes: there is no server-component data fetching.
 */
export function Providers({ children }: { children: ReactNode }) {
  const router = useProgressRouter();
  const navigate = useCallback((path: string) => router.push(path), [router]);
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Individual queries override this by data nature. This is the safe
            // fallback for any new working-data query.
            ...queryPolicy.working,
            retry: retryTransientFailure,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },
          mutations: {
            // Writes are never replayed implicitly; the UI can offer an
            // explicit retry when an operation is safe to repeat.
            retry: false,
          },
        },
      }),
  );

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
