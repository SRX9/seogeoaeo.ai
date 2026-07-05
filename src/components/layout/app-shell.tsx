"use client";

import { Avatar, Button, Dropdown, Label } from "@heroui/react";
import { AppLayout, Sidebar } from "@heroui-pro/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { authClient } from "@/lib/auth/client";
import type { SessionUser } from "@/lib/auth/session";
import { BrandSwitcher } from "@/components/brand/brand-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { TOOLBOX_META } from "@/lib/visibility/toolbox-meta";
import {
  ActivityIcon,
  ChevronUpDownIcon,
  CreditCardIcon,
  GaugeIcon,
  OverviewIcon,
  PenIcon,
  SettingsIcon,
} from "@/components/icons";

type BrandOption = { id: string; name: string };
type IconType = ComponentType<{ className?: string }>;
type NavChild = { href: string; label: string };
type NavLeaf = { kind: "leaf"; href: string; label: string; icon: IconType };
type NavGroup = { kind: "group"; id: string; label: string; icon: IconType; children: NavChild[] };
type NavEntry = NavLeaf | NavGroup;

/** Concise sidebar labels for the analyzers (the Toolbox `name`s are too long for
 * a nav rail). Falls back to the registry name for any tool not listed here. */
const TOOL_NAV_LABELS: Record<string, string> = {
  "crawler-access": "AI Crawler Access",
  "content-signals": "Content Signals",
  "llms-txt": "llms.txt",
  "meta-audit": "Meta & Open Graph",
  citability: "AI Citability",
  "technical-seo": "Technical SEO",
  "schema-audit": "Schema Validator",
  "schema-generator": "JSON-LD Generator",
};

const toolChildren: NavChild[] = TOOLBOX_META.map((t) => ({
  href: `/tools/${t.slug}`,
  label: TOOL_NAV_LABELS[t.slug] ?? t.name,
}));

/** Grouped nav — Visibility (report + every analyzer) and Content Writer (Claudia's
 * topics + articles) are collapsible sections; the rest are flat. */
const primaryNav: NavEntry[] = [
  { kind: "leaf", href: "/dashboard", label: "Overview", icon: OverviewIcon },
  {
    kind: "group",
    id: "content-writer",
    label: "Content Writer",
    icon: PenIcon,
    children: [
      { href: "/topics", label: "Topics" },
      { href: "/articles", label: "Articles" },
    ],
  },
  {
    kind: "group",
    id: "visibility",
    label: "Visibility",
    icon: GaugeIcon,
    children: [
      { href: "/visibility", label: "Overview" },
      { href: "/visibility/fixes", label: "Fix queue" },
      { href: "/visibility/answers", label: "AI answers" },
      ...toolChildren,
    ],
  },
  { kind: "leaf", href: "/activity", label: "Activity", icon: ActivityIcon },
  { kind: "leaf", href: "/settings", label: "Brand settings", icon: SettingsIcon },
];

const allHrefs: string[] = primaryNav.flatMap((entry) =>
  entry.kind === "leaf" ? [entry.href] : entry.children.map((c) => c.href),
);

function matchesHref(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The single active href = the longest matching nav href, so `/visibility/fixes`
 * lights up "Fix queue" (not the shorter "/visibility" overview). */
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
  expandedKeys,
  onExpandedChange,
}: {
  active: string | null;
  expandedKeys: Set<string>;
  onExpandedChange: (keys: Set<string>) => void;
}) {
  return (
    <Sidebar.Menu
      aria-label="Primary"
      expandedKeys={expandedKeys}
      onExpandedChange={(keys) => onExpandedChange(new Set(Array.from(keys, String)))}
    >
      {primaryNav.map((entry) => {
        if (entry.kind === "leaf") {
          const Icon = entry.icon;
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
            </Sidebar.MenuItem>
          );
        }
        const Icon = entry.icon;
        return (
          <Sidebar.MenuItem key={entry.id} id={entry.id} textValue={entry.label}>
            <Sidebar.MenuIcon>
              <Icon />
            </Sidebar.MenuIcon>
            <Sidebar.MenuLabel>{entry.label}</Sidebar.MenuLabel>
            <Sidebar.MenuTrigger>
              <Sidebar.MenuIndicator />
            </Sidebar.MenuTrigger>
            <Sidebar.Submenu>
              {entry.children.map((child) => (
                <Sidebar.MenuItem
                  key={child.href}
                  id={child.href}
                  href={child.href}
                  isCurrent={active === child.href}
                  textValue={child.label}
                >
                  <Sidebar.MenuLabel>{child.label}</Sidebar.MenuLabel>
                </Sidebar.MenuItem>
              ))}
            </Sidebar.Submenu>
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
  expandedKeys,
  onExpandedChange,
}: {
  user: SessionUser;
  brands: BrandOption[];
  activeBrandId: string | null;
  active: string | null;
  expandedKeys: Set<string>;
  onExpandedChange: (keys: Set<string>) => void;
}) {
  return (
    <>
      <Sidebar.Header className="flex flex-col gap-1.5">
        <BrandSwitcher brands={brands} activeBrandId={activeBrandId} />
      </Sidebar.Header>
      <Sidebar.Content>
        <Sidebar.Group>
          <NavMenu
            active={active}
            expandedKeys={expandedKeys}
            onExpandedChange={onExpandedChange}
          />
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
  const activeGroupId = useMemo(() => {
    if (!active) return null;
    const group = primaryNav.find(
      (entry): entry is NavGroup =>
        entry.kind === "group" && entry.children.some((c) => c.href === active),
    );
    return group?.id ?? null;
  }, [active]);

  // Keep the section holding the current page open; leave the user's other
  // expand/collapse choices intact.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set(activeGroupId ? [activeGroupId] : []),
  );
  useEffect(() => {
    if (!activeGroupId) return;
    setExpandedKeys((prev) => (prev.has(activeGroupId) ? prev : new Set(prev).add(activeGroupId)));
  }, [activeGroupId]);

  // The sidebar routes through HeroUI's `navigate` (router.push), which skips
  // Next's automatic <Link> prefetch — so warm each route's chunk up front.
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
              expandedKeys={expandedKeys}
              onExpandedChange={setExpandedKeys}
            />
          </Sidebar>
          <Sidebar.Mobile>
            <SidebarContent
              user={user}
              brands={brands}
              activeBrandId={activeBrandId}
              active={active}
              expandedKeys={expandedKeys}
              onExpandedChange={setExpandedKeys}
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
