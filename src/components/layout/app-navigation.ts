import type { ComponentType } from "react";
import {
  ArticlesIcon,
  ChartBarIcon,
  ClaudiaIcon,
  HelpIcon,
  SettingsIcon,
} from "@/components/icons";

export type AppNavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export const APP_NAV_ITEMS: readonly AppNavItem[] = [
  { href: "/dashboard", label: "Claudia", icon: ClaudiaIcon },
  { href: "/articles", label: "Content", icon: ArticlesIcon },
  { href: "/visibility", label: "Results", icon: ChartBarIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export const APP_FOOTER_ITEMS: readonly AppNavItem[] = [
  { href: "/dashboard?tour=1", label: "Product tour", icon: HelpIcon },
];

const ROUTE_TITLES = [
  { prefix: "/inbox", title: "Needs your input" },
  { prefix: "/activity", title: "Activity" },
  { prefix: "/work", title: "Activity" },
  { prefix: "/topics", title: "Content ideas" },
  { prefix: "/visibility/answers", title: "AI Answers" },
  { prefix: "/visibility/fixes", title: "Fix Queue" },
  { prefix: "/visibility/health", title: "Site Health" },
  { prefix: "/visibility/", title: "Visibility Report" },
  { prefix: "/articles/", title: "Article Editor" },
  { prefix: "/reports/", title: "Weekly Report" },
  { prefix: "/reports", title: "Results" },
  { prefix: "/tools/explore", title: "Explore Tools" },
  { prefix: "/tools/", title: "Tool" },
  { prefix: "/tools", title: "Advanced" },
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
  if (href === "/dashboard") {
    return ["/dashboard", "/work", "/activity"].some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }
  if (href === "/articles") {
    return ["/articles", "/topics"].some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }
  if (href === "/visibility") {
    return ["/visibility", "/reports"].some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
