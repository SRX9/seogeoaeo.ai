import type { ComponentType } from "react";
import {
  ArticlesIcon,
  CheckIcon,
  ClaudiaIcon,
  HelpIcon,
  PlugIcon,
  SettingsIcon,
  SupportIcon,
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

export const APP_BRAND_ITEMS: readonly AppNavItem[] = [
  { href: "/settings", label: "Brand settings", icon: SettingsIcon },
  { href: "/settings?tab=claudia", label: "Claudia settings", icon: ClaudiaIcon },
  { href: "/settings?tab=integrations", label: "Connections", icon: PlugIcon },
];

export const APP_FOOTER_ITEMS: readonly AppNavItem[] = [
  { href: "/dashboard?tour=1", label: "Product tour", icon: HelpIcon },
  { href: "/contact", label: "Contact support", icon: SupportIcon },
];

const ROUTE_TITLES = [
  { prefix: "/activity", title: "Claudia" },
  { prefix: "/work", title: "Claudia" },
  { prefix: "/topics", title: "Content" },
  { prefix: "/articles/", title: "Content" },
  { prefix: "/visibility", title: "Checklist" },
  { prefix: "/reports", title: "Checklist" },
  { prefix: "/tools", title: "Checklist" },
  { prefix: "/settings", title: "Brand settings" },
  { prefix: "/account", title: "Account" },
] as const;

export function appRouteTitle(pathname: string, firstName: string) {
  if (pathname === "/dashboard") return `Good morning, ${firstName}`;

  const exact = [...APP_NAV_ITEMS, ...APP_FOOTER_ITEMS].find(
    (item) => item.href === pathname,
  );
  if (exact) return exact.label;

  return ROUTE_TITLES.find((route) => pathname.startsWith(route.prefix))?.title ?? "Claudia";
}

export function isAppRouteCurrent(currentHref: string, href: string) {
  const current = new URL(currentHref, "https://app.local");
  const destination = new URL(href, "https://app.local");
  const pathname = current.pathname;

  if (destination.pathname === "/settings") {
    const currentTab = current.searchParams.get("tab") ?? "brand";
    const destinationTab = destination.searchParams.get("tab") ?? "brand";
    return pathname === destination.pathname && currentTab === destinationTab;
  }

  if (destination.pathname === "/account") {
    const currentTab = current.searchParams.get("tab") ?? "account";
    const destinationTab = destination.searchParams.get("tab") ?? "account";
    return pathname === destination.pathname && currentTab === destinationTab;
  }

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
