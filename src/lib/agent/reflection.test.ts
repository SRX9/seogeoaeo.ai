import { describe, expect, it, vi } from "vitest";
import {
  REFLECTION_LIFETIME_MS,
  REFLECTION_VERSION,
  resolveReflectionProposal,
  type TrustedReflectionEvidence,
} from "./reflection";

const NOW = new Date("2026-07-14T12:00:00.000Z");
const OBSERVED_AT = new Date("2026-07-12T08:30:00.000Z");
const EVIDENCE_REF = "agent_step_execution:00000000-0000-4000-8000-000000000001";
const scope = { workspaceId: "workspace:1", brandId: "brand:1" };

function proposal() {
  return {
    version: REFLECTION_VERSION,
    task: {
      taskId: "task:research",
      objectiveId: "objective:visibility",
      actionId: "action:research",
      checkpointRef: EVIDENCE_REF,
    },
    outcome: {
      status: "succeeded",
      summary: "The research refresh completed.",
      evidenceRefs: [EVIDENCE_REF],
    },
    failureCause: null,
    planAssumption: {
      statement: "The required evidence was available.",
      result: "held",
      evidenceRefs: [EVIDENCE_REF],
    },
    candidate: {
      memoryClass: "episodic_observation",
      subjectKey: "research:availability",
      statement: "The research refresh returned durable evidence.",
      content: { outcome: "complete" },
      confidence: 99,
      impactLevel: "low",
      evidenceRefs: [EVIDENCE_REF],
      allowedConsumers: ["research"],
      sensitivity: "public",
      requestedDisposition: "auto_store",
    },
  };
}

function trustedEvidence(
  observedAt = OBSERVED_AT,
  ref = EVIDENCE_REF,
): TrustedReflectionEvidence {
  return {
    ref,
    sourceType: "verified_tool",
    observedAt,
    terminalStatus: "completed",
    terminalOutcome: "completed",
    stepKey: "research:refresh",
    input: null,
    output: { result: "complete" },
    error: null,
  };
}

describe("reflection proposal resolution", () => {
  it("derives provenance and lifetime only from resolved evidence and policy", async () => {
    const resolver = vi.fn(async () => [trustedEvidence()]);
    const result = await resolveReflectionProposal(scope, proposal(), {
      resolver,
      extractionVersion: "reflection-extractor-v2",
      modelVersion: "model-v1",
      now: NOW,
    });

    expect(resolver).toHaveBeenCalledWith(scope, [EVIDENCE_REF], NOW);
    expect(result.disposition).toBe("auto_store");
    if (result.disposition !== "auto_store") return;

    expect(result.record).toMatchObject({
      sourceType: "system",
      creator: "model_inference",
      observedAt: OBSERVED_AT,
      validFrom: OBSERVED_AT,
      confidence: 60,
      verificationState: "unverified",
      impactLevel: "low",
      sensitivity: "internal",
      allowedConsumers: ["planner", "reflection", "learning"],
      trustLevel: "untrusted",
    });
    expect(result.record.sourceRef).toMatch(/^reflection:/);
    expect(result.record.expiresAt).toEqual(
      new Date(
        OBSERVED_AT.getTime() +
          REFLECTION_LIFETIME_MS.episodic_observation,
      ),
    );
  });

  it("rejects caller-supplied provenance and authority escalation", async () => {
    const resolver = vi.fn(async () => [trustedEvidence()]);
    const base = proposal();
    const legacyProvenance = {
      ...base,
      candidate: {
        ...base.candidate,
        sourceType: "verified_tool",
        observedAt: OBSERVED_AT.toISOString(),
        expiresAt: null,
      },
    };
    const authorityClass = {
      ...base,
      candidate: { ...base.candidate, memoryClass: "permission" },
    };
    const nestedGrant = {
      ...base,
      candidate: {
        ...base.candidate,
        content: { grantCapability: "article.publish" },
      },
    };

    await expect(
      resolveReflectionProposal(scope, legacyProvenance, {
        resolver,
        extractionVersion: "reflection-extractor-v2",
        now: NOW,
      }),
    ).resolves.toMatchObject({ disposition: "rejected", reason: "invalid_schema" });
    await expect(
      resolveReflectionProposal(scope, authorityClass, {
        resolver,
        extractionVersion: "reflection-extractor-v2",
        now: NOW,
      }),
    ).resolves.toMatchObject({
      disposition: "rejected",
      reason: "authority_escalation",
    });
    await expect(
      resolveReflectionProposal(scope, nestedGrant, {
        resolver,
        extractionVersion: "reflection-extractor-v2",
        now: NOW,
      }),
    ).resolves.toMatchObject({
      disposition: "rejected",
      reason: "authority_escalation",
    });
  });

  it("rejects unresolved, future, and partly stale evidence", async () => {
    await expect(
      resolveReflectionProposal(scope, proposal(), {
        resolver: async () => [],
        extractionVersion: "reflection-extractor-v2",
        now: NOW,
      }),
    ).resolves.toMatchObject({
      disposition: "rejected",
      reason: "unresolved_evidence",
    });

    await expect(
      resolveReflectionProposal(scope, proposal(), {
        resolver: async () => [trustedEvidence(new Date(NOW.getTime() + 1))],
        extractionVersion: "reflection-extractor-v2",
        now: NOW,
      }),
    ).resolves.toMatchObject({
      disposition: "rejected",
      reason: "future_evidence",
    });

    const oldRef = "agent_step_execution:00000000-0000-4000-8000-000000000002";
    const staleProposal = proposal();
    staleProposal.outcome.evidenceRefs.push(oldRef);
    staleProposal.candidate.evidenceRefs.push(oldRef);
    await expect(
      resolveReflectionProposal(scope, staleProposal, {
        resolver: async () => [
          trustedEvidence(new Date(NOW.getTime() - 86_400_000)),
          trustedEvidence(new Date(NOW.getTime() - 8 * 86_400_000), oldRef),
        ],
        extractionVersion: "reflection-extractor-v2",
        now: NOW,
      }),
    ).resolves.toMatchObject({
      disposition: "owner_review",
      reason: "stale_evidence",
    });
  });
});
