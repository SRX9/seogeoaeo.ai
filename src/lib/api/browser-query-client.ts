import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/fetcher";
import { queryPolicy } from "@/lib/api/query-policy";

function retryTransientFailure(failureCount: number, error: unknown) {
  if (failureCount >= 1) return false;
  if (!(error instanceof ApiError)) return true;
  return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;
}

export function createBrowserQueryClient() {
  return new QueryClient({
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
  });
}
