import { describe, expect, it } from "vitest";
import { interpretOwnerPolicyInstruction } from "./policy-model";

describe("canonical owner policy compiler", () => {
  it.each([
    ["You can never publish articles.", "restriction"],
    ["You may not publish without my approval.", "restriction"],
    ["You can draft, but do not publish.", "restriction"],
    ["Do not automatically update competitor pages.", "restriction"],
    ["Publish only to WordPress, never to dev.to.", "restriction"],
    ["You may publish this one article after I approve the final version.", "permission_proposal"],
    ["Avoid medical claims, but you can write general educational content.", "restriction"],
  ] as const)("fails closed for %s", (instruction, expected) => {
    const result = interpretOwnerPolicyInstruction(instruction);
    expect(result.kind).toBe(expected);
    expect(result.policies.length).toBeGreaterThan(0);
  });

  it("returns ambiguous without a policy for a true same-scope conflict", () => {
    const result = interpretOwnerPolicyInstruction("You may publish, but do not publish.");
    expect(result).toMatchObject({ kind: "ambiguous", policies: [] });
  });
});
