import { describe, expect, it } from "vitest";
import { normalizeNamedTags, normalizeTagSlugs, slugifyTag } from "./tags";

describe("slugifyTag", () => {
  it("lowercases and hyphenates multi-word tags", () => {
    expect(slugifyTag("Content Marketing")).toBe("content-marketing");
    expect(slugifyTag("  SEO Tips!! ")).toBe("seo-tips");
  });
});

describe("normalizeTagSlugs", () => {
  it("dedupes, caps count, and max length", () => {
    expect(
      normalizeTagSlugs(
        ["Content Marketing", "SEO Tips", "javascript", "Content Marketing", "extra", "too-many"],
        { max: 4, maxLen: 30 },
      ),
    ).toEqual(["content-marketing", "seo-tips", "javascript", "extra"]);
  });
});

describe("normalizeNamedTags", () => {
  it("keeps display names with slug keys", () => {
    expect(normalizeNamedTags(["Content Marketing", "SEO"], { max: 5 })).toEqual([
      { slug: "content-marketing", name: "Content Marketing" },
      { slug: "seo", name: "SEO" },
    ]);
  });
});
