import { describe, expect, it } from "vitest";
import { analyzePageCitability, scorePassage } from "./citability";

/**
 * Golden tests — the scores below were produced by running the reference
 * `score_passage()` from `inspiration-code/scripts/citability_scorer.py` on
 * these exact fixtures. If a score drifts, the port diverged from the source.
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

describe("scorePassage (locked against the Python reference)", () => {
  it("HIGH passage → 76 / grade B", () => {
    const r = scorePassage(HIGH, "What is content marketing?");
    expect(r.word_count).toBe(78);
    expect(r.total_score).toBe(76);
    expect(r.grade).toBe("B");
    expect(r.breakdown).toEqual({
      answer_block_quality: 30,
      self_containment: 12,
      structural_readability: 9,
      statistical_density: 15,
      uniqueness_signals: 10,
    });
  });

  it("THIN passage → 21 / grade F", () => {
    const r = scorePassage(THIN);
    expect(r.total_score).toBe(21);
    expect(r.grade).toBe("F");
    expect(r.breakdown.answer_block_quality).toBe(15);
  });

  it("MED passage → 24 / grade F", () => {
    const r = scorePassage(MED, "SEO basics");
    expect(r.word_count).toBe(26);
    expect(r.total_score).toBe(24);
    expect(r.breakdown).toEqual({
      answer_block_quality: 8,
      self_containment: 12,
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
