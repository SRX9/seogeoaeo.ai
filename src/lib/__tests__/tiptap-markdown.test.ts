import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { tiptapDocToMarkdown } from "@/lib/articles/tiptap-markdown";

function text(value: string, marks?: { type: string; attrs?: Record<string, unknown> }[]): JSONContent {
  return { type: "text", text: value, ...(marks ? { marks } : {}) };
}

describe("tiptapDocToMarkdown", () => {
  it("serializes headings and paragraphs", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [text("Title")] },
        { type: "paragraph", content: [text("Hello world")] },
      ],
    };
    expect(tiptapDocToMarkdown(doc)).toBe("## Title\n\nHello world");
  });

  it("serializes inline marks including links", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            text("a "),
            text("bold", [{ type: "bold" }]),
            text(" and "),
            text("link", [{ type: "link", attrs: { href: "https://x.com" } }]),
          ],
        },
      ],
    };
    expect(tiptapDocToMarkdown(doc)).toBe("a **bold** and [link](https://x.com)");
  });

  it("serializes bullet and ordered lists", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [text("one")] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [text("two")] }] },
          ],
        },
        {
          type: "orderedList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [text("first")] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [text("second")] }] },
          ],
        },
      ],
    };
    expect(tiptapDocToMarkdown(doc)).toBe("- one\n- two\n\n1. first\n2. second");
  });

  it("serializes blockquotes and code blocks", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "blockquote", content: [{ type: "paragraph", content: [text("quoted")] }] },
        { type: "codeBlock", content: [text("const a = 1;")] },
      ],
    };
    expect(tiptapDocToMarkdown(doc)).toBe("> quoted\n\n```\nconst a = 1;\n```");
  });

  it("returns empty string for empty docs", () => {
    expect(tiptapDocToMarkdown({ type: "doc", content: [] })).toBe("");
    expect(tiptapDocToMarkdown(null)).toBe("");
  });
});
