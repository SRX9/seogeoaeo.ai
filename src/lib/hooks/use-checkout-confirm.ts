"use client";

import { useEffect, useRef, useState } from "react";
import { apiPost } from "@/lib/api/fetcher";

/**
 * Confirm a Checkout Session on the browser's return from Stripe: POST the
 * `?session_id` to `/api/billing/checkout/confirm` exactly once, then let the
 * caller refresh its data. Errors are swallowed — the webhook (and any
 * caller-side polling) is the fallback activation path. `reset` re-arms the
 * one-shot guard for retry flows.
 */
export function useCheckoutConfirm({
  sessionId,
  enabled = true,
  onSettled,
}: {
  sessionId: string | null;
  enabled?: boolean;
  onSettled: () => void;
}) {
  const attemptedRef = useRef(false);
  // Bumped by reset() so the effect below re-fires on retry — clearing the
  // guard alone would never re-run an effect whose deps haven't changed.
  const [attempt, setAttempt] = useState(0);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useEffect(() => {
    if (!enabled || !sessionId || attemptedRef.current) return;
    attemptedRef.current = true;
    void apiPost("/api/billing/checkout/confirm", { sessionId })
      .catch(() => undefined)
      .then(() => onSettledRef.current());
  }, [enabled, sessionId, attempt]);

  return {
    reset: () => {
      attemptedRef.current = false;
      setAttempt((value) => value + 1);
    },
  };
}
