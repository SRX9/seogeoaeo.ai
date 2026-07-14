import type { ReactNode } from "react";

export function MetricCardIcon({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -bottom-6 -right-5 block h-24 w-24 rotate-[-12deg] text-foreground/[0.08] [&_svg]:size-full [&_svg]:stroke-[1.25]"
    >
      {children}
    </span>
  );
}
