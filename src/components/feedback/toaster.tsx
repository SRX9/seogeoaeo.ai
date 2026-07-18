"use client";

import { Toast } from "@heroui/react/toast";

/**
 * App-wide toast outlet. Mount once near the root so any client component can
 * call `toast.success(...)` / `toast.danger(...)` after a server action resolves.
 */
export function Toaster() {
  return <Toast.Provider placement="bottom end" />;
}
