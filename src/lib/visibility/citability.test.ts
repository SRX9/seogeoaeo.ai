import { describe, expect, it } from "vitest";
import { analyzePageCitability, scorePassage } from "./citability";

/**
 * Golden tests: locked against scorer v3 (see version.ts / citability.ts).
 * v3 diverges deliberately from the Python reference: single sentence-initial
 * capitalized words no longer count as named entities. If a score drifts
 * unexpectedly, the deterministic scorer changed: bump SCORER_VERSION and
 * recompute these on purpose, don't weaken the assertions.
 */

const HIGH =
  "Content marketing is a strategic approach focused on creating valuable content. " +
  "According to Gartner, 60% of marketers say it drives demand. In 2024, teams that published " +
  "weekly grew traffic by 30%. For example, our research analyzed 500 companies and found that " +
  "consistent publishing raised organic sessions. First, define your audience. Second, build a " +
  "calendar. Companies using HubSpot reported $2 million in pipeline. Studies show that " +
  "self-contained passages earn more citations across AI answer engines and search results today.";

const THIN = "It is nice. They liked it.";

const MED =
  "Search engine optimization helps websites rank higher. The process involves keyword research, " +
  "technical fixes, and content. Google rewards fast, relevant pages. Many teams struggle with it.";

describe("scorePassage (locked against scorer v3)", () => {
  it("HIGH passage → 73 / grade B", () => {
    const r = scorePassage(HIGH, "What is content marketing?");
    expect(r.word_count).toBe(78);
    expect(r.total_score).toBe(73);
    expect(r.grade).toBe("B");
    expect(r.breakdown).toEqual({
      answer_block_quality: 30,
      // v3: only "Gartner" + "HubSpot" count (sentence-initial words dropped) → 9, was 12.
      self_containment: 9,
      structural_readability: 9,
      statistical_density: 15,
      uniqueness_signals: 10,
    });
  });

  it("THIN passage → 17 / grade F", () => {
    const r = scorePassage(THIN);
    expect(r.total_score).toBe(17);
    expect(r.grade).toBe("F");
    expect(r.breakdown.answer_block_quality).toBe(15);
  });

  it("MED passage → 17 / grade F", () => {
    const r = scorePassage(MED, "SEO basics");
    expect(r.word_count).toBe(26);
    expect(r.total_score).toBe(17);
    expect(r.breakdown).toEqual({
      answer_block_quality: 8,
      // v3: "Search"/"The"/"Google"/"Many" are all sentence-initial → 0 entity credit, was 12.
      self_containment: 5,
      structural_readability: 2,
      statistical_density: 2,
      uniqueness_signals: 0,
    });
  });

  it("is fully deterministic (same input → same score)", () => {
    expect(scorePassage(HIGH, "?")).toEqual(scorePassage(HIGH, "?"));
  });

  it("all five caps are respected", () => {
    const r = scorePassage(HIGH, "What is content marketing?");
    expect(r.breakdown.answer_block_quality).toBeLessThanOrEqual(30);
    expect(r.breakdown.self_containment).toBeLessThanOrEqual(25);
    expect(r.breakdown.structural_readability).toBeLessThanOrEqual(20);
    expect(r.breakdown.statistical_density).toBeLessThanOrEqual(15);
    expect(r.breakdown.uniqueness_signals).toBeLessThanOrEqual(10);
  });
});

describe("countProperNouns (v3: sentence-initial single words aren't entities)", () => {
  // Identical prose with no pronouns and word count <30, so self_containment
  // isolates the proper-noun credit (word-count band 0 + pronoun bonus 8).
  const generic = "Good writing explains ideas clearly. Strong structure helps readers. Careful editing removes filler.";
  const midEntity = "Good writing at Acme Corporation explains ideas clearly. Strong structure helps readers. Careful editing removes filler.";
  const leadEntity = "Acme Corporation writes clearly here. Strong structure helps readers. Careful editing removes filler.";

  it("gives no named-entity credit to single sentence-initial words", () => {
    // "Good", "Strong", "Careful" are capitalized by grammar, not entities.
    expect(scorePassage(generic).breakdown.self_containment).toBe(8);
  });

  it("credits a mid-sentence multi-word entity", () => {
    expect(scorePassage(midEntity).breakdown.self_containment).toBeGreaterThan(
      scorePassage(generic).breakdown.self_containment,
    );
  });

  it("credits a multi-word entity even at the start of a sentence", () => {
    expect(scorePassage(leadEntity).breakdown.self_containment).toBeGreaterThan(
      scorePassage(generic).breakdown.self_containment,
    );
  });
});

describe("analyzePageCitability", () => {
  const html = `<html><body>
    <h2>What is content marketing?</h2><p>${HIGH}</p>
    <h2>SEO basics</h2><p>${MED} ${MED}</p>
    <h2>Thin</h2><p>${THIN} ${THIN} ${THIN} ${THIN}</p>
  </body></html>`;

  it("scores every block and averages the top-5 (or all when fewer)", () => {
    const r = analyzePageCitability(html);
    expect(r.total_blocks_analyzed).toBe(3);
    const avg =
      r.blocks.reduce((s, b) => s + b.total_score, 0) / r.blocks.length;
    // Only 3 blocks, so page_score == average of all, rounded to 1 dp.
    expect(r.page_score).toBe(Math.round(avg * 10) / 10);
    expect(r.top_5[0].total_score).toBeGreaterThanOrEqual(r.bottom_5[0].total_score);
  });

  it("returns an empty-but-valid result for content-free HTML", () => {
    const r = analyzePageCitability("<html><body><p>hi</p></body></html>");
    expect(r.total_blocks_analyzed).toBe(0);
    expect(r.page_score).toBe(0);
    expect(r.grade_distribution).toEqual({ A: 0, B: 0, C: 0, D: 0, F: 0 });
  });
});
