import { PenIcon } from "@/components/icons";
import { cn } from "@/lib/cn";

/**
 * Claudia's presence on the Overview page — a small glowing orb that reads as
 * "your content employee, at her desk." When `working` is true she comes alive:
 * the core breathes, a conic sheen sweeps across it, rings emanate outward, and
 * a single dot orbits to signal live background work. When idle she's a calm,
 * static badge. All motion is CSS (see globals.css) and respects reduced-motion.
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
      {/* Emanating rings — only while she's working. */}
      {working ? (
        <>
          <span className="claudia__ring absolute inset-2 rounded-full bg-accent/25" />
          <span className="claudia__ring claudia__ring--2 absolute inset-2 rounded-full bg-accent/20" />
          <span className="claudia__ring claudia__ring--3 absolute inset-2 rounded-full bg-accent/15" />
        </>
      ) : null}

      {/* Core orb. */}
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
        {/* Rotating highlight sweep. */}
        {working ? (
          <span
            className="claudia__sheen absolute -inset-1"
            style={{
              backgroundImage:
                "conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.45) 60deg, transparent 140deg)",
            }}
          />
        ) : null}
        <PenIcon className="relative size-6" />
      </span>

      {/* Orbiting activity dot. */}
      {working ? (
        <span className="claudia__orbit pointer-events-none absolute inset-0">
          <span className="absolute left-1/2 top-0.5 size-2.5 -translate-x-1/2 rounded-full bg-accent shadow-md shadow-accent/40" />
        </span>
      ) : null}
    </div>
  );
}
