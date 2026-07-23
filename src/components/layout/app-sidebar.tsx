"use client";

import { Avatar, Button, Dropdown, Label } from "@heroui/react";
import { Sidebar } from "@heroui-pro/react";
import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { BrandSwitcher } from "@/components/brand/brand-switcher";
import {
  ChevronUpDownIcon,
  ClaudiaIcon,
  CreditCardIcon,
  SearchIcon,
} from "@/components/icons";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import {
  APP_BRAND_ITEMS,
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

function AccountMenu({ user }: { user: SessionUser }) {
  const router = useProgressRouter();

  return (
    <Dropdown>
      <Button
        aria-label="Open account and settings"
        className="h-auto min-h-11 min-w-0 flex-1 justify-start gap-3 px-1 py-1 transition-transform active:scale-[0.96]"
        variant="ghost"
      >
        <Avatar className="size-9 shrink-0">
          {user.image ? <Avatar.Image alt={user.name} src={user.image} /> : null}
          <Avatar.Fallback>{initials(user.name)}</Avatar.Fallback>
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col text-left" data-sidebar="label">
          <span className="truncate text-sm font-medium leading-tight text-foreground">
            {user.name}
          </span>
          <span className="truncate text-xs font-medium leading-tight text-muted">
            {user.email}
          </span>
        </span>
        <ChevronUpDownIcon className="size-4 shrink-0 text-muted" data-sidebar="label" />
      </Button>
      <Dropdown.Popover className="min-w-[240px]" placement="top start">
        <div className="px-3 pb-1 pt-2 text-xs font-medium text-muted">
          Account
        </div>
        <Dropdown.Menu onAction={(key) => router.push(String(key))}>
          <Dropdown.Item id="/settings?tab=account" textValue="Account settings">
            <ClaudiaIcon className="size-4" />
            <Label>Account settings</Label>
          </Dropdown.Item>
          <Dropdown.Item id="/settings?tab=billing" textValue="Billing">
            <CreditCardIcon className="size-4" />
            <Label>Billing</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

function SidebarNavItem({
  item,
  pathname,
  agentState,
  onPrefetch,
  idPrefix = "",
}: {
  item: AppNavItem;
  pathname: string;
  agentState?: string;
  onPrefetch: (href: string) => void;
  idPrefix?: string;
}) {
  const Icon = item.icon;
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
    </Sidebar.MenuItem>
  );
}

function SidebarContents({
  user,
  brands,
  activeBrandId,
  agentState,
  onPrefetch,
  onOpenCommand,
  idPrefix,
}: {
  user: SessionUser;
  brands: BrandOption[];
  activeBrandId: string | null;
  agentState?: string;
  onPrefetch: (href: string) => void;
  onOpenCommand: () => void;
  idPrefix?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentHref = searchParams.size
    ? `${pathname}?${searchParams.toString()}`
    : pathname;

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
                pathname={currentHref}
                agentState={agentState}
                onPrefetch={onPrefetch}
                idPrefix={idPrefix}
              />
            ))}
          </Sidebar.Menu>
        </Sidebar.Group>
        <Sidebar.Separator />
        <Sidebar.Group>
          <Sidebar.GroupLabel data-sidebar="label">Brand</Sidebar.GroupLabel>
          <Sidebar.Menu aria-label="Brand navigation">
            {APP_BRAND_ITEMS.map((item) => (
              <SidebarNavItem
                key={item.href}
                item={item}
                pathname={currentHref}
                onPrefetch={onPrefetch}
                idPrefix={idPrefix}
              />
            ))}
          </Sidebar.Menu>
        </Sidebar.Group>
      </Sidebar.Content>

      <Sidebar.Footer>
        <Sidebar.Menu aria-label="Help">
          {APP_FOOTER_ITEMS.map((item) => (
            <SidebarNavItem
              key={item.href}
              item={item}
              pathname={currentHref}
              agentState={agentState}
              onPrefetch={onPrefetch}
              idPrefix={idPrefix}
            />
          ))}
        </Sidebar.Menu>
        <div className="mt-2 flex items-center gap-2 px-1 py-1">
          <AccountMenu user={user} />
          <ThemeToggle className="shrink-0" />
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
  const dashboard = useDashboard({ enabled: false });
  const shellState = useAgentState(!isDashboard).data;
  const agent = isDashboard ? dashboard.data?.agent : shellState;

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
