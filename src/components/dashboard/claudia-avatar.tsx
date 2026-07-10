import { PenIcon } from "@/components/icons";
import { cn } from "@/lib/cn";

/**
 * Claudia's presence — a small glowing orb that reads as "your content
 * employee, at her desk." When `working` is true she comes alive with two
 * quiet loops only: a soft core breathe + one emanation ring. No sheen/orbit
 * (those fatigued on all-day "Working" status). Idle is a calm static badge.
 * Motion is CSS (globals.css) and respects prefers-reduced-motion.
 */
export function ClaudiaAvatar({
  working = false,
  className,
}: {
  working?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("relative grid size-20 shrink-0 place-items-center", className)}
      aria-hidden
    >
      {working ? (
        <span className="claudia__ring absolute inset-2 rounded-full bg-accent/20" />
      ) : null}

      <span
        className={cn(
          "relative grid size-14 place-items-center overflow-hidden rounded-full text-white shadow-lg shadow-accent/30",
          working && "claudia__core",
        )}
        style={{
          backgroundImage:
            "radial-gradient(120% 120% at 30% 25%, color-mix(in oklab, var(--color-accent) 92%, white) 0%, var(--color-accent) 45%, color-mix(in oklab, var(--color-accent) 60%, black) 100%)",
        }}
      >
        <PenIcon className="relative size-6" />
      </span>
    </div>
  );
}
