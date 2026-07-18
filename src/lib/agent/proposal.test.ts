import { describe, expect, it } from "vitest";
import { computeActionProposalHash } from "./proposal";

describe("action proposal hashing", () => {
  it("is stable across object key order and changes for material edits", async () => {
    const base = {
      actionType: "publish article",
      capability: "article.create",
      resourceRef: "wordpress:article:123",
      beforeState: null,
      afterState: { title: "Safe", body: "Version one" },
      destination: "wordpress",
      modelPromptVersion: "writer-v1",
      policyVersion: "claudia-policy-v1",
    };
    const same = {
      ...base,
      afterState: { body: "Version one", title: "Safe" },
    };
    const changed = {
      ...base,
      afterState: { title: "Safe", body: "Version two" },
    };
    expect(await computeActionProposalHash(base)).toBe(
      await computeActionProposalHash(same),
    );
    expect(await computeActionProposalHash(changed)).not.toBe(
      await computeActionProposalHash(base),
    );
  });
});

