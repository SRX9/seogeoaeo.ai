import { parseHTML } from "linkedom";
import type { ContentBlock } from "./types";

/**
 * V0.2: heading-bounded content-block splitter for the citability scorer.
 * Port of `extract_content_blocks()` from
 * `inspiration-code/scripts/fetch_page.py`: strip non-content elements, walk
 * headings + content tags in document order, start a new block at each
 * heading, and drop blocks under 20 words. Elements within a block are joined
 * with "\n" (not " ") so the citability scorer's structural-readability bonus
 * for genuinely multi-element blocks fires (scorer v3: see citability.ts).
 */

const MIN_BLOCK_WORDS = 20;

function normalizeText(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

export function extractContentBlocks(html: string): ContentBlock[] {
  const { document } = parseHTML(html);

  for (const el of document.querySelectorAll("script,style,nav,footer,header,aside")) {
    el.remove();
  }

  const blocks: ContentBlock[] = [];
  let currentHeading: string | null = null;
  let currentContent: string[] = [];

  const flush = () => {
    if (currentContent.length === 0) return;
    const content = currentContent.join("\n");
    const wordCount = content.trim().split(/\s+/).length;
    if (wordCount >= MIN_BLOCK_WORDS) {
      blocks.push({ heading: currentHeading, content, word_count: wordCount });
    }
    currentContent = [];
  };

  for (const el of document.querySelectorAll(
    "h1,h2,h3,h4,h5,h6,p,ul,ol,table,blockquote",
  )) {
    if (/^h[1-6]$/i.test(el.tagName)) {
      flush();
      currentHeading = normalizeText(el.textContent);
    } else {
      const text = normalizeText(el.textContent);
      if (text) currentContent.push(text);
    }
  }
  flush();

  return blocks;
}
