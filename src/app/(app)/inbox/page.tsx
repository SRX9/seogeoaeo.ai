import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { InboxPageClient } from "@/components/inbox/inbox-page-client";
import { queryKeys } from "@/lib/api/query-keys";
import { queryPolicy } from "@/lib/api/query-policy";
import { createServerQueryClient } from "@/lib/api/server-query-client";
import { requireBrand } from "@/lib/brand/context";
import { getInboxData } from "@/lib/inbox/read-model";

/** Render the decision inbox from one parallel server read graph. */
export default async function InboxPage() {
  const context = await requireBrand();
  const data = await getInboxData(context);
  const queryClient = createServerQueryClient(queryPolicy.live);
  queryClient.setQueryData(queryKeys.inbox, data);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <InboxPageClient />
    </HydrationBoundary>
  );
}
