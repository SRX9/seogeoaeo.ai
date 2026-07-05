import type { ArticleShape } from "@/lib/articles/shapes";

/**
 * C3 slop lint: pure, deterministic checks a draft must pass before it can
 * publish. Two families — a phrase blacklist (extend forever) and structure
 * smells (the shapes of text humans don't produce). Failures carry the flagged
 * excerpt so the rewrite pass can fix spans instead of regenerating.
 */

export type LintHit = {
  rule: string;
  message: string;
  /** The offending span, quoted so a targeted rewrite can find and fix it. */
  excerpt?: string;
};

export type LintResult = {
  passed: boolean;
  hits: LintHit[];
};

/** Blacklisted AI-tell phrases. Config, not logic — extend without ceremony. */
export const BANNED_PHRASES: Array<{ label: string; pattern: RegExp }> = [
  { label: "delve", pattern: /\bdelv(e|es|ing)\b/i },
  { label: "in today's … landscape/world", pattern: /\bin today'?s [\w\s'-]{0,40}(landscape|world|environment|era)\b/i },
  { label: "it's important to note", pattern: /\bit'?s (important|worth) (to note|noting)\b/i },
  { label: "unlock/unleash the power", pattern: /\b(unlock|unleash)(ing)? the (power|potential)\b/i },
  { label: "game-changer", pattern: /\bgame[- ]chang(er|ing)\b/i },
  { label: "elevate", pattern: /\belevat(e|es|ing) your\b/i },
  { label: "seamlessly", pattern: /\bseamless(ly)?\b/i },
  { label: "whether you're a … or a …", pattern: /\bwhether you'?re an? [\w\s'-]{1,50} or an? \b/i },
  { label: "in conclusion", pattern: /\bin (conclusion|summary)\b/i },
  { label: "let's dive in", pattern: /\blet'?s dive (in|into)\b|\bdive deeper into\b/i },
  { label: "navigate the complexities", pattern: /\bnavigat(e|ing) the (complexities|challenges)\b/i },
  { label: "in the realm of", pattern: /\bin the realm of\b/i },
];

/** "furthermore/moreover/additionally" are fine occasionally — cap the density. */
const CONNECTOR_PATTERN = /\b(furthermore|moreover|additionally)\b/gi;
const CONNECTORS_PER_1000_WORDS = 2;

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string; words: number }
  | { kind: "list"; items: number };

/** Minimal markdown structure read — enough for the smells, no parser dependency. */
function parseBlocks(markdown: string): Block[] {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, "");
  const blocks: Block[] = [];

  for (const raw of withoutCode.split(/\n{2,}/)) {
    const block = raw.trim();
    if (!block) continue;

    const heading = block.match(/^(#{1,6})\s+(.*)/);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      // A heading block may carry trailing paragraph lines; treat the rest as prose.
      const rest = block.split("\n").slice(1).join(" ").trim();
      if (rest) {
        blocks.push({ kind: "paragraph", text: rest, words: countWords(rest) });
      }
      continue;
    }

    const lines = block.split("\n");
    const listLines = lines.filter((line) => /^\s*([-*+]|\d+[.)])\s+/.test(line));
    if (listLines.length > 0 && listLines.length >= lines.length - 1) {
      blocks.push({ kind: "list", items: listLines.length });
      continue;
    }

    if (/^\s*\|/.test(block)) continue; // tables aren't prose

    const text = block.replace(/\n/g, " ");
    blocks.push({ kind: "paragraph", text, words: countWords(text) });
  }

  return blocks;
}

function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Sentence containing the first match — the span the rewrite pass will fix. */
function excerptAround(text: string, index: number) {
  const start = Math.max(text.lastIndexOf(".", index) + 1, text.lastIndexOf("\n", index) + 1, 0);
  const endDot = text.indexOf(".", index);
  const end = endDot === -1 ? Math.min(index + 120, text.length) : endDot + 1;
  return text.slice(start, end).trim().slice(0, 200);
}

