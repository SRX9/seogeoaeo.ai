"use client";

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";

type OptimisticMutationConfig<TData, TVariables, TCache> = {
  mutationFn: (variables: TVariables) => Promise<TData>;
  /**
   * The cache entry to update the instant the user clicks, so the UI reflects
   * the change immediately instead of waiting for the follow-up GET.
   */
  queryKey: QueryKey;
  /** Compute the next cache value from the current value and the mutation input. */
  optimisticUpdate: (current: TCache | undefined, variables: TVariables) => TCache | undefined;
  /**
   * Extra query keys to refetch once the server confirms, to reconcile any
   * server-derived fields (generated ids, timestamps, version bumps, …).
   */
  invalidateKeys?: QueryKey[];
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
};

/**
 * A mutation that updates the React Query cache up front so the UI responds on
 * click, then reconciles with the server in the background.
 *
 * The whole app renders from the query cache (see {@link file://./queries.ts}),
 * so a plain `invalidateQueries`-only mutation leaves the old value on screen
 * until a fresh GET round-trips — a visible 2-3s lag. This applies the canonical
 * TanStack optimistic pattern: cancel in-flight refetches, snapshot, write the
 * optimistic value, roll back on error, and invalidate on settle to reconcile.
 */
export function useOptimisticMutation<TData, TVariables, TCache>(
  config: OptimisticMutationConfig<TData, TVariables, TCache>,
) {
  const queryClient = useQueryClient();

  return useMutation<TData, Error, TVariables, { previous: TCache | undefined }>({
    mutationFn: config.mutationFn,
    onMutate: async (variables) => {
      // Stop any in-flight refetch so it can't clobber our optimistic write.
      await queryClient.cancelQueries({ queryKey: config.queryKey });
      const previous = queryClient.getQueryData<TCache>(config.queryKey);
      queryClient.setQueryData<TCache>(config.queryKey, (current) =>
        config.optimisticUpdate(current, variables),
      );
      return { previous };
    },
    onError: (error, variables, context) => {
      // Roll back to the snapshot taken before the optimistic write.
      queryClient.setQueryData(config.queryKey, context?.previous);
      config.onError?.(error, variables);
    },
    onSuccess: (data, variables) => {
      config.onSuccess?.(data, variables);
    },
    onSettled: () => {
      // Reconcile the optimistic value with server truth.
      queryClient.invalidateQueries({ queryKey: config.queryKey });
      for (const key of config.invalidateKeys ?? []) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}
