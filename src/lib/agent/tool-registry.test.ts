import { describe, expect, it } from "vitest";
import {
  AGENT_TOOLS,
  getAgentTool,
  requireAgentTool,
} from "@/lib/agent/tool-registry";

const ID = "11111111-1111-4111-8111-111111111111";

const cases = [
  {
    name: "research.refresh",
    validInput: { budget: 2 },
    invalidInput: { budget: 101 },
    validOutput: { researchTopics: 2, topicIds: [ID] },
  },
  {
    name: "article.draft",
    validInput: { topicId: ID },
    invalidInput: { topicId: "not-a-uuid" },
    validOutput: { status: "available", articleId: ID },
  },
  {
    name: "visibility.audit.execute",
    validInput: { auditId: ID, siteUrl: "https://example.com" },
    invalidInput: { auditId: ID, siteUrl: "ftp://example.com" },
    validOutput: { ok: true, auditId: ID },
  },
  {
    name: "article.publish",
    validInput: { articleId: ID, provider: "wordpress" },
    invalidInput: { articleId: ID, provider: "unknown" },
    validOutput: {
      provider: "wordpress",
      status: "published",
      remoteRef: "https://example.com/article",
      error: null,
    },
  },
  {
    name: "connector.wordpress.article_metadata",
    validInput: { mutationId: ID },
    invalidInput: { mutationId: "not-a-uuid" },
    validOutput: { mutationId: ID, status: "verified", ok: true },
  },
] as const;

describe("agent tool registry", () => {
  it("is typed, strict, complete, and fail-closed for remote writes", () => {
    expect(new Set(AGENT_TOOLS.map((tool) => `${tool.name}@${tool.version}`)).size).toBe(
      AGENT_TOOLS.length,
    );
    expect(AGENT_TOOLS.filter((tool) => tool.plannerEligible).map((tool) => tool.name)).toEqual([
      "research.refresh",
      "article.draft",
      "visibility.audit.execute",
    ]);

    for (const example of cases) {
      const tool = getAgentTool(example.name, "1.0.0");
      expect(tool, example.name).toBeDefined();
      if (!tool) continue;

      expect(tool.inputSchema.safeParse(example.validInput).success, example.name).toBe(true);
      expect(tool.inputSchema.safeParse(example.invalidInput).success, example.name).toBe(false);
      expect(tool.outputSchema.safeParse(example.validOutput).success, example.name).toBe(true);
      expect(
        tool.inputSchema.safeParse({
          ...example.validInput,
          workspaceId: ID,
          brandId: ID,
          caller: "agent_loop",
          idempotencyKey: "untrusted",
        }).success,
        `${example.name} trusted context exclusion`,
      ).toBe(false);

      expect(tool.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(tool.estimatedCost.credits).toBeGreaterThanOrEqual(0);
      expect(tool.estimatedCost.latencyMs.upper).toBeGreaterThanOrEqual(
        tool.estimatedCost.latencyMs.typical,
      );
      expect(tool.rateLimits.maxConcurrency).toBeGreaterThan(0);
      if (tool.effect !== "read") expect(tool.idempotency.required).toBe(true);
      if (tool.effect === "remote_write" && !tool.verification.targetGrade) {
        expect(tool.plannerEligible).toBe(false);
        expect(tool.allowedCallers).not.toContain("agent_loop");
      }
    }

    expect(requireAgentTool("research.refresh", "1.0.0", "agent_loop").name).toBe(
      "research.refresh",
    );
    expect(() => requireAgentTool("article.publish", "1.0.0", "agent_loop")).toThrow(
      /cannot call|quarantined/,
    );
  });
});
