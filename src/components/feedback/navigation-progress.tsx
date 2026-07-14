"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const NAVIGATION_PROGRESS_START = "seo-ai:navigation-progress-start";
const INITIAL_PROGRESS = 0.08;
const COMPLETE_AFTER_MS = 180;
const HIDE_AFTER_MS = 120;
const FAILSAFE_AFTER_MS = 15_000;

function isDifferentInternalUrl(href: string) {
  if (typeof window === "undefined") return false;

  try {
    const current = new URL(window.location.href);
    const target = new URL(href, current);

    return (
      target.origin === current.origin &&
      `${target.pathname}${target.search}` !== `${current.pathname}${current.search}`
    );
  } catch {
    return false;
  }
}

/** Signal an App Router navigation that does not originate from a link click. */
export function startNavigationProgress(href?: string) {
  if (typeof window === "undefined") return;
  if (href && !isDifferentInternalUrl(href)) return;
  window.dispatchEvent(new Event(NAVIGATION_PROGRESS_START));
}

/**
 * Drop-in App Router wrapper for programmatic page changes. Refreshes and
 * prefetches stay untouched because neither represents a new page URL.
 */
export function useProgressRouter() {
  const router = useRouter();

  return useMemo(
    () => ({
      ...router,
      push: (...args: Parameters<typeof router.push>) => {
        startNavigationProgress(args[0]);
        return router.push(...args);
      },
      replace: (...args: Parameters<typeof router.replace>) => {
        startNavigationProgress(args[0]);
        return router.replace(...args);
      },
    }),
    [router],
  );
}

function internalAnchorFromClick(event: MouseEvent) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return null;
  }

  const target = event.target;
  if (!(target instanceof Element)) return null;

  const anchor = target.closest<HTMLAnchorElement>("a[href]");
  if (
    !anchor ||
    anchor.hasAttribute("download") ||
    (anchor.target && anchor.target !== "_self")
  ) {
    return null;
  }

  return isDifferentInternalUrl(anchor.href) ? anchor : null;
}

/** A restrained, global page-transition indicator for the Next.js App Router. */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentUrl = `${pathname}?${searchParams.toString()}`;
  const previousUrlRef = useRef(currentUrl);
  const activeRef = useRef(false);
  const completingRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const trickleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failsafeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isVisible, setVisible] = useState(false);
  const [isCompleting, setCompleting] = useState(false);
  const [progress, setProgress] = useState(INITIAL_PROGRESS);

  const clearRunningTimers = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (trickleTimerRef.current !== null) {
      clearInterval(trickleTimerRef.current);
      trickleTimerRef.current = null;
    }
    if (failsafeTimerRef.current !== null) {
      clearTimeout(failsafeTimerRef.current);
      failsafeTimerRef.current = null;
    }
  }, []);

  const finishProgress = useCallback(() => {
    if (!activeRef.current) return;

    clearRunningTimers();
    completingRef.current = true;
    setCompleting(true);
    setProgress(1);

    completeTimerRef.current = setTimeout(() => {
      setVisible(false);
      hideTimerRef.current = setTimeout(() => {
        activeRef.current = false;
        completingRef.current = false;
        setCompleting(false);
        setProgress(INITIAL_PROGRESS);
      }, HIDE_AFTER_MS);
    }, COMPLETE_AFTER_MS);
  }, [clearRunningTimers]);

  const startProgress = useCallback(() => {
    if (completeTimerRef.current !== null) {
      clearTimeout(completeTimerRef.current);
      completeTimerRef.current = null;
    }
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    const isRestarting = completingRef.current;
    completingRef.current = false;
    activeRef.current = true;
    setCompleting(false);
    setVisible(true);
    if (isRestarting) setProgress(INITIAL_PROGRESS);

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;
      setProgress((current) => Math.max(current, 0.24));
    });

    if (trickleTimerRef.current === null) {
      trickleTimerRef.current = setInterval(() => {
        setProgress((current) => {
          if (current >= 0.92) return current;
          const remaining = 1 - current;
          return Math.min(0.92, current + remaining * (current < 0.55 ? 0.16 : 0.08));
        });
      }, 420);
    }

    if (failsafeTimerRef.current !== null) {
      clearTimeout(failsafeTimerRef.current);
    }
    failsafeTimerRef.current = setTimeout(finishProgress, FAILSAFE_AFTER_MS);
  }, [finishProgress]);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (internalAnchorFromClick(event)) startProgress();
    }

    document.addEventListener("click", onDocumentClick, true);
    window.addEventListener("popstate", startProgress);
    window.addEventListener(NAVIGATION_PROGRESS_START, startProgress);

    return () => {
      document.removeEventListener("click", onDocumentClick, true);
      window.removeEventListener("popstate", startProgress);
      window.removeEventListener(NAVIGATION_PROGRESS_START, startProgress);
    };
  }, [startProgress]);

  useEffect(() => {
    if (previousUrlRef.current === currentUrl) return;
    previousUrlRef.current = currentUrl;
    finishProgress();
  }, [currentUrl, finishProgress]);

  useEffect(
    () => () => {
      clearRunningTimers();
      if (completeTimerRef.current !== null) clearTimeout(completeTimerRef.current);
      if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
    },
    [clearRunningTimers],
  );

  return (
    <div
      aria-hidden={!isVisible}
      aria-label="Loading page"
      className="navigation-progress"
      data-completing={isCompleting}
      data-visible={isVisible}
      role="progressbar"
    >
      <span
        className="navigation-progress__bar"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}
