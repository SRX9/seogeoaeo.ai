import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppLayoutClient } from "@/components/layout/app-layout-client";
import { getMeData } from "@/lib/account/read-model";
import { queryKeys } from "@/lib/api/query-keys";
import { queryPolicy } from "@/lib/api/query-policy";
import { createServerQueryClient } from "@/lib/api/server-query-client";
import { getActiveBrandContext } from "@/lib/brand/context";

/**
 * Resolve the authenticated workspace during the RSC request and hydrate it
 * into TanStack Query. Brand-scoped page queries can now start on the first
 * client render instead of waiting for an extra `/api/me` round trip.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  let context: Awaited<ReturnType<typeof getActiveBrandContext>>;
  try {
    context = await getActiveBrandContext();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      redirect("/login");
    }
    throw error;
  }

  const me = await getMeData(context);
  const queryClient = createServerQueryClient(queryPolicy.configuration);
  queryClient.setQueryData(queryKeys.me, me);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AppLayoutClient>{children}</AppLayoutClient>
    </HydrationBoundary>
  );
}
