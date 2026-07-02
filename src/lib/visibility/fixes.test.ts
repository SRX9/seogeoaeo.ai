import { describe, expect, it } from "vitest";
import { detectShape, optimizeAnswerBlock } from "./fixes";

const HIGH =
  "Content marketing is a strategic approach focused on creating valuable content. " +
  "According to Gartner, 60% of marketers say it drives demand. In 2024, teams that published " +
  "weekly grew traffic by 30%. For example, our research analyzed 500 companies and found that " +
  "consistent publishing raised organic sessions. First, define your audience. Second, build a " +
  "calendar. Companies using HubSpot reported $2 million in pipeline. Studies show that " +
  "self-contained passages earn more citations across AI answer engines and search results today.";
const WEAK = "It is nice. They liked it. It was good.";

describe("detectShape", () => {
  it("classifies list, table, and paragraph shapes", () => {
    expect(detectShape("First, do X. Second, do Y. Steps to follow.")).toBe("list");
    expect(detectShape("Plan A vs Plan B: 10 seats vs 50 seats")).toBe("table");
    expect(detectShape("A plain descriptive sentence about the topic.")).toBe("paragraph");
  });
});

describe("optimizeAnswerBlock", () => {
  it("ships the rewrite only when citability improves", async () => {
    const fix = await optimizeAnswerBlock({ heading: "What is it?", content: WEAK }, { rewrite: async () => HIGH });
    expect(fix.improved).toBe(true);
    expect(fix.after).toBeGreaterThan(fix.before);
    expect(fix.rewrite).toBe(HIGH);
    expect(fix.fixPayload).toMatchObject({ kind: "answer_block" });
  });

  it("no-ops when the rewrite would not raise the score", async () => {
    const fix = await optimizeAnswerBlock({ heading: "What is it?", content: HIGH }, { rewrite: async () => WEAK });
    expect(fix.improved).toBe(false);
    expect(fix.rewrite).toBeNull();
    expect(fix.fixPayload).toBeNull();
    expect(fix.after).toBe(fix.before);
  });

  it("keeps the original when the rewriter throws", async () => {
    const fix = await optimizeAnswerBlock(
      { heading: null, content: HIGH },
      { rewrite: async () => { throw new Error("llm down"); } },
    );
    expect(fix.improved).toBe(false);
    expect(fix.rewrite).toBeNull();
  });
});
