import { extractContentBlocks } from "./blocks";

/**
 * V2.1 — AI citability / passage scorer (flagship, deterministic core IP).
 * Originally ported from `inspiration-code/scripts/citability_scorer.py`, now at
 * scorer v3 (see `version.ts`) with two deliberate divergences from the Python
 * reference: (1) proper-noun counting excludes single sentence-initial words
 * ("The", "When") which are capitalized by grammar, not because they name an
 * entity — see `countProperNouns`; (2) content blocks are newline-joined
 * (`blocks.ts`) so the structural-readability bonus for multi-element blocks
 * actually fires. Every other regex, cap, and grade band is preserved, so the
 * same HTML always yields the same score. Page aggregation follows the
 * methodology doc + V2.1 ticket: page score is the average of the top-5 blocks
 * (or all when fewer than five).
 */

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface CitabilityBreakdown {
  answer_block_quality: number;
  self_containment: number;
  structural_readability: number;
  statistical_density: number;
  uniqueness_signals: number;
}

export interface PassageScore {
  heading: string | null;
  word_count: number;
  total_score: number;
  grade: Grade;
  label: string;
  breakdown: CitabilityBreakdown;
  preview: string;
}

export interface PageCitability {
  total_blocks_analyzed: number;
  /** Average of the top-5 blocks (or all if fewer), rounded to 1 decimal. */
  page_score: number;
  optimal_length_passages: number;
  grade_distribution: Record<Grade, number>;
  top_5: PassageScore[];
  bottom_5: PassageScore[];
  blocks: PassageScore[];
}

/** Python `str.split()` semantics: collapse whitespace, drop empties. */
function words(text: string): string[] {
  const t = text.trim();
  return t ? t.split(/\s+/) : [];
}

const DEFINITION_PATTERNS = [
  /\b\w+\s+is\s+(?:a|an|the)\s/i,
  /\b\w+\s+refers?\s+to\s/i,
  /\b\w+\s+means?\s/i,
  /\b\w+\s+(?:can be |are )?defined\s+as\s/i,
  /\bin\s+(?:simple|other)\s+(?:terms|words)\s*,/i,
];

const EARLY_ANSWER_PATTERNS = [
  /\b(?:is|are|was|were|means?|refers?)\b/i,
  /\d+%/,
  /\$[\d,]+/,
  /\d+\s+(?:million|billion|thousand)/i,
];

const ATTRIBUTION =
  /(?:according to|research shows|studies? (?:show|indicate|suggest|found)|data (?:shows|indicates|suggests))/i;
const PRONOUNS =
  /\b(?:it|they|them|their|this|that|these|those|he|she|his|her)\b/gi;
const PROPER_NOUNS = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
const TRANSITIONS =
  /(?:first|second|third|finally|additionally|moreover|furthermore)/i;
const NUMBERED = /(?:\d+[.)]\s|\b(?:step|tip|point)\s+\d+)/i;
const PERCENTAGES = /\d+(?:\.\d+)?%/g;
const DOLLARS = /\$[\d,]+(?:\.\d+)?(?:\s*(?:million|billion|M|B|K))?/g;
const NUMBERS_WITH_UNIT =
  /\b\d+(?:,\d{3})*(?:\.\d+)?\s+(?:users|customers|pages|sites|companies|businesses|people|percent|times|x\b)/gi;
const YEARS = /\b20(?:2[3-6]|1\d)\b/g;
const SOURCE_PATTERNS = [
  /(?:according to|per|from|by)\s+[A-Z]/,
  /(?:Gartner|Forrester|McKinsey|Harvard|Stanford|MIT|Google|Microsoft|OpenAI|Anthropic)/,
  /\([A-Z][a-z]+(?:\s+\d{4})?\)/,
];
const ORIGINAL_RESEARCH =
  /(?:our (?:research|study|data|analysis|survey|findings)|we (?:found|discovered|analyzed|surveyed|measured))/i;
const CASE_STUDY =
  /(?:case study|for example|for instance|in practice|real-world|hands-on)/i;
const TOOL_MENTION = /(?:using|with|via|through)\s+[A-Z][a-z]+/;

