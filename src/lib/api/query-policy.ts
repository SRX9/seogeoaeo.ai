/**
 * Cache lifetimes by data nature. Mutations explicitly invalidate or update
 * affected keys, so slowly-changing records can remain fresh much longer than
 * operational state without sacrificing correctness.
 */
export const queryPolicy = {
  /** Jobs, approvals and presence: background refresh when the tab is active. */
  live: {
    staleTime: 10_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  },
  /** Counts and balances that can change during normal use. */
  frequent: {
    staleTime: 30_000,
    gcTime: 15 * 60_000,
  },
  /** User-created working data such as topics, articles and findings. */
  working: {
    staleTime: 2 * 60_000,
    gcTime: 30 * 60_000,
  },
  /** Settings and connection metadata changed only by explicit mutations. */
  configuration: {
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
  },
  /** Generated snapshots that are refreshed on a known workflow cadence. */
  snapshot: {
    staleTime: 60 * 60_000,
    gcTime: 6 * 60 * 60_000,
  },
  /** Archived detail records never change after creation. */
  immutable: {
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 24 * 60 * 60_000,
  },
} as const;

