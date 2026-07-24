import { describe, expect, it } from "vitest";
import {
  APP_BRAND_ITEMS,
  APP_FOOTER_ITEMS,
  APP_NAV_ITEMS,
  appRouteTitle,
  isAppRouteCurrent,
} from "@/components/layout/app-navigation";

describe("app navigation", () => {
  it("keeps the primary product model to three plain destinations", () => {
    expect(APP_NAV_ITEMS.map(({ href, label }) => ({ href, label }))).toEqual([
      { href: "/dashboard", label: "Claudia" },
      { href: "/articles", label: "Content" },
      { href: "/checklist", label: "Checklist" },
    ]);
  });

  it("keeps brand-scoped destinations in their own navigation group", () => {
    expect(APP_BRAND_ITEMS.map(({ href, label }) => ({ href, label }))).toEqual([
      { href: "/settings", label: "Brand settings" },
      { href: "/settings?tab=claudia", label: "Claudia settings" },
      { href: "/settings?tab=integrations", label: "Connections" },
    ]);
  });

  it("keeps help and support actions in the sidebar footer", () => {
    expect(APP_FOOTER_ITEMS.map(({ href, label }) => ({ href, label }))).toEqual([
      { href: "/dashboard?tour=1", label: "Product tour" },
      { href: "/contact", label: "Contact support" },
    ]);
    expect(appRouteTitle("/contact", "Sam")).toBe("Contact support");
  });

  it("groups legacy detail routes under their customer-facing destination", () => {
    expect(isAppRouteCurrent("/activity", "/dashboard")).toBe(true);
    expect(isAppRouteCurrent("/topics", "/articles")).toBe(true);
    expect(isAppRouteCurrent("/reports/weekly", "/checklist")).toBe(true);
    expect(isAppRouteCurrent("/visibility/health", "/checklist")).toBe(true);
    expect(appRouteTitle("/visibility/answers", "Sam")).toBe("Checklist");
    expect(appRouteTitle("/settings", "Sam")).toBe("Brand settings");
    expect(appRouteTitle("/account", "Sam")).toBe("Account");
    expect(appRouteTitle("/inbox", "Sam")).toBe("Claudia");
  });

  it("marks the selected brand settings tab as current", () => {
    expect(isAppRouteCurrent("/settings", "/settings")).toBe(true);
    expect(isAppRouteCurrent("/settings?tab=brand", "/settings")).toBe(true);
    expect(isAppRouteCurrent("/settings?tab=integrations", "/settings")).toBe(false);
    expect(
      isAppRouteCurrent(
        "/settings?tab=claudia",
        "/settings?tab=claudia",
      ),
    ).toBe(true);
    expect(
      isAppRouteCurrent(
        "/settings?tab=integrations",
        "/settings?tab=integrations",
      ),
    ).toBe(true);
  });

  it("marks the selected account tab as current", () => {
    expect(isAppRouteCurrent("/account", "/account")).toBe(true);
    expect(isAppRouteCurrent("/account?tab=account", "/account")).toBe(true);
    expect(isAppRouteCurrent("/account?tab=billing", "/account")).toBe(false);
    expect(
      isAppRouteCurrent(
        "/account?tab=billing",
        "/account?tab=billing",
      ),
    ).toBe(true);
  });
});
