import type { ComponentType } from "react";
import {
  ActivityIcon,
  CreditCardIcon,
  InboxIcon,
  ClaudiaIcon,
  SettingsIcon,
} from "@/components/icons";

export type AppNavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export const APP_NAV_ITEMS: readonly AppNavItem[] = [
  { href: "/dashboard", label: "Claudia", icon: ClaudiaIcon },
  { href: "/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/work", label: "Work", icon: ActivityIcon },
];

export const APP_FOOTER_ITEMS: readonly AppNavItem[] = [
  { href: "/settings", label: "Settings", icon: SettingsIcon },
  { href: "/account", label: "Account", icon: CreditCardIcon },
];

const ROUTE_TITLES = [
  { prefix: "/visibility/answers", title: "AI Answers" },
  { prefix: "/visibility/fixes", title: "Fix Queue" },
  { prefix: "/visibility/health", title: "Site Health" },
  { prefix: "/visibility/", title: "Visibility Report" },
  { prefix: "/articles/", title: "Article Editor" },
  { prefix: "/reports/", title: "Weekly Report" },
  { prefix: "/tools/explore", title: "Explore Tools" },
  { prefix: "/tools/", title: "Tool" },
] as const;

export function appRouteTitle(pathname: string, firstName: string) {
  if (pathname === "/dashboard") return `Good morning, ${firstName}`;

  const exact = [...APP_NAV_ITEMS, ...APP_FOOTER_ITEMS].find(
    (item) => item.href === pathname,
  );
  if (exact) return exact.label;

  return ROUTE_TITLES.find((route) => pathname.startsWith(route.prefix))?.title ?? "Claudia";
}

export function isAppRouteCurrent(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  if (href === "/work") {
    return [
      "/work",
      "/activity",
      "/topics",
      "/articles",
      "/visibility",
      "/reports",
      "/tools",
    ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
