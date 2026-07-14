import { describe, expect, it } from "vitest";
import { aggregateAiReferrals, classifyReferrer } from "./ai-referrers";
import { gaugeColor } from "./report-pdf";

describe("classifyReferrer", () => {
  it("maps AI surfaces to engine labels and ignores the rest", () => {
    expect(classifyReferrer("https://chatgpt.com/")).toBe("ChatGPT");
    expect(classifyReferrer("perplexity.ai")).toBe("Perplexity");
    expect(classifyReferrer("https://gemini.google.com/app")).toBe("Gemini");
    expect(classifyReferrer("www.claude.ai")).toBe("Claude");
    expect(classifyReferrer("https://google.com/search")).toBeNull();
    expect(classifyReferrer("")).toBeNull();
  });
});

describe("aggregateAiReferrals", () => {
  it("sums sessions per engine, dropping non-AI referrers", () => {
    const counts = aggregateAiReferrals([
      { referrer: "chatgpt.com", sessions: 10 },
      { referrer: "chat.openai.com", sessions: 5 },
      { referrer: "perplexity.ai", sessions: 3 },
      { referrer: "google.com", sessions: 100 },
    ]);
    expect(counts).toEqual({ ChatGPT: 15, Perplexity: 3 });
  });
});

describe("gaugeColor", () => {
  it("follows the 80/60/40 thresholds", () => {
    expect(gaugeColor(85)).toBe("#16a34a");
    expect(gaugeColor(70)).toBe("#2563eb");
    expect(gaugeColor(45)).toBe("#7c3aed");
    expect(gaugeColor(39)).toBe("#dc2626");
    expect(gaugeColor(null)).toBe("#94a3b8");
  });
});
