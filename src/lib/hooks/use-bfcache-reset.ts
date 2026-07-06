"use client";

import { useEffect, useRef } from "react";

/**
 * Reset stale in-flight UI state when the page is restored from the browser's
 * back/forward cache. A component that sets a "Redirecting…" loading state and
 * then hard-navigates away (e.g. to Stripe Checkout) is frozen with that state
 * still set; if the user presses Back, Safari/Firefox restore the page from
 * bfcache with the old React state intact, leaving the button disabled forever.
 * `pageshow` with `persisted: true` fires exactly on that restore.
 */
export function useBfcacheReset(reset: () => void) {
  const resetRef = useRef(reset);
  resetRef.current = reset;

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) resetRef.current();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
}
