import { QueryClient } from "@tanstack/react-query";
import { queryPolicy } from "@/lib/api/query-policy";

type QueryPolicy = (typeof queryPolicy)[keyof typeof queryPolicy];

/** A fresh cache per Server Component request; never shared across users. */
export function createServerQueryClient(policy: QueryPolicy = queryPolicy.working) {
  return new QueryClient({ defaultOptions: { queries: policy } });
}

