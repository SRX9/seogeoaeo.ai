import { describe, expect, it } from "vitest";
import { assessEgressUrl, readLimitedBody } from "./egress";

describe("crawler egress boundary", () => {
  it.each([
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://169.254.169.254/latest/meta-data/",
    "https://user:pass@example.com/",
  ])("blocks unsafe target %s", async (target) => {
    const decision = await assessEgressUrl(target, {
      resolver: async () => ["8.8.8.8"],
    });
    expect(decision.allowed).toBe(false);
  });

  it("fails closed when DNS returns a private address", async () => {
    const decision = await assessEgressUrl("https://public-name.example/", {
      resolver: async () => ["10.0.0.7"],
    });
    expect(decision.reason).toBe("private_or_reserved_address");
  });

  it("stops reading before an oversized body is parsed", async () => {
    const response = new Response("x".repeat(64));
    await expect(readLimitedBody(response, 32)).rejects.toThrow("byte limit");
  });
});

