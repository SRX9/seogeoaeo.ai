import { describe, expect, it } from "vitest";
import {
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

  it("groups legacy detail routes under their customer-facing destination", () => {
    expect(isAppRouteCurrent("/activity", "/dashboard")).toBe(true);
    expect(isAppRouteCurrent("/topics", "/articles")).toBe(true);
    expect(isAppRouteCurrent("/reports/weekly", "/checklist")).toBe(true);
    expect(isAppRouteCurrent("/visibility/health", "/checklist")).toBe(true);
    expect(appRouteTitle("/visibility/answers", "Sam")).toBe("Checklist");
    expect(appRouteTitle("/settings", "Sam")).toBe("Settings");
    expect(appRouteTitle("/inbox", "Sam")).toBe("Claudia");
  });
});
