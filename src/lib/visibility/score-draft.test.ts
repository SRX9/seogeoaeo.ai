import { describe, expect, it } from "vitest";
import { analyzePageCitability } from "./citability";
import { draftToHtml, scoreDraft } from "./score-draft";

const DRAFT = `## What is content marketing?

Content marketing is a strategic approach focused on creating valuable content. According to Gartner, 60% of marketers say it drives demand. In 2024, teams that published weekly grew traffic by 30%. For example, our research analyzed 500 companies and found that consistent publishing raised organic sessions. First, define your audience. Second, build a calendar. Companies using HubSpot reported $2 million in pipeline. Studies show that self-contained passages earn more citations across AI answer engines and search results today.

## Thin section

Too short.`;

describe("scoreDraft", () => {
  it("returns citability + readability for a draft", () => {
    const r = scoreDraft(DRAFT);
    expect(r.citability.total_blocks_analyzed).toBeGreaterThanOrEqual(1);
    expect(r.readability.wordCount).toBeGreaterThan(0);
    expect(r.aiContent).toBeUndefined();
  });

  it("adds the AI-content check on a deep pass", () => {
    const r = scoreDraft(DRAFT, { deep: true });
    expect(r.aiContent?.label).toBeTruthy();
  });

  it("editor citability equals the audit citability for identical content", () => {
    // The editor derives HTML the same way and reuses analyzePageCitability.
    const html = draftToHtml(DRAFT);
    expect(scoreDraft(DRAFT).citability.page_score).toBe(analyzePageCitability(html).page_score);
  });
});
