import { describe, expect, it } from "vitest";
import { statusColor, statusTextClass } from "@/lib/ui/status";

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

  it("renders pending work with the active accent tone", () => {
    expect(statusColor("pending")).toBe("accent");
    expect(statusTextClass("pending")).toBe("text-[color:var(--status-claudia)]");
  });
});
