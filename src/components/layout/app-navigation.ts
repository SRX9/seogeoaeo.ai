import type { ComponentType } from "react";
import {
  ArticlesIcon,
  CheckIcon,
  ClaudiaIcon,
  HelpIcon,
} from "@/components/icons";

export type AppNavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export const APP_NAV_ITEMS: readonly AppNavItem[] = [
  { href: "/dashboard", label: "Claudia", icon: ClaudiaIcon },
  { href: "/articles", label: "Content", icon: ArticlesIcon },
  { href: "/checklist", label: "Checklist", icon: CheckIcon },
];

export const APP_FOOTER_ITEMS: readonly AppNavItem[] = [
  { href: "/dashboard?tour=1", label: "Product tour", icon: HelpIcon },
];

const ROUTE_TITLES = [
  { prefix: "/activity", title: "Claudia" },
  { prefix: "/work", title: "Claudia" },
  { prefix: "/topics", title: "Content" },
  { prefix: "/articles/", title: "Content" },
  { prefix: "/visibility", title: "Checklist" },
  { prefix: "/reports", title: "Checklist" },
  { prefix: "/tools", title: "Checklist" },
  { prefix: "/settings", title: "Settings" },
  { prefix: "/account", title: "Settings" },
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
  if (href === "/checklist") {
    return ["/checklist", "/visibility", "/reports", "/tools"].some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
