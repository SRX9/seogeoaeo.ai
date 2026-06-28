"use client";

import { Avatar, Button, Dropdown, Label } from "@heroui/react";
import { AppLayout, Sidebar } from "@heroui-pro/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { authClient } from "@/lib/auth/client";
import type { SessionUser } from "@/lib/auth/session";
import { BrandSwitcher } from "@/components/brand/brand-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  ActivityIcon,
  ArticlesIcon,
  ChevronUpDownIcon,
  OverviewIcon,
  SettingsIcon,
  TopicsIcon,
} from "@/components/icons";

type BrandOption = { id: string; name: string };

const primaryNav = [
  { href: "/dashboard", label: "Overview", icon: OverviewIcon },
  { href: "/topics", label: "Topics", icon: TopicsIcon },
  { href: "/articles", label: "Articles", icon: ArticlesIcon },
  { href: "/activity", label: "Activity", icon: ActivityIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

const allNav = primaryNav;

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string) {
  return (
    name
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
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
            if (key === "sign-out") signOut();
          }}
        >
          <Dropdown.Item id="sign-out" variant="danger" textValue="Sign out">
            <Label>Sign out</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

function NavMenu({
  items,
  pathname,
  label,
}: {
  items: typeof primaryNav;
  pathname: string;
  label: string;
}) {
  return (
    <Sidebar.Menu aria-label={label}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Sidebar.MenuItem
            key={item.href}
            id={item.href}
            href={item.href}
            isCurrent={isActive(pathname, item.href)}
          >
            <Sidebar.MenuIcon>
              <Icon />
            </Sidebar.MenuIcon>
            <Sidebar.MenuLabel>{item.label}</Sidebar.MenuLabel>
          </Sidebar.MenuItem>
        );
      })}
    </Sidebar.Menu>
  );
}

function SidebarContent({
  user,
  pathname,
  brands,
  activeBrandId,
}: {
  user: SessionUser;
  pathname: string;
  brands: BrandOption[];
  activeBrandId: string | null;
}) {
  return (
    <>
      <Sidebar.Header className="flex flex-col gap-1.5">
        <BrandSwitcher brands={brands} activeBrandId={activeBrandId} />
      </Sidebar.Header>
      <Sidebar.Content>
        <Sidebar.Group>
          <NavMenu items={primaryNav} pathname={pathname} label="Primary" />
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

  // The sidebar routes through HeroUI's `navigate` (router.push), which skips
  // Next's automatic <Link> prefetch — so warm each route's chunk up front.
  useEffect(() => {
    for (const item of allNav) {
      router.prefetch(item.href);
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
              pathname={pathname}
              brands={brands}
              activeBrandId={activeBrandId}
            />
          </Sidebar>
          <Sidebar.Mobile>
            <SidebarContent
              user={user}
              pathname={pathname}
              brands={brands}
              activeBrandId={activeBrandId}
            />
          </Sidebar.Mobile>
        </>
      }
    >
      {/* No top navbar — on mobile this floating toggle opens the sidebar sheet.
          AppLayout.MenuToggle is hidden above the `md` breakpoint via CSS. */}
      <div className="fixed left-3 top-3 z-50 md:hidden">
        <AppLayout.MenuToggle tooltip="Open menu" />
      </div>
      <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-16 md:px-8 md:py-8">
        {children}
      </div>
    </AppLayout>
  );
}
