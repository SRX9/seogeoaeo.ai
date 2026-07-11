import { describe, expect, it } from "vitest";
import { pickShape } from "@/lib/articles/shapes";
import { BANNED_PHRASES, lintArticle } from "@/lib/articles/style-lint";
import { parseVoiceDoc, renderVoiceBlock } from "@/lib/brand/voice";

/** n distinct words: for building paragraphs with exact lengths. */
function words(n: number) {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
}

describe("pickShape", () => {
  it("maps intent to shape deterministically", () => {
    expect(pickShape({ title: "Stripe vs PayPal for freelancers" })).toBe("comparison");
    expect(pickShape({ title: "Best QuickBooks alternatives in 2026" })).toBe("comparison");
    expect(pickShape({ title: "How to automate invoice reminders" })).toBe("tutorial");
    expect(pickShape({ title: "SEO launch checklist for SaaS" })).toBe("checklist");
    expect(pickShape({ title: "Teardown: how Linear does onboarding" })).toBe("teardown");
    expect(pickShape({ title: "The future of AI search" })).toBe("opinion");
    expect(pickShape({ title: "What is answer engine optimization?" })).toBe("direct-answer");
  });

  it("uses keywords and query when the title is ambiguous", () => {
    expect(pickShape({ title: "Invoicing for agencies", query: "freshbooks vs quickbooks" })).toBe(
      "comparison",
    );
    expect(pickShape({ title: "Invoice reminders", keywords: "how to send reminders" })).toBe(
      "tutorial",
    );
  });

  it("never produces the essay: everything falls back to a real shape", () => {
    expect(pickShape({ title: "Content marketing trends" })).toBe("direct-answer");
  });
});

describe("style lint: phrase blacklist", () => {
  it("catches seeded slop phrases with excerpts for the rewrite pass", () => {
    const slop =
      "In today's fast-paced digital landscape, it's important to note that our " +
      "game-changer platform will seamlessly elevate your workflow. Let's dive in. " +
      "In conclusion, delve into the docs.";
    const result = lintArticle(slop);

    expect(result.passed).toBe(false);
    const rules = result.hits.map((hit) => hit.rule);
    expect(rules).toContain("banned-phrase");
    // Every hit carries the offending sentence so the rewrite can target it.
    for (const hit of result.hits.filter((h) => h.rule === "banned-phrase")) {
      expect(hit.excerpt).toBeTruthy();
    }
    // At least these six distinct tells are present in the fixture.
    expect(result.hits.filter((h) => h.rule === "banned-phrase").length).toBeGreaterThanOrEqual(6);
  });

  it("caps connector density instead of banning connectors outright", () => {
    const body = `${words(50)}. Furthermore, ${words(20)}. Moreover, ${words(20)}. Additionally, done.`;
    const result = lintArticle(body);
    expect(result.hits.some((hit) => hit.rule === "connector-density")).toBe(true);

    const single = `${words(500)}. Furthermore, this one is fine.`;
    expect(lintArticle(single).hits.some((hit) => hit.rule === "connector-density")).toBe(false);
  });

  it("keeps the blacklist as pure config", () => {
    expect(BANNED_PHRASES.length).toBeGreaterThanOrEqual(10);
    for (const entry of BANNED_PHRASES) {
      expect(entry.pattern).toBeInstanceOf(RegExp);
      expect(entry.label).toBeTruthy();
    }
  });
});

describe("style lint: structure smells", () => {
  it("flags near-identical paragraph lengths", () => {
    const body = Array.from({ length: 7 }, () => words(20)).join("\n\n");
    const result = lintArticle(body);
    expect(result.hits.some((hit) => hit.rule === "uniform-paragraphs")).toBe(true);
  });

  it("flags a heading every hundred words", () => {
    const body = [
      `# Title`,
      words(10),
      `## One`,
      words(10),
      `## Two`,
      words(40),
      `## Three`,
      words(20),
      `## Four`,
      words(80),
    ].join("\n\n");
    const result = lintArticle(body);
    expect(result.hits.some((hit) => hit.rule === "heading-density")).toBe(true);
  });

  it("flags repeated bullet-lists-of-exactly-three", () => {
    const list = "- one\n- two\n- three";
    const body = [words(30), list, words(40), list, words(26), list].join("\n\n");
    const result = lintArticle(body);
    expect(result.hits.some((hit) => hit.rule === "triple-bullets")).toBe(true);
  });

  it("flags perfectly symmetric section lengths", () => {
    const body = [
      `# Title`,
      words(20),
      `## One`,
      words(30),
      `## Two`,
      words(30),
      `## Three`,
      words(31),
    ].join("\n\n");
    const result = lintArticle(body);
    expect(result.hits.some((hit) => hit.rule === "uniform-sections")).toBe(true);
  });

  it("requires the answer before the first heading for direct-answer shapes", () => {
    const missingAnswer = `# What is AEO?\n\n## Background\n\n${words(60)}`;
    expect(
      lintArticle(missingAnswer, "direct-answer").hits.some(
        (hit) => hit.rule === "missing-answer-first",
      ),
    ).toBe(true);

    const answerFirst = `# What is AEO?\n\n${words(45)}\n\n## Background\n\n${words(60)}`;
    expect(
      lintArticle(answerFirst, "direct-answer").hits.some(
        (hit) => hit.rule === "missing-answer-first",
      ),
    ).toBe(false);

    // Other shapes don't carry the answer-first requirement.
    expect(
      lintArticle(missingAnswer, "tutorial").hits.some(
        (hit) => hit.rule === "missing-answer-first",
      ),
    ).toBe(false);
  });

  it("passes clean, varied human writing", () => {
    const clean = `# How we cut our invoice time by 70%

Last quarter our team spent 11 hours a week chasing invoices. We rebuilt the flow around three rules and got that down to about 3 hours: here's exactly what changed and the numbers behind it.

## The problem was batching

We used to batch invoices monthly. Clients forgot the work, questioned line items, and paid late.

Switching to per-project invoicing cut disputes nearly in half within two cycles. The finance team hated it at first. Now they don't.

## What we'd do differently

Start with the two biggest clients instead of rolling it out to everyone at once, and automate the reminder cadence from day one rather than sending reminders by hand for three months.

Try the per-project switch first: it's the highest-leverage change on this list.`;

    const result = lintArticle(clean, "direct-answer");
    expect(result.hits).toEqual([]);
    expect(result.passed).toBe(true);
  });
});

describe("voice doc", () => {
  it("parses defensively and renders only what exists", () => {
    expect(parseVoiceDoc(null)).toBeNull();
    expect(parseVoiceDoc("not json")).toBeNull();

    const voice = parseVoiceDoc(
      JSON.stringify({
        wordsWeUse: ["clients"],
        wordsWeAvoid: ["customers"],
        learnedRules: ["shorten intros"],
      }),
    );
    expect(voice).not.toBeNull();
    const block = renderVoiceBlock(voice!);
    expect(block).toContain("Words we use: clients");
    expect(block).toContain("Words we never use: customers");
    expect(block).toContain("- shorten intros");
    expect(block).not.toContain("Our stance");
  });

  it("renders null for an empty doc", () => {
    const voice = parseVoiceDoc("{}");
    expect(voice).not.toBeNull();
    expect(renderVoiceBlock(voice!)).toBeNull();
  });
});
