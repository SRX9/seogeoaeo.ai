"use client";

import { Button, Modal } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { InsightIcon } from "@/components/icons";
import { SIGNUP_GRANT_CREDITS } from "@/lib/billing/credits";

const HISTORY_GUARD_KEY = "__claudiaOnboardingExitGuard";
const EXIT_INTENT_DELAY_MS = 1_200;

type UseOnboardingExitGuardOptions = {
  active: boolean;
  fallbackHref: string;
};

/**
 * Protects an in-progress onboarding draft without trapping the user.
 *
 * Browser back is intercepted with a same-document history sentinel, desktop
 * exit intent opens the custom reminder, and tab close/reload falls back to the
 * browser's native confirmation (custom UI is not permitted during unload).
 */
export function useOnboardingExitGuard({
  active,
  fallbackHref,
}: UseOnboardingExitGuardOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const activeRef = useRef(active);
  const bypassRef = useRef(false);
  const guardInstalledRef = useRef(false);
  const exitIntentShownRef = useRef(false);
  const mountedAtRef = useRef(0);

  const installHistoryGuard = useCallback(() => {
    if (guardInstalledRef.current) return;
    const guardState = {
      ...(window.history.state ?? {}),
      [HISTORY_GUARD_KEY]: true,
    };
    window.history.pushState(guardState, "", window.location.href);
    guardInstalledRef.current = true;
  }, []);

  useEffect(() => {
    activeRef.current = active;
    if (active && mountedAtRef.current > 0) installHistoryGuard();
  }, [active, installHistoryGuard]);

  useEffect(() => {
    mountedAtRef.current = Date.now();
    if (activeRef.current) installHistoryGuard();

    function onPopState() {
      if (!guardInstalledRef.current) return;
      if (bypassRef.current || !activeRef.current) {
        guardInstalledRef.current = false;
        return;
      }

      window.history.pushState(
        { ...(window.history.state ?? {}), [HISTORY_GUARD_KEY]: true },
        "",
        window.location.href,
      );
      setIsOpen(true);
    }

    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (bypassRef.current || !activeRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function onMouseLeave(event: MouseEvent) {
      const isLeavingViewport = event.relatedTarget === null && event.clientY <= 0;
      const hasSettled = Date.now() - mountedAtRef.current >= EXIT_INTENT_DELAY_MS;
      if (
        !isLeavingViewport ||
        !hasSettled ||
        exitIntentShownRef.current ||
        bypassRef.current ||
        !activeRef.current
      ) {
        return;
      }
      exitIntentShownRef.current = true;
      setIsOpen(true);
    }

    window.addEventListener("popstate", onPopState);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.documentElement.addEventListener("mouseleave", onMouseLeave);

    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.documentElement.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [installHistoryGuard]);

  const disarm = useCallback(() => {
    activeRef.current = false;
    setIsOpen(false);
  }, []);

  const rearm = useCallback(() => {
    bypassRef.current = false;
    activeRef.current = true;
    installHistoryGuard();
  }, [installHistoryGuard]);

  const release = useCallback(async () => {
    bypassRef.current = true;
    activeRef.current = false;
    setIsOpen(false);

    if (!guardInstalledRef.current) return;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.removeEventListener("popstate", finish);
        resolve();
      };
      window.addEventListener("popstate", finish);
      window.history.back();
      window.setTimeout(finish, 250);
    });
    guardInstalledRef.current = false;
  }, []);

  const leave = useCallback(async () => {
    await release();
    const onboardingHref = window.location.href;
    window.history.back();
    window.setTimeout(() => {
      if (window.location.href === onboardingHref) {
        window.location.assign(fallbackHref);
      }
    }, 500);
  }, [fallbackHref, release]);

  return {
    isOpen,
    open: () => setIsOpen(true),
    stay: () => setIsOpen(false),
    disarm,
    rearm,
    release,
    leave,
  };
}

export function OnboardingExitDialog({
  isOpen,
  isFirstBrand,
  remainingSteps,
  onStay,
  onLeave,
}: {
  isOpen: boolean;
  isFirstBrand: boolean;
  remainingSteps: number;
  onStay: () => void;
  onLeave: () => void;
}) {
  const remainingLabel =
    remainingSteps <= 1 ? "one final step" : `${remainingSteps} short steps`;

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      variant="blur"
      onOpenChange={(open) => {
        if (!open) onStay();
      }}
    >
      <Modal.Container placement="center">
        <Modal.Dialog className="overflow-hidden sm:max-w-[440px]">
          <Modal.CloseTrigger onPress={onStay} />
          <Modal.Header>
            <Modal.Icon className="bg-accent-soft text-accent-soft-foreground">
              <InsightIcon className="size-5" />
            </Modal.Icon>
            <Modal.Heading>
              {isFirstBrand ? "Your free credits are ready" : "Leave this setup for now?"}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="gap-4">
            {isFirstBrand ? (
              <>
                <p className="text-sm leading-6 text-muted">
                  Finish {remainingLabel} to put your signup credits to work. Your draft is saved,
                  so every answer you&apos;ve already added stays right here.
                </p>
                <div className="flex items-center justify-between gap-5 rounded-2xl bg-accent-soft px-4 py-3.5 text-accent-soft-foreground">
                  <div>
                    <p className="text-2xl font-semibold tracking-tight tabular-nums">
                      {SIGNUP_GRANT_CREDITS}
                    </p>
                    <p className="text-xs font-medium opacity-70">credits already included</p>
                  </div>
                  <p className="max-w-44 text-right text-sm leading-5">
                    Enough for your first complete article
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm leading-6 text-muted">
                Your draft is saved on this device. You can return and finish this brand setup at
                any time.
              </p>
            )}
          </Modal.Body>
          <Modal.Footer className="flex-col gap-2">
            <Button fullWidth onPress={onStay}>
              {isFirstBrand ? "Finish setup" : "Keep setting up"}
            </Button>
            <Button fullWidth variant="tertiary" onPress={onLeave}>
              Leave for now
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
