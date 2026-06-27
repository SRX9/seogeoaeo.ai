"use client";

import { Button, Spinner } from "@heroui/react";
import type { ComponentProps, ReactNode } from "react";

type LoadingButtonProps = Omit<ComponentProps<typeof Button>, "children"> & {
  /** Shows a circular spinner and blocks interaction while true. */
  isPending?: boolean;
  /** Optional label swapped in while pending (defaults to children). */
  pendingLabel?: ReactNode;
  children: ReactNode;
};

/**
 * Button with a built-in circular loading spinner. Use anywhere a press kicks
 * off async work so the user gets immediate feedback. Pass `isPending` from the
 * relevant React Query mutation / local loading flag.
 */
export function LoadingButton({
  isPending = false,
  isDisabled,
  pendingLabel,
  children,
  ...props
}: LoadingButtonProps) {
  return (
    <Button isPending={isPending} isDisabled={isDisabled || isPending} {...props}>
      <span className="inline-flex items-center gap-2">
        {isPending ? <Spinner color="current" size="sm" /> : null}
        {isPending ? (pendingLabel ?? children) : children}
      </span>
    </Button>
  );
}
