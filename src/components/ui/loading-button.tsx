"use client";

import { Button } from "@heroui/react";
import { ThinkingOrb } from "thinking-orbs";
import type { ComponentProps, ReactNode } from "react";

type LoadingButtonProps = Omit<ComponentProps<typeof Button>, "children"> & {
  /** Shows a thinking orb and blocks interaction while true. */
  isPending?: boolean;
  /** Optional label swapped in while pending (defaults to children). */
  pendingLabel?: ReactNode;
  children: ReactNode;
};

/**
 * Button with a built-in thinking-orb loader. Use anywhere a press kicks
 * off async work so the user gets immediate feedback. Pass `isPending` from the
 * relevant React Query mutation / local loading flag.
 */
export function LoadingButton({
  isPending = false,
  isDisabled,
  isIconOnly,
  pendingLabel,
  children,
  ...props
}: LoadingButtonProps) {
  return (
    <Button isPending={isPending} isDisabled={isDisabled || isPending} isIconOnly={isIconOnly} {...props}>
      <span className="inline-flex items-center gap-2">
        {isPending ? <ThinkingOrb state="working" size={20} aria-hidden /> : null}
        {isPending ? (isIconOnly ? null : (pendingLabel ?? children)) : children}
      </span>
    </Button>
  );
}
