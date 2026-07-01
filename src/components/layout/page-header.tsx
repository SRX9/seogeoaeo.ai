"use client";

import { useCallback, useRef, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  /** Trailing controls (buttons, toggles) aligned to the end on wide screens. */
  actions?: ReactNode;
  /** Inline status chips / meta rendered under the description. */
  meta?: ReactNode;
  className?: string;
};

function createStickyHeaderStore() {
  let node: HTMLDivElement | null = null;
  let observer: IntersectionObserver | null = null;
  let stuck = false;
  const listeners = new Set<() => void>();

  function emit() {
    for (const listener of listeners) listener();
  }

  function setStuck(next: boolean) {
    if (stuck === next) return;
    stuck = next;
    emit();
  }

  return {
    setNode(next: HTMLDivElement | null) {
      if (node === next) return;
      observer?.disconnect();
      observer = null;
      node = next;

      if (!node || typeof IntersectionObserver === "undefined") {
        setStuck(false);
        return;
      }

      observer = new IntersectionObserver(
        ([entry]) => setStuck(entry.intersectionRatio < 1),
        // Shrink the root's top edge by 1px: while pinned at top:0 the header's
        // top clips past it, dropping the ratio below 1 -> compact state.
        { threshold: [1], rootMargin: "-1px 0px 0px 0px" },
      );
      observer.observe(node);
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return stuck;
    },
    getServerSnapshot() {
      return false;
    },
  };
}

/**
 * Consistent page title block used across every app view: a Title-Case heading,
 * muted one-line description, optional meta row, and end-aligned actions. Keeps
 * spacing and hierarchy uniform per DESIGN.md (general-to-specific, no decoration).
 *
 * Sticks to the top of the scroll area and smoothly morphs into a compact bar
 * (shrunk title, frosted background, collapsed description) once the page is
 * scrolled. "Pinned" is detected by observing the header against a 1px-inset top
 * edge, so it works whether the window or an inner column owns the scroll, and
 * the header stays a single, first-in-flow element (no sentinel to disturb `space-y`).
 */
export function PageHeader({ title, description, actions, meta, className }: PageHeaderProps) {
  const storeRef = useRef<ReturnType<typeof createStickyHeaderStore> | null>(null);
  if (!storeRef.current) {
    storeRef.current = createStickyHeaderStore();
  }
  const store = storeRef.current;
  const stuck = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const headerRef = useCallback((node: HTMLDivElement | null) => store.setNode(node), [store]);

  return (
    <div
      ref={headerRef}
      className={cn(
        "sticky top-0 z-30 flex flex-col gap-4 border-b transition-[padding,background-color,border-color,box-shadow] duration-300 ease-out motion-reduce:transition-none",
        stuck
          ? "border-border bg-surface/70 py-3 pl-10 pr-4 shadow-sm backdrop-blur-md md:px-6"
          : "border-transparent py-0",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1
            className={cn(
              "font-semibold tracking-tight text-foreground transition-[font-size,line-height] duration-300 ease-out motion-reduce:transition-none",
              stuck ? "text-lg" : "text-2xl",
            )}
          >
            {title}
          </h1>
          {description ? (
            <div
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
                stuck ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
              )}
            >
              <p className="overflow-hidden text-sm text-muted">{description}</p>
            </div>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
    </div>
  );
}
