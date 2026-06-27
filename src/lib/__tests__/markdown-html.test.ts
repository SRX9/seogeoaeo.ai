import { describe, expect, it } from "vitest";
import { markdownToHtml } from "@/lib/publishing/markdown-html";

describe("markdownToHtml", () => {
  it("converts headings and paragraphs", () => {
    const html = markdownToHtml("# Title\n\nHello world.");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<p>Hello world.</p>");
  });

  it("converts unordered and ordered lists", () => {
    const ul = markdownToHtml("- one\n- two");
    expect(ul).toContain("<ul>");
    expect(ul).toContain("<li>one</li>");
    expect(ul).toContain("</ul>");

    const ol = markdownToHtml("1. first\n2. second");
    expect(ol).toContain("<ol>");
    expect(ol).toContain("<li>first</li>");
  });

  it("converts inline emphasis, code, and links", () => {
    const html = markdownToHtml("This is **bold**, *italic*, `code`, and a [link](https://example.com).");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain('<a href="https://example.com">link</a>');
  });

  it("escapes raw HTML and preserves code fences", () => {
    const html = markdownToHtml("```\n<script>alert(1)</script>\n```");
    expect(html).toContain("<pre><code>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
