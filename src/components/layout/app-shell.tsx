"use client";

import { Avatar, Button, Dropdown, Label } from "@heroui/react";
import { AppLayout, Sidebar } from "@heroui-pro/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, type ComponentType, type ReactNode } from "react";
import { authClient } from "@/lib/auth/client";
import type { SessionUser } from "@/lib/auth/session";
import { BrandSwitcher } from "@/components/brand/brand-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  ChartBarIcon,
  ChevronUpDownIcon,
  ClaudiaIcon,
  CreditCardIcon,
  InboxIcon,
  SettingsIcon,
} from "@/components/icons";
import { WorkshopBanner } from "@/components/layout/workshop-banner";
import { useAgentStatusLabel, useInboxSummaryCount } from "@/lib/api/queries";

type BrandOption = { id: string; name: string };
type IconType = ComponentType<{ className?: string }>;
type NavLeaf = { href: string; label: string; icon: IconType };

/**
 * Agent OS primary nav — four owner surfaces only.
 * Topics, visibility depth, toolbox, and activity live under Brand → Workshop.
 */
const primaryNav: NavLeaf[] = [
  { href: "/dashboard", label: "Claudia", icon: ClaudiaIcon },
  { href: "/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/reports", label: "Reports", icon: ChartBarIcon },
  { href: "/settings", label: "Brand", icon: SettingsIcon },
];

const allHrefs = primaryNav.map((entry) => entry.href);

function matchesHref(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function activeHref(pathname: string): string | null {
  let best: string | null = null;
  for (const href of allHrefs) {
    if (matchesHref(pathname, href) && (!best || href.length > best.length)) {
      best = href;
    }
  }
  return best;
}

function initials(name: string) {
  return (
    name
      .split(" ")
      .flatMap((part) => {
        const initial = part[0];
        return initial ? [initial] : [];
      })
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U"
  );
}

function signOut() {
  authClient.signOut({
    fetchOptions: { onSuccess: () => window.location.assign("/login") },
  });
}

function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  return (
    <Dropdown>
      <Button
        variant="ghost"
        aria-label="Account menu"
        className="h-auto min-w-0 flex-1 justify-start gap-2.5 px-2 py-2"
      >
        <Avatar size="sm">
          {user.image ? <Avatar.Image alt={user.name} src={user.image} /> : null}
          <Avatar.Fallback>{initials(user.name)}</Avatar.Fallback>
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col items-start text-left">
          <span className="w-full truncate text-sm font-medium text-foreground">
            {user.name}
          </span>
          <span className="w-full truncate text-xs text-muted">{user.email}</span>
        </span>
        <ChevronUpDownIcon className="size-4 shrink-0 text-muted" />
      </Button>
      <Dropdown.Popover placement="top start">
        <Dropdown.Menu
          onAction={(key) => {
            if (key === "sign-out") {
              signOut();
            } else if (key === "billing") {
              router.push("/account");
            }
          }}
        >
          <Dropdown.Item id="billing" textValue="Billing">
            <CreditCardIcon className="size-4 text-muted" />
            <Label>Billing</Label>
          </Dropdown.Item>
          <Dropdown.Item id="sign-out" variant="danger" textValue="Sign out">
            <Label>Sign out</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

function NavMenu({
  active,
  inboxCount,
}: {
  active: string | null;
  inboxCount: number;
}) {
  return (
    <Sidebar.Menu aria-label="Primary">
      {primaryNav.map((entry) => {
        const Icon = entry.icon;
        const badge = entry.href === "/inbox" && inboxCount > 0 ? inboxCount : undefined;
        return (
          <Sidebar.MenuItem
            key={entry.href}
            id={entry.href}
            href={entry.href}
            isCurrent={active === entry.href}
            textValue={entry.label}
          >
            <Sidebar.MenuIcon>
              <Icon />
            </Sidebar.MenuIcon>
            <Sidebar.MenuLabel>{entry.label}</Sidebar.MenuLabel>
            {badge != null ? (
              <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-warning-soft-foreground">
                {badge > 9 ? "9+" : badge}
              </span>
            ) : null}
          </Sidebar.MenuItem>
        );
      })}
    </Sidebar.Menu>
  );
}

function SidebarContent({
  user,
  brands,
  activeBrandId,
  active,
  inboxCount,
  statusLabel,
}: {
  user: SessionUser;
  brands: BrandOption[];
  activeBrandId: string | null;
  active: string | null;
  inboxCount: number;
  statusLabel: string | null;
}) {
  return (
    <>
      <Sidebar.Header className="flex flex-col gap-1.5">
        <BrandSwitcher brands={brands} activeBrandId={activeBrandId} />
        {statusLabel ? (
          <p className="flex items-center gap-1.5 px-1 text-xs text-muted">
            <span
              className={
                statusLabel === "Working" || statusLabel === "Setting up"
                  ? "size-1.5 animate-pulse rounded-full bg-success"
                  : statusLabel === "Needs attention" || statusLabel === "Paused"
                    ? "size-1.5 rounded-full bg-warning"
                    : "size-1.5 rounded-full bg-success/70"
              }
              aria-hidden
            />
            <span>
              Claudia · <span className="text-foreground/80">{statusLabel}</span>
            </span>
          </p>
        ) : null}
      </Sidebar.Header>
      <Sidebar.Content>
        <Sidebar.Group>
          <NavMenu active={active} inboxCount={inboxCount} />
        </Sidebar.Group>
      </Sidebar.Content>
      <Sidebar.Footer className="gap-2">
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserMenu user={user} />
        </div>
      </Sidebar.Footer>
    </>
  );
}

type AppShellProps = {
  children: ReactNode;
  user: SessionUser;
  brands: BrandOption[];
  activeBrandId: string | null;
};

export function AppShell({ children, user, brands, activeBrandId }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const active = useMemo(() => activeHref(pathname), [pathname]);
  const inboxCount = useInboxSummaryCount();
  const statusLabel = useAgentStatusLabel();

  useEffect(() => {
    for (const href of allHrefs) {
      router.prefetch(href);
    }
  }, [router]);

  return (
    <AppLayout
      navigate={router.push}
      sidebarCollapsible="none"
      sidebar={
        <>
          <Sidebar>
            <SidebarContent
              user={user}
              brands={brands}
              activeBrandId={activeBrandId}
              active={active}
              inboxCount={inboxCount}
              statusLabel={statusLabel}
            />
          </Sidebar>
          <Sidebar.Mobile>
            <SidebarContent
              user={user}
              brands={brands}
              activeBrandId={activeBrandId}
              active={active}
              inboxCount={inboxCount}
              statusLabel={statusLabel}
            />
          </Sidebar.Mobile>
        </>
      }
    >
      <div className="fixed left-3 top-3 z-50 md:hidden">
        <AppLayout.MenuToggle tooltip="Open menu" />
      </div>
      <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-16 md:px-8 md:py-8">
        <WorkshopBanner />
        {children}
      </div>
    </AppLayout>
  );
}
