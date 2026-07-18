import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { DashboardPageClient } from "@/components/dashboard/dashboard-page-client";
import { queryKeys } from "@/lib/api/query-keys";
import { queryPolicy } from "@/lib/api/query-policy";
import { createServerQueryClient } from "@/lib/api/server-query-client";
import { requireBrand } from "@/lib/brand/context";
import { getDashboardData } from "@/lib/dashboard/read-model";

/** Render the Overview from server-loaded data with no browser fetch waterfall. */
export default async function DashboardPage() {
  const context = await requireBrand();
  const data = await getDashboardData(context);
  const queryClient = createServerQueryClient(queryPolicy.live);
  queryClient.setQueryData(queryKeys.dashboard, data);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardPageClient />
    </HydrationBoundary>
  );
}