function checkPhrases(markdown: string): LintHit[] {
  const hits: LintHit[] = [];

  for (const { label, pattern } of BANNED_PHRASES) {
    const match = pattern.exec(markdown);
    if (match) {
      hits.push({
        rule: "banned-phrase",
        message: `Blacklisted phrase: "${label}"`,
        excerpt: excerptAround(markdown, match.index),
      });
    }
  }

  const words = countWords(markdown);
  const connectors = markdown.match(CONNECTOR_PATTERN) ?? [];
  const cap = Math.max(1, Math.round((words / 1000) * CONNECTORS_PER_1000_WORDS));
  if (connectors.length > cap) {
    hits.push({
      rule: "connector-density",
      message: `"furthermore/moreover/additionally" used ${connectors.length}× — cap is ${cap} for this length`,
    });
  }

  return hits;
}

function checkStructure(blocks: Block[], shape?: ArticleShape): LintHit[] {
  const hits: LintHit[] = [];
  const paragraphs = blocks.filter((block) => block.kind === "paragraph");
  const headings = blocks.filter((block) => block.kind === "heading");
  const totalWords = paragraphs.reduce((sum, paragraph) => sum + paragraph.words, 0);

  // Near-uniform paragraph lengths: humans vary; templates don't.
  if (paragraphs.length >= 6) {
    const mean = totalWords / paragraphs.length;
    const variance =
      paragraphs.reduce((sum, p) => sum + (p.words - mean) ** 2, 0) / paragraphs.length;
    const coefficient = Math.sqrt(variance) / mean;
    if (coefficient < 0.25) {
      hits.push({
        rule: "uniform-paragraphs",
        message: "Paragraph lengths are near-identical — vary the rhythm",
      });
    }
  }

  // A heading every ~100 words is scaffolding, not structure.
  const sectionHeadings = headings.filter((heading) => heading.level >= 2);
  if (sectionHeadings.length >= 4 && totalWords / sectionHeadings.length < 100) {
    hits.push({
      rule: "heading-density",
      message: `${sectionHeadings.length} headings over ${totalWords} words — merge sections`,
    });
  }

  // The bullet-list-of-exactly-three, repeated, is the strongest tell of all.
  const threeItemLists = blocks.filter((block) => block.kind === "list" && block.items === 3);
  if (threeItemLists.length >= 3) {
    hits.push({
      rule: "triple-bullets",
      message: `${threeItemLists.length} lists of exactly three items — an AI tell; vary or merge them`,
    });
  }

  // Every H2 section within ±15% of the same length = perfect symmetry.
  const sectionSizes: number[] = [];
  let current = -1;
  for (const block of blocks) {
    if (block.kind === "heading" && block.level === 2) {
      sectionSizes.push(0);
      current = sectionSizes.length - 1;
    } else if (block.kind === "paragraph" && current >= 0) {
      sectionSizes[current] += block.words;
    }
  }
  const measured = sectionSizes.filter((size) => size > 0);
  if (measured.length >= 3) {
    const mean = measured.reduce((sum, size) => sum + size, 0) / measured.length;
    if (measured.every((size) => Math.abs(size - mean) / mean <= 0.15)) {
      hits.push({
        rule: "uniform-sections",
        message: "Every section is the same length — perfect symmetry is an AI tell",
      });
    }
  }

  // Direct-answer shape: the answer must be the first thing, before any H2.
  if (shape === "direct-answer") {
    const firstSection = blocks.findIndex(
      (block) => block.kind === "heading" && block.level >= 2,
    );
    const intro = blocks.find(
      (block, index) =>
        block.kind === "paragraph" && (firstSection === -1 || index < firstSection),
    );
    if (!intro || (intro.kind === "paragraph" && intro.words < 25)) {
      hits.push({
        rule: "missing-answer-first",
        message:
          "direct-answer shape requires the 40-60 word answer before the first section heading",
      });
    }
  }

  return hits;
}

export function lintArticle(markdown: string, shape?: ArticleShape): LintResult {
  const hits = [...checkPhrases(markdown), ...checkStructure(parseBlocks(markdown), shape)];
  return { passed: hits.length === 0, hits };
}
