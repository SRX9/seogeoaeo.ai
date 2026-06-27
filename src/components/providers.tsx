"use client";

import { RouterProvider } from "@heroui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

/**
 * Client-side data layer. The whole app fetches through React Query talking
 * directly to /api routes — there is no server-component data fetching.
 */
export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Keep fetched data "fresh" for 5 min so switching back to a page
            // renders from cache instead of refetching + showing a spinner.
            staleTime: 5 * 60_000,
            // Hold cached pages in memory for 10 min after they go unused.
            gcTime: 10 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  // Wire HeroUI/react-aria link navigation (e.g. `href` on Table rows) to
  // Next's client router so navigable collections do SPA transitions instead
  // of full-page loads. Uses HeroUI's re-exported RouterProvider so it shares
  // the same react-aria context instance the components consume.
  return (
    <RouterProvider navigate={(path) => router.push(path)}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </RouterProvider>
  );
}
