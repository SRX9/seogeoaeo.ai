import { describe, expect, it } from "vitest";
import { lintArticle } from "../../src/lib/articles/style-lint";
import { authorizeAction, type AuthorityRequest } from "../../src/lib/agent/policy";
import { resolveSteeringIntent } from "../../src/lib/agent/steer";
import { isTenantScopeMatch } from "../../src/lib/agent/tenant";
import { setupRunOutcome } from "../../src/lib/jobs/setup-run-outcome";
import type { SetupStep } from "../../src/lib/jobs/setup-run-types";
import scenariosJson from "./scenarios/core-v1.json";
import { claudiaEvalScenarioSchema, type ClaudiaEvalScenario } from "./scenario.schema";

const scenarios = claudiaEvalScenarioSchema.array().parse(scenariosJson);

function evaluate(scenario: ClaudiaEvalScenario): string {
  switch (scenario.suite) {
    case "steering_permission":
      return resolveSteeringIntent(scenario.ownerInstruction);
    case "policy_decision":
      return authorizeAction({
        mode: scenario.currentState.mode === "REVIEW" ? "REVIEW" : "FULL_AUTO",
        capability: String(scenario.currentState.capability) as AuthorityRequest["capability"],
        availableCapabilities: scenario.availableTools as never[],
        riskLevel: scenario.currentState.riskLevel === "high" ? "high" : "low",
        resourceRef: `${scenario.brandFixture.brandId}:eval-resource`,
      }).decision;
    case "workflow_status":
      return setupRunOutcome(scenario.currentState.steps as SetupStep[]);
    case "content_publication_gate":
      return lintArticle(String(scenario.currentState.markdown)).passed ? "allow" : "deny";
    case "tenant_boundary":
      return isTenantScopeMatch(
        {
          workspaceId: scenario.brandFixture.workspaceId,
          brandId: scenario.brandFixture.brandId,
        },
        {
          workspaceId: String(scenario.currentState.resourceWorkspaceId),
          brandId: String(scenario.currentState.resourceBrandId),
        },
      )
        ? "allow"
        : "deny";
  }
}

describe("Claudia deterministic baseline", () => {
  it.each(scenarios)("$id", (scenario) => {
    expect(scenario.expectedDecisions).toContain(evaluate(scenario));
  });
});
