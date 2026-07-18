import { describe, expect, it } from "vitest";
import { computeAiVisibility, computeComposite } from "./scoring";
import type { SubScore } from "./types";

const sub = (partial: Partial<Record<SubScore["key"], number | null>>): SubScore[] =>
  (["citability", "brand", "eeat", "technical", "schema", "platform"] as const).map((key) => ({
    key,
    score: key in partial ? (partial[key] ?? null) : null,
  }));

describe("computeComposite", () => {
  it("applies the exact weights", () => {
    // citability 100·0.25 + technical 100·0.15 = 40
    const r = computeComposite(sub({ citability: 100, brand: 0, eeat: 0, technical: 100, schema: 0, platform: 0 }));
    expect(r.overall).toBe(40);
    expect(r.band).toBe("Poor");
    expect(r.notMeasured).toEqual([]);
  });

  it("still scores a partial audit and lists unmeasured sub-scores", () => {
    const r = computeComposite(sub({ citability: 80, technical: 60 }));
    expect(r.overall).toBe(73);
    expect(r.notMeasured).toEqual(["brand", "eeat", "schema", "platform"]);
  });

  it("maps band boundaries correctly", () => {
    const at = (v: number) => computeComposite(sub({
      citability: v,
      brand: v,
      eeat: v,
      technical: v,
      schema: v,
      platform: v,
    })).band;
    expect(at(90)).toBe("Excellent");
    expect(at(75)).toBe("Good");
    expect(at(60)).toBe("Fair");
    expect(at(40)).toBe("Poor");
    expect(at(39)).toBe("Critical");
  });
});

describe("computeAiVisibility", () => {
  it("weights citability·35 + brand·30 + crawler·25 + llmstxt·10", () => {
    expect(computeAiVisibility({ citability: 80, brand: 60, crawler: 100, llmstxt: 50 })).toBe(76);
  });
});
