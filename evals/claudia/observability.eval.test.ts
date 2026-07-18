import { describe, expect, it } from "vitest";
import {
  assessOperationalSlos,
  type OperationalSloSnapshot,
} from "../../src/lib/observability/slos";
import { redactTraceValue } from "../../src/lib/observability/trace";
import {
  classifyOutcomeMetric,
  hasCausalBusinessSupport,
} from "../../src/lib/observability/outcomes";

const healthySnapshot: OperationalSloSnapshot = {
  scheduledPastSlo: 0,
  terminalSteps: 100,
  permanentlyFailedSteps: 0,
  oldestRetryableAgeMs: 0,
  duplicateSignals: 0,
  unverifiedActions: 0,
  rollbackFailures: 0,
  llmCalls: 100,
  llmFailures: 0,
  callbackAuthFailures: 0,
  crossTenantDenials: 0,
  actions: 10,
  actionsMissingTrace: 0,
  contentGateErrors: 0,
  creditsSpent: 100,
  hourlyCreditCeiling: 1_000,
};

describe("Claudia observability controls", () => {
  it("redacts credentials and hidden reasoning but retains decision evidence", () => {
    expect(
      redactTraceValue({
        authorization: "Bearer stolen",
        nested: {
          apiKey: "secret",
          chainOfThought: "private",
          rationale: "Policy denied",
          note: "Bearer stolen-token-value",
        },
        evidenceRefs: ["source:1"],
      }),
    ).toEqual({
      authorization: "[redacted]",
      nested: {
        apiKey: "[redacted]",
        chainOfThought: "[omitted-hidden-reasoning]",
        rationale: "Policy denied",
        note: "Bearer [redacted]",
      },
      evidenceRefs: ["source:1"],
    });
  });

  it("opens only the breached core SLOs", () => {
    expect(assessOperationalSlos(healthySnapshot).filter((item) => item.breached)).toEqual([]);
    const breached = assessOperationalSlos({
      ...healthySnapshot,
      actionsMissingTrace: 1,
      callbackAuthFailures: 20,
      creditsSpent: 1_001,
    })
      .filter((item) => item.breached)
      .map((item) => item.key);
    expect(breached).toEqual([
      "callback_auth_failures",
      "audit_completeness",
      "unexpected_spend",
    ]);
  });

  it("does not present business correlation as causal impact", () => {
    expect(classifyOutcomeMetric("task_success")).toBe("agent_correctness");
    expect(classifyOutcomeMetric("qualified_clicks")).toBe("business_effect");
    expect(
      hasCausalBusinessSupport({
        verified: true,
        baseline: { value: 10 },
        evidenceRefs: ["analytics:1"],
        holdoutGroup: null,
        confounders: {},
      }),
    ).toBe(false);
    expect(
      hasCausalBusinessSupport({
        verified: true,
        baseline: { value: 10 },
        evidenceRefs: ["analytics:1"],
        holdoutGroup: "control",
        confounders: { causalDesign: "holdout" },
      }),
    ).toBe(true);
  });
});