function count(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

/**
 * Count named-entity-like capitalized runs. Excludes single sentence-initial
 * words (e.g. "The", "Content", "When") that are capitalized only by grammar —
 * counting those gave nearly every block false named-entity credit. A multi-word
 * run at a sentence start ("Acme Corporation …") still counts. Deterministic,
 * no dictionary (v3 divergence from the Python reference).
 */
function countProperNouns(text: string): number {
  let total = 0;
  for (const sentence of text.split(/[.!?]+/)) {
    const trimmed = sentence.replace(/^\s+/, "");
    if (!trimmed) continue;
    for (const m of trimmed.matchAll(PROPER_NOUNS)) {
      const atSentenceStart = m.index === 0;
      const isMultiWord = /\s/.test(m[0]);
      if (!atSentenceStart || isMultiWord) total++;
    }
  }
  return total;
}

/** Score a single passage for AI citability (0–100). Deterministic. */
export function scorePassage(text: string, heading: string | null = null): PassageScore {
  const wordList = words(text);
  const wordCount = wordList.length;

  // === 1. Answer Block Quality (cap 30) ===
  let abq = 0;
  if (DEFINITION_PATTERNS.some((p) => p.test(text))) abq += 15;
  const first60 = wordList.slice(0, 60).join(" ");
  if (EARLY_ANSWER_PATTERNS.some((p) => p.test(first60))) abq += 15;
  if (heading && heading.endsWith("?")) abq += 10;
  const sentences = text.split(/[.!?]+/);
  const shortClear = sentences.filter((s) => {
    const n = words(s).length;
    return n >= 5 && n <= 25;
  }).length;
  if (sentences.length) abq += Math.trunc((shortClear / sentences.length) * 10);
  if (ATTRIBUTION.test(text)) abq += 10;

  // === 2. Self-Containment (cap 25) ===
  let sc = 0;
  if (wordCount >= 134 && wordCount <= 167) sc += 10;
  else if (wordCount >= 100 && wordCount <= 200) sc += 7;
  else if (wordCount >= 80 && wordCount <= 250) sc += 4;
  else if (wordCount < 30 || wordCount > 400) sc += 0;
  else sc += 2;
  if (wordCount > 0) {
    const ratio = count(text, PRONOUNS) / wordCount;
    if (ratio < 0.02) sc += 8;
    else if (ratio < 0.04) sc += 5;
    else if (ratio < 0.06) sc += 3;
  }
  const properNouns = countProperNouns(text);
  if (properNouns >= 3) sc += 7;
  else if (properNouns >= 1) sc += 4;

  // === 3. Structural Readability (cap 20) ===
  let sr = 0;
  if (sentences.length) {
    const avg = wordCount / sentences.length;
    if (avg >= 10 && avg <= 20) sr += 8;
    else if (avg >= 8 && avg <= 25) sr += 5;
    else sr += 2;
  }
  if (TRANSITIONS.test(text)) sr += 4;
  if (NUMBERED.test(text)) sr += 4;
  if (text.includes("\n")) sr += 4;

  // === 4. Statistical Density (cap 15) ===
  let sd = 0;
  sd += Math.min(count(text, PERCENTAGES) * 3, 6);
  sd += Math.min(count(text, DOLLARS) * 3, 5);
  sd += Math.min(count(text, NUMBERS_WITH_UNIT) * 2, 4);
  if (count(text, YEARS) > 0) sd += 2;
  for (const p of SOURCE_PATTERNS) if (p.test(text)) sd += 2;

  // === 5. Uniqueness Signals (cap 10) ===
  let us = 0;
  if (ORIGINAL_RESEARCH.test(text)) us += 5;
  if (CASE_STUDY.test(text)) us += 3;
  if (TOOL_MENTION.test(text)) us += 2;

  const breakdown: CitabilityBreakdown = {
    answer_block_quality: Math.min(abq, 30),
    self_containment: Math.min(sc, 25),
    structural_readability: Math.min(sr, 20),
    statistical_density: Math.min(sd, 15),
    uniqueness_signals: Math.min(us, 10),
  };
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);

  let grade: Grade;
  let label: string;
  if (total >= 80) [grade, label] = ["A", "Highly Citable"];
  else if (total >= 65) [grade, label] = ["B", "Good Citability"];
  else if (total >= 50) [grade, label] = ["C", "Moderate Citability"];
  else if (total >= 35) [grade, label] = ["D", "Low Citability"];
  else [grade, label] = ["F", "Poor Citability"];

  return {
    heading,
    word_count: wordCount,
    total_score: total,
    grade,
    label,
    breakdown,
    preview: wordList.slice(0, 30).join(" ") + (wordCount > 30 ? "..." : ""),
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Split a page into heading-bounded blocks and score each for citability. */
export function analyzePageCitability(html: string): PageCitability {
  const blocks = extractContentBlocks(html).map((b) => scorePassage(b.content, b.heading));

  const gradeDist: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const b of blocks) gradeDist[b.grade]++;

  const byScore = [...blocks].sort((a, b) => b.total_score - a.total_score);
  const top5 = byScore.slice(0, 5);
  const bottom5 = [...blocks].sort((a, b) => a.total_score - b.total_score).slice(0, 5);
  const pageScore = top5.length
    ? round1(top5.reduce((s, b) => s + b.total_score, 0) / top5.length)
    : 0;

  return {
    total_blocks_analyzed: blocks.length,
    page_score: pageScore,
    optimal_length_passages: blocks.filter(
      (b) => b.word_count >= 134 && b.word_count <= 167,
    ).length,
    grade_distribution: gradeDist,
    top_5: top5,
    bottom_5: bottom5,
    blocks,
  };
}
