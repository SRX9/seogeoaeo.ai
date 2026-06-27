import { describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { brandProfileSchema } from "@/lib/brand/schemas";

describe("crypto", () => {
  it("round-trips encrypted secrets", () => {
    process.env.ENCRYPTION_KEY = "test-encryption-key-32-characters!";
    const encrypted = encryptSecret("super-secret-token");
    expect(encrypted).not.toContain("super-secret-token");
    expect(decryptSecret(encrypted)).toBe("super-secret-token");
  });
});

describe("brandProfileSchema", () => {
  it("accepts valid profile input", () => {
    const parsed = brandProfileSchema.safeParse({
      productDescription: "AI content SaaS",
      audience: "Founders",
      tone: "Expert",
      website: "https://example.com",
      seedKeywords: "seo, content",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid website URLs", () => {
    const parsed = brandProfileSchema.safeParse({
      website: "not-a-url",
    });
    expect(parsed.success).toBe(false);
  });
});
