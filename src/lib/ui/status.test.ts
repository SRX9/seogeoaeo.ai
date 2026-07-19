import { describe, expect, it } from "vitest";
import { statusColor } from "@/lib/ui/status";

describe("statusColor", () => {
  it("separates agent activity from success and owner attention", () => {
    expect(statusColor("working_now")).toBe("accent");
    expect(statusColor("in_progress")).toBe("accent");
    expect(statusColor("waiting_for_you")).toBe("warning");
    expect(statusColor("completed")).toBe("success");
  });

  it("keeps scheduled and queued work neutral", () => {
    expect(statusColor("scheduled")).toBe("default");
    expect(statusColor("queued")).toBe("default");
  });
});
