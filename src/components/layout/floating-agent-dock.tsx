"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  ChartBarIcon,
  ClaudiaIcon,
  InboxIcon,
  SettingsIcon,
} from "@/components/icons";
import { useAgentState, useInboxSummaryCount } from "@/lib/api/queries";
import { cn } from "@/lib/cn";
import { isWorkshopPath } from "@/lib/workshop/routes";

const DESTINATIONS = [
  { href: "/dashboard", label: "Claudia", icon: ClaudiaIcon },
  { href: "/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/reports", label: "Reports", icon: ChartBarIcon },
  { href: "/settings", label: "Brand", icon: SettingsIcon },
] as const;

function isCurrent(pathname: string, href: string) {
  if (href === "/settings" && isWorkshopPath(pathname)) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function FloatingAgentDock() {
  const pathname = usePathname();
  const router = useRouter();
  const inboxCount = useInboxSummaryCount();
  const state = useAgentState().data;

  useEffect(() => {
    for (const destination of DESTINATIONS) router.prefetch(destination.href);
  }, [router]);

  const stateDot = state?.presence.id;

  return (
    <nav className="agent-dock" aria-label="Primary navigation">
      <div className="agent-dock__surface">
        {DESTINATIONS.map((destination) => {
          const active = isCurrent(pathname, destination.href);
          const Icon = destination.icon;
          const count = destination.href === "/inbox" ? inboxCount : 0;
          return (
            <Link
              key={destination.href}
              href={destination.href}
              aria-current={active ? "page" : undefined}
              className={cn("agent-dock__item pressable", active && "agent-dock__item--active")}
            >
              <span className="relative flex size-5 items-center justify-center" aria-hidden>
                <Icon className="size-[18px]" />
                {destination.href === "/dashboard" && stateDot ? (
                  <span
                    className={cn(
                      "agent-dock__state-dot",
                      stateDot === "working_now" && "bg-success",
                      stateDot === "waiting_for_you" && "bg-warning",
                      stateDot === "needs_attention" && "bg-danger",
                      (stateDot === "on_duty" || stateDot === "scheduled") && "bg-accent",
                      stateDot === "paused" && "bg-muted",
                    )}
                  />
                ) : null}
                {count > 0 ? (
                  <span className="agent-dock__badge">{count > 9 ? "9+" : count}</span>
                ) : null}
              </span>
              <span>{destination.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
