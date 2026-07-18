import { describe, expect, it } from "vitest";
import {
  buildOwnerBrandProfileMemoryProjection,
  isControllingOwnerProfileCorrection,
} from "./brand-profile-memory";

describe("owner brand profile memory projection", () => {
  it("projects only explicit facts and preferences with narrow trusted owner provenance", () => {
    const observedAt = new Date("2026-07-14T12:00:00.000Z");
    const records = buildOwnerBrandProfileMemoryProjection({
      brand: { id: "brand-1", name: "Acme", updatedAt: observedAt },
      profile: {
        id: "profile-1",
        website: "https://acme.example",
        productDescription: "Billing automation",
        audience: "Finance teams",
        tone: "Direct and calm",
        seedKeywords: "invoice reminders",
        updatedAt: observedAt,
      },
    });

    expect(records).toHaveLength(6);
    expect(records.map((record) => record.memoryClass)).toEqual([
      "authoritative_fact",
      "authoritative_fact",
      "authoritative_fact",
      "preference",
      "preference",
      "preference",
    ]);
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "website",
          sourceType: "owner_input",
          creator: "owner",
          verificationState: "owner_approved",
          trustLevel: "trusted",
          expiresAt: null,
          allowedConsumers: ["planner", "research", "draft", "audit", "ask"],
        }),
        expect.objectContaining({
          field: "seed_keywords",
          allowedConsumers: ["planner", "research", "draft", "ask"],
        }),
      ]),
    );
    expect(records.every((record) => record.allowedConsumers.length < 7)).toBe(true);
    expect(records.some((record) =>
      [record.memoryClass, record.subjectKey].some((value) =>
        /permission|policy|capability/i.test(value),
      ),
    )).toBe(false);
    expect(buildOwnerBrandProfileMemoryProjection({
      brand: { id: "brand-1", name: "Acme", updatedAt: observedAt },
      profile: null,
    }).filter((record) => record.hasValue).map((record) => record.field)).toEqual(["name"]);
    expect(isControllingOwnerProfileCorrection({
      memoryClass: "correction",
      sourceType: "owner_input",
      creator: "owner",
      verificationState: "owner_approved",
      trustLevel: "trusted",
    })).toBe(true);
    expect(isControllingOwnerProfileCorrection({
      memoryClass: "correction",
      sourceType: "model_inference",
      creator: "model_inference",
      verificationState: "unverified",
      trustLevel: "untrusted",
    })).toBe(false);
  });
});
