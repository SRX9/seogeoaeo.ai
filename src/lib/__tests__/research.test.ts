import { describe, expect, it } from "vitest";
import { buildSeedQueries, slugify, uniqueByTitle } from "@/lib/research/utils";

describe("research utils", () => {
  it("builds seed queries from keywords", () => {
    const queries = buildSeedQueries({
      seedKeywords: "seo automation, content marketing",
      audience: "Founders",
    });
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.some((q) => q.includes("seo automation"))).toBe(true);
  });

  it("deduplicates by title", () => {
    const items = uniqueByTitle([
      { title: "Hello World" },
      { title: "hello world" },
      { title: "Another" },
    ]);
    expect(items).toHaveLength(2);
  });

  it("slugifies titles", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
  });
});
