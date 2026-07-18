import { describe, expect, it } from "vitest";
import {
  APP_NAV_ITEMS,
  appRouteTitle,
  isAppRouteCurrent,
} from "@/components/layout/app-navigation";

describe("app navigation", () => {
  it("keeps the primary product model to four plain destinations", () => {
    expect(APP_NAV_ITEMS.map(({ href, label }) => ({ href, label }))).toEqual([
      { href: "/dashboard", label: "Claudia" },
      { href: "/articles", label: "Content" },
      { href: "/visibility", label: "Results" },
      { href: "/settings", label: "Settings" },
    ]);
  });

  it("groups legacy detail routes under their customer-facing destination", () => {
    expect(isAppRouteCurrent("/activity", "/dashboard")).toBe(true);
    expect(isAppRouteCurrent("/topics", "/articles")).toBe(true);
    expect(isAppRouteCurrent("/reports/weekly", "/visibility")).toBe(true);
    expect(appRouteTitle("/inbox", "Sam")).toBe("Needs your input");
  });
});
