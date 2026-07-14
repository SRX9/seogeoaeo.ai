"use client";

import { Avatar, Button } from "@heroui/react";
import { Sidebar } from "@heroui-pro/react";
import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import { BrandSwitcher } from "@/components/brand/brand-switcher";
import { SearchIcon } from "@/components/icons";
import {
  APP_FOOTER_ITEMS,
  APP_NAV_ITEMS,
  type AppNavItem,
  isAppRouteCurrent,
} from "@/components/layout/app-navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import type { SessionUser } from "@/lib/auth/session";
import {
  useAgentState,
  useDashboard,
  useInbox,
  useInboxSummaryCount,
  prefetchRouteQueries,
} from "@/lib/api/queries";
import { cn } from "@/lib/cn";

type BrandOption = {
  id: string;
  name: string;
  identity?: { logoUrl: string | null; colors: Array<{ hex: string }> } | null;
};

function initials(name: string) {
  return (
    name
      .split(" ")
      .flatMap((part) => (part[0] ? [part[0]] : []))
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U"
  );
}

function SidebarNavItem({
  item,
  pathname,
  inboxCount,
  agentState,
  onPrefetch,
  idPrefix = "",
}: {
  item: AppNavItem;
  pathname: string;
  inboxCount: number;
  agentState?: string;
  onPrefetch: (href: string) => void;
  idPrefix?: string;
}) {
  const Icon = item.icon;
  const isInbox = item.href === "/inbox";
  const isDashboard = item.href === "/dashboard";

  return (
    <Sidebar.MenuItem
      href={item.href}
      id={`${idPrefix}nav:${item.href}`}
      isCurrent={isAppRouteCurrent(pathname, item.href)}
      textValue={item.label}
      onHoverStart={() => onPrefetch(item.href)}
      onPressStart={() => onPrefetch(item.href)}
    >
      <Sidebar.MenuIcon>
        <span className="relative flex size-5 items-center justify-center">
          {isDashboard ? (
            <Image
              alt=""
              className="size-5 object-contain"
              height={20}
              sizes="20px"
              src="/claudia-bg-free-logo.png"
              width={20}
            />
          ) : (
            <Icon className="size-4" />
          )}
          {isDashboard && agentState ? (
            <span
              aria-hidden
              className={cn(
                "absolute -end-0.5 -top-0.5 size-1.5 rounded-full ring-2 ring-background",
                agentState === "working_now" && "bg-success",
                agentState === "waiting_for_you" && "bg-warning",
                agentState === "needs_attention" && "bg-danger",
                (agentState === "on_duty" || agentState === "scheduled") && "bg-accent",
                agentState === "paused" && "bg-muted",
              )}
            />
          ) : null}
        </span>
      </Sidebar.MenuIcon>
      <Sidebar.MenuLabel>{item.label}</Sidebar.MenuLabel>
      {isInbox && inboxCount > 0 ? (
        <span className="ms-auto text-xs font-semibold text-warning tabular-nums">
          {inboxCount > 99 ? "99+" : inboxCount}
        </span>
      ) : null}
    </Sidebar.MenuItem>
  );
}

function SidebarContents({
  user,
  brands,
  activeBrandId,
  inboxCount,
  agentState,
  onPrefetch,
  onOpenCommand,
  idPrefix,
}: {
  user: SessionUser;
  brands: BrandOption[];
  activeBrandId: string | null;
  inboxCount: number;
  agentState?: string;
  onPrefetch: (href: string) => void;
  onOpenCommand: () => void;
  idPrefix?: string;
}) {
  const pathname = usePathname();

  return (
    <>
      <Sidebar.Header>
        <div className="px-1 py-1" data-sidebar="label">
          <BrandSwitcher brands={brands} activeBrandId={activeBrandId} />
        </div>
      </Sidebar.Header>

      <Sidebar.Content>
        <Sidebar.Group>
          <Button
            aria-keyshortcuts="Control+K Meta+K"
            className="min-h-10 justify-start px-2 text-muted"
            fullWidth
            size="sm"
            variant="ghost"
            onPress={onOpenCommand}
          >
            <SearchIcon className="size-4 shrink-0" />
            <span
              className="flex min-w-0 flex-1 items-center justify-between gap-3"
              data-sidebar="label"
            >
              <span>Search</span>
              <span className="text-xs font-normal text-muted">Ctrl K</span>
            </span>
          </Button>
        </Sidebar.Group>
        <Sidebar.Group>
          <Sidebar.Menu aria-label="Workspace navigation">
            {APP_NAV_ITEMS.map((item) => (
              <SidebarNavItem
                key={item.href}
                item={item}
                pathname={pathname}
                inboxCount={inboxCount}
                agentState={agentState}
                onPrefetch={onPrefetch}
                idPrefix={idPrefix}
              />
            ))}
          </Sidebar.Menu>
        </Sidebar.Group>
      </Sidebar.Content>

      <Sidebar.Footer>
        <Sidebar.Menu aria-label="Account navigation">
          {APP_FOOTER_ITEMS.map((item) => (
            <SidebarNavItem
              key={item.href}
              item={item}
              pathname={pathname}
              inboxCount={inboxCount}
              agentState={agentState}
              onPrefetch={onPrefetch}
              idPrefix={idPrefix}
            />
          ))}
        </Sidebar.Menu>
        <div className="mt-2 flex items-center gap-3 px-1 py-1">
          <Avatar className="size-9 shrink-0">
            {user.image ? <Avatar.Image alt={user.name} src={user.image} /> : null}
            <Avatar.Fallback>{initials(user.name)}</Avatar.Fallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col" data-sidebar="label">
            <span className="truncate text-sm font-medium leading-tight text-foreground">
              {user.name}
            </span>
            <span className="truncate text-xs font-medium leading-tight text-muted">
              {user.email}
            </span>
          </div>
          <ThemeToggle className="size-9 shrink-0" />
        </div>
      </Sidebar.Footer>
    </>
  );
}

export function AppSidebar({
  user,
  brands,
  activeBrandId,
  onOpenCommand,
}: {
  user: SessionUser;
  brands: BrandOption[];
  activeBrandId: string | null;
  onOpenCommand: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isDashboard = pathname === "/dashboard";
  const isInbox = pathname === "/inbox";
  const dashboard = useDashboard({ enabled: false });
  const inbox = useInbox({ enabled: isInbox });
  const shellInboxCount = useInboxSummaryCount(!isDashboard && !isInbox);
  const shellState = useAgentState(!isDashboard && !isInbox).data;
  const inboxCount = isDashboard
    ? (dashboard.data?.inboxCount ?? 0)
    : isInbox
      ? (inbox.data?.inboxCount ?? 0)
      : shellInboxCount;
  const agent = isDashboard ? dashboard.data?.agent : isInbox ? inbox.data?.agent : shellState;

  const prefetch = useCallback(
    (path: string) => {
      router.prefetch(path);
      void prefetchRouteQueries(queryClient, path, activeBrandId);
    },
    [activeBrandId, queryClient, router],
  );

  const props = {
    user,
    brands,
    activeBrandId,
    inboxCount,
    agentState: agent?.presence.id,
    onPrefetch: prefetch,
    onOpenCommand,
  };

  return (
    <>
      <Sidebar>
        <SidebarContents {...props} />
      </Sidebar>
      <Sidebar.Mobile>
        <SidebarContents {...props} idPrefix="mobile-" />
      </Sidebar.Mobile>
    </>
  );
}
