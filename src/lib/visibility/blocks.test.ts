import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractContentBlocks } from "./blocks";

const FIXTURES = path.resolve(__dirname, "../../../test/fixtures/visibility");

describe("extractContentBlocks", () => {
  it("splits an article into heading-bounded blocks", () => {
    const html = readFileSync(path.join(FIXTURES, "wordpress.html"), "utf8");
    const blocks = extractContentBlocks(html);

    expect(blocks.map((b) => b.heading)).toEqual([
      "How to Choose a Standing Desk",
      "Frame stability comes first",
      "Height range and your body",
    ]);
    for (const block of blocks) {
      expect(block.word_count).toBeGreaterThanOrEqual(20);
      expect(block.content.length).toBeGreaterThan(0);
    }
  });

  it("drops blocks under 20 words and strips non-content elements", () => {
    const html = `<html><body>
      <nav><p>Home About Contact and lots of navigation words that would otherwise form a block of text</p></nav>
      <h2>Tiny section</h2>
      <p>Too short to keep.</p>
      <h2>Real section</h2>
      <p>This paragraph has enough words to clear the twenty word minimum threshold that the
      citability scorer requires for a content block to be worth scoring at all.</p>
    </body></html>`;
    const blocks = extractContentBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].heading).toBe("Real section");
  });

  it("captures leading content before any heading with a null heading", () => {
    const html = `<html><body>
      <p>An introduction paragraph that appears before any heading and contains more than
      twenty words so that it survives the minimum block length filter applied by the splitter.</p>
      <h2>First heading</h2>
      <p>Short.</p>
    </body></html>`;
    const blocks = extractContentBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].heading).toBeNull();
  });
});
