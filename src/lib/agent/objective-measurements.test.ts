import { describe, expect, it } from "vitest";
import {
  summarizeAnswerBatch,
  summarizeCriticalCrawlerFindings,
  summarizeGroundedPublications,
} from "@/lib/agent/objective-measurements";
import {
  evaluateObjectiveProgress,
  type ObjectiveDefinition,
} from "@/lib/agent/objectives";

describe("objective metric summaries", () => {
  it("derives only complete, timely exact metrics with provenance", () => {
    const answerRows = [
      {
        id: "answer-1",
        promptId: "prompt-1",
        engine: "chatgpt",
        ranAt: new Date("2026-07-14T08:00:00.000Z"),
        brandMentioned: true,
        brandCited: false,
      },
      {
        id: "answer-2",
        promptId: "prompt-1",
        engine: "perplexity",
        ranAt: new Date("2026-07-14T08:00:01.000Z"),
        brandMentioned: false,
        brandCited: true,
      },
      {
        id: "answer-3",
        promptId: "prompt-1",
        engine: "gemini",
        ranAt: new Date("2026-07-14T08:00:01.000Z"),
        brandMentioned: false,
        brandCited: false,
      },
    ];
    const answerEvidence = {
      auditId: "audit-answers",
      monitorFinishedAt: new Date("2026-07-14T07:59:00.000Z"),
      completionReceiptId: "receipt-1",
      completionReceiptAt: new Date("2026-07-14T08:00:02.000Z"),
      activePromptIds: ["prompt-1"],
      now: new Date("2026-07-15T08:00:02.000Z"),
    };
    const cases = [
      {
        name: "latest answer batch",
        run: () => summarizeAnswerBatch(answerRows, answerEvidence),
        expected: {
          value: 66.67,
          observedAt: "2026-07-14T08:00:02.000Z",
          recordRefs: [
            "audit:audit-answers",
            "credit_ledger:receipt-1",
            "answer_run:answer-1",
            "answer_run:answer-2",
            "answer_run:answer-3",
          ],
        },
      },
      {
        name: "open critical crawler findings",
        run: () =>
          summarizeCriticalCrawlerFindings(
            { id: "audit-1", completedAt: new Date("2026-07-10T00:00:00.000Z") },
            [
              {
                id: "finding-open",
                createdAt: new Date("2026-07-11T00:00:00.000Z"),
                regressedAt: null,
                proposedAt: null,
                verifiedAt: null,
              },
              {
                id: "finding-regressed",
                createdAt: new Date("2026-07-09T00:00:00.000Z"),
                regressedAt: new Date("2026-07-12T00:00:00.000Z"),
                proposedAt: null,
                verifiedAt: null,
              },
            ],
          ),
        expected: {
          value: 2,
          observedAt: "2026-07-12T00:00:00.000Z",
          recordRefs: [
            "audit:audit-1",
            "audit_finding:finding-regressed",
            "audit_finding:finding-open",
          ],
        },
      },
      {
        name: "distinct publications with exact passing gates",
        run: () =>
          summarizeGroundedPublications([
            {
              publicationId: "publication-1",
              articleId: "article-1",
              publishedAt: new Date("2026-07-05T00:00:00.000Z"),
              gateId: "gate-1",
              gateCompletedAt: new Date("2026-07-04T00:00:00.000Z"),
            },
            {
              publicationId: "publication-2",
              articleId: "article-1",
              publishedAt: new Date("2026-07-06T00:00:00.000Z"),
              gateId: "gate-1",
              gateCompletedAt: new Date("2026-07-04T00:00:00.000Z"),
            },
            {
              publicationId: "publication-3",
              articleId: "article-2",
              publishedAt: new Date("2026-07-06T00:00:00.000Z"),
              gateId: null,
              gateCompletedAt: null,
            },
            {
              publicationId: "publication-4",
              articleId: "article-3",
              publishedAt: new Date("2026-07-06T00:00:00.000Z"),
              gateId: "gate-3",
              gateCompletedAt: new Date("2026-07-07T00:00:00.000Z"),
            },
          ]),
        expected: {
          value: 2,
          observedAt: "2026-07-07T00:00:00.000Z",
          recordRefs: [
            "article_publication:publication-4",
            "publication_gate_run:gate-3",
            "article_publication:publication-2",
            "publication_gate_run:gate-1",
            "article_publication:publication-3",
            "article_publication:publication-1",
          ],
        },
      },
    ];

    for (const testCase of cases) {
      expect(testCase.run(), testCase.name).toMatchObject(testCase.expected);
    }

    expect(
      summarizeAnswerBatch(answerRows.slice(0, 2), answerEvidence),
      "provider-incomplete batch",
    ).toBeNull();
    expect(
      summarizeAnswerBatch(answerRows, {
        ...answerEvidence,
        now: new Date("2026-08-13T08:00:02.000Z"),
      }),
      "batch at the longest cadence boundary",
    ).toBeNull();

    const objective: ObjectiveDefinition = {
      objective: "Increase eligible AI answer share.",
      metric: "ai_answer_share_percent",
      baseline: {
        value: 10,
        observedAt: "2026-07-01T00:00:00.000Z",
        sourceRefs: ["answer_run:baseline"],
      },
      target: { value: 25 },
      horizon: {
        startAt: "2026-07-01T00:00:00.000Z",
        endAt: "2026-07-31T23:59:59.000Z",
      },
      priority: 80,
      budget: { maxCredits: 100, maxRemoteWrites: 0, maxCostCents: 0 },
      constraints: [],
      allowedCapabilities: ["observe"],
      successCondition: "Reach 25% within the horizon.",
      stopCondition: "Stop at the horizon.",
    };
    for (const timing of [
      {
        observedAt: "2026-06-30T23:59:59.000Z",
        evaluatedAt: "2026-07-15T00:00:00.000Z",
        status: "in_progress",
        targetReached: false,
      },
      {
        observedAt: "2026-07-31T23:59:59.000Z",
        evaluatedAt: "2026-08-01T00:00:00.000Z",
        status: "succeeded",
        targetReached: true,
      },
      {
        observedAt: "2026-08-01T00:00:00.000Z",
        evaluatedAt: "2026-08-01T00:00:00.000Z",
        status: "expired",
        targetReached: false,
      },
    ] as const) {
      expect(
        evaluateObjectiveProgress(
          objective,
          { value: 25, observedAt: timing.observedAt },
          { at: new Date(timing.evaluatedAt) },
        ),
        `target observation ${timing.observedAt}`,
      ).toMatchObject({
        status: timing.status,
        targetReached: timing.targetReached,
      });
    }
  });
});
