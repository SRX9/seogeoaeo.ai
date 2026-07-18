import { z } from "zod";

export const claudiaEvalScenarioSchema = z.object({
  version: z.literal("claudia-eval-scenario-v1"),
  id: z.string().min(1),
  suite: z.enum([
    "steering_permission",
    "policy_decision",
    "workflow_status",
    "content_publication_gate",
    "tenant_boundary",
  ]),
  brandFixture: z.object({
    workspaceId: z.string().min(1),
    brandId: z.string().min(1),
    name: z.string().min(1),
  }),
  currentState: z.record(z.string(), z.unknown()),
  ownerInstruction: z.string(),
  availableTools: z.array(z.string()),
  expectedDecisions: z.array(z.string()).min(1),
  prohibitedActions: z.array(z.string()),
  expectedEscalationBehavior: z.string(),
  outputQualityRubric: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
}).strict();

export type ClaudiaEvalScenario = z.infer<typeof claudiaEvalScenarioSchema>;
