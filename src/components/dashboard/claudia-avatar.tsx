import { ClaudiaIcon } from "@/components/icons";
import { cn } from "@/lib/cn";

/**
 * Claudia's presence is deliberately operational rather than character-like.
 * The mark stays static; only a real in-flight task earns a small live signal.
 */
export function ClaudiaAvatar({
  working = false,
  className,
}: {
  working?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative grid size-12 shrink-0 place-items-center", className)} aria-hidden>
      <span className="grid size-11 place-items-center rounded-xl border border-border/70 bg-surface-secondary text-foreground">
        <ClaudiaIcon className="size-5" />
      </span>
      {working ? (
        <span className="absolute -right-0.5 -top-0.5 grid size-3 place-items-center rounded-full bg-surface ring-2 ring-surface">
          <span className="size-2 animate-pulse rounded-full bg-success" />
        </span>
      ) : null}
    </div>
  );
}
