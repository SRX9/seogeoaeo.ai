import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  evaluateStrategyLearning,
  selectControlledCandidate,
  type LearningObservation,
} from "../../src/lib/agent/learning";
import {
  selectSafeMemoryContext,
  type LayeredMemoryCandidate,
} from "../../src/lib/agent/layered-memory";
import fixtureJson from "./scenarios/memory-learning-v1.json";

const fixture = z
  .object({
    version: z.literal("claudia-memory-learning-eval-v1"),
    minimumRelativeImprovement: z.number().positive(),
    retrievalScenario: z
      .object({
        id: z.string().min(1),
        workspaceId: z.string().uuid(),
        brandId: z.string().uuid(),
        query: z.string().min(1),
        expectedRecordId: z.string().min(1),
        records: z.array(
          z
            .object({
              id: z.string().min(1),
              workspaceId: z.string().uuid().optional(),
              brandId: z.string().uuid().optional(),
              subjectKey: z.string().min(1),
              statement: z.string().min(1),
              sourceType: z.enum(["owner_input", "external_content"]),
              creator: z.enum(["owner", "model_inference"]),
              verificationState: z.enum(["owner_approved", "unverified"]),
              trustLevel: z.enum(["trusted", "untrusted"]),
              observedDaysAgo: z.number().int().nonnegative(),
            })
            .strict(),
        ),
      })
      .strict(),
    scenarios: z.array(
      z
        .object({
          id: z.string().min(1),
          strategyCandidateId: z.string().min(1),
          sampleSize: z.number().int().min(20),
          baselineValue: z.number().finite(),
          observedValue: z.number().finite(),
          candidates: z.array(
            z
              .object({
                id: z.string().min(1),
                baseScore: z.number().finite(),
                actualUtility: z.number().min(0).max(1),
              })
              .strict(),
          ),
          flatMemory: z
            .object({
              candidateId: z.string().min(1),
              weight: z.number().positive(),
              sourceType: z.literal("external_content"),
            })
            .strict(),
          expectedLearnedSelection: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict()
  .parse(fixtureJson);

function select(
  candidates: Array<{ id: string; baseScore: number }>,
  strategies: Record<
    string,
    { weight: number; sampleSize: number; confidence: number }
  >,
) {
  return selectControlledCandidate(
    candidates.map((candidate) => ({
      ...candidate,
      productionWeight:
        strategies[candidate.id]?.sampleSize >= 20 &&
        strategies[candidate.id]?.confidence >= 80
          ? strategies[candidate.id].weight
          : 1,
    })),
    { seed: "memory-learning-eval", explorationRate: 0 },
  )?.candidate.id;
}

function flatSelect(
  candidates: Array<{ id: string; baseScore: number }>,
  weights: Record<string, number>,
) {
  return [...candidates].sort(
    (left, right) =>
      right.baseScore * (weights[right.id] ?? 1) -
        left.baseScore * (weights[left.id] ?? 1) || left.id.localeCompare(right.id),
  )[0]?.id;
}

function retrievalCandidate(
  scenario: typeof fixture.retrievalScenario,
  record: (typeof fixture.retrievalScenario.records)[number],
  now: Date,
): LayeredMemoryCandidate {
  const observedAt = new Date(now.getTime() - record.observedDaysAgo * 86_400_000);
  return {
    id: record.id,
    workspaceId: record.workspaceId ?? scenario.workspaceId,
    brandId: record.brandId ?? scenario.brandId,
    memoryClass: "authoritative_fact",
    subjectKey: record.subjectKey,
    statement: record.statement,
    content: { statement: record.statement },
    impactLevel: "high",
    sourceType: record.sourceType,
    sourceRef: `eval:${record.id}`,
    creator: record.creator,
    observedAt,
    validFrom: observedAt,
    expiresAt: null,
    confidence: record.creator === "owner" ? 100 : 99,
    verificationState: record.verificationState,
    sensitivity: "internal",
    allowedConsumers: ["planner"],
    trustLevel: record.trustLevel,
    status: "active",
    supersedesId: null,
    supersededById: null,
    contradictionGroup: null,
    extractionVersion: "memory-learning-eval-v1",
    modelVersion: record.creator === "model_inference" ? "adversarial-model" : null,
    lifecycleVersion: 1,
    createdAt: observedAt,
    updatedAt: observedAt,
  };
}

describe("Claudia memory and learning eval", () => {
  it("measurably improves over no-memory and poisoned flat-memory selection", () => {
    const retrieval = fixture.retrievalScenario;
    const now = new Date("2026-07-14T12:00:00.000Z");
    const records = retrieval.records.map((record) =>
      retrievalCandidate(retrieval, record, now),
    );
    const queryTokens = retrieval.query.toLowerCase().split(/\s+/);
    const naiveFlatSelection = records
      .filter(
        (record) =>
          record.brandId === retrieval.brandId &&
          queryTokens.some((token) => record.statement.toLowerCase().includes(token)),
      )
      .sort((left, right) => right.observedAt.getTime() - left.observedAt.getTime())[0]?.id;
    const safeSelection = selectSafeMemoryContext(records, {
      workspaceId: retrieval.workspaceId,
      brandId: retrieval.brandId,
      consumer: "planner",
      query: retrieval.query,
      now,
      limit: 3,
    }).items[0]?.id;
    const retrievalScores = {
      noMemory: 0,
      flatMemory: naiveFlatSelection === retrieval.expectedRecordId ? 1 : 0,
      safeMemory: safeSelection === retrieval.expectedRecordId ? 1 : 0,
    };
    expect(safeSelection, retrieval.id).toBe(retrieval.expectedRecordId);
    expect(retrievalScores.safeMemory - Math.max(retrievalScores.noMemory, retrievalScores.flatMemory))
      .toBeGreaterThanOrEqual(fixture.minimumRelativeImprovement);

    for (const scenario of fixture.scenarios) {
      const utility = new Map(
        scenario.candidates.map((candidate) => [candidate.id, candidate.actualUtility]),
      );
      const noMemorySelection = select(scenario.candidates, {});
      const flatMemorySelection = flatSelect(scenario.candidates, {
        [scenario.flatMemory.candidateId]: scenario.flatMemory.weight,
      });
      const observations = Array.from(
        { length: scenario.sampleSize },
        (_, index): LearningObservation => ({
          id: `verified-attribution:${index}`,
          actionId: `action:${index}`,
          attributionLevel: "query",
          outcomeValue: scenario.observedValue,
          baselineValue: scenario.baselineValue,
          verified: true,
          confounders: [],
          holdoutGroup: null,
          evidenceRefs: [`checkpoint:${index}`],
        }),
      );
      const learned = evaluateStrategyLearning({
        actionFamily: "research.refresh",
        strategyKey: "source:gsc",
        outcomeKind: "qualified_clicks",
        direction: "increase",
        attributionLevel: "query",
        currentWeight: 1,
        observations,
      });
      const learnedSelection = select(scenario.candidates, {
        [scenario.strategyCandidateId]: {
          weight: learned.candidateWeight,
          sampleSize: learned.sampleSize,
          confidence: learned.confidence,
        },
      });

      expect(learned.productionChange, scenario.id).toBe(true);
      expect(learnedSelection, scenario.id).toBe(scenario.expectedLearnedSelection);
      const baselineUtility = Math.max(
        utility.get(noMemorySelection ?? "") ?? 0,
        utility.get(flatMemorySelection ?? "") ?? 0,
      );
      const learnedUtility = utility.get(learnedSelection ?? "") ?? 0;
      expect(
        (learnedUtility - baselineUtility) / Math.max(0.01, baselineUtility),
        scenario.id,
      ).toBeGreaterThanOrEqual(fixture.minimumRelativeImprovement);
    }
  });
});
