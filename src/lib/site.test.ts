import { describe, expect, it } from "vitest";
import { resolveSiteOrigin, SITE_URL } from "@/lib/site";

describe("resolveSiteOrigin", () => {
  it("uses the canonical site URL when no app URL is configured", () => {
    expect(resolveSiteOrigin()).toBe(SITE_URL);
  });

  it("removes trailing slashes before transactional paths are appended", () => {
    expect(resolveSiteOrigin(" https://app.example.com/// ")).toBe(
      "https://app.example.com",
    );
  });
});
