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
    <div className={cn("relative grid size-14 shrink-0 place-items-center", className)} aria-hidden>
      <span className="grid size-14 place-items-center rounded-[1.1rem] border border-border/60 bg-foreground text-background shadow-sm">
        <ClaudiaIcon className="size-6" />
      </span>
      {working ? (
        <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-surface ring-2 ring-surface">
          <span className="size-2.5 animate-pulse rounded-full bg-success" />
        </span>
      ) : null}
    </div>
  );
}
