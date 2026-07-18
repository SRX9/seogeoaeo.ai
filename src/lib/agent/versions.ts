/** Independently releasable Claudia behavior components. */
export const CLAUDIA_COMPONENT_VERSIONS = {
  prompts: "claudia-prompts-v1",
  models: "claudia-model-routing-v1",
  toolSchemas: "claudia-tools-v1",
  policyParser: "claudia-policy-parser-v1",
  deterministicPolicy: "claudia-policy-v1",
  planner: "claudia-planner-v2",
  memory: "claudia-memory-v1",
  scorersGraders: "claudia-graders-v1",
  contentGates: "claudia-content-gates-v1",
  auditAnalyzers: "claudia-audit-analyzers-v1",
} as const;

export type ClaudiaComponent = keyof typeof CLAUDIA_COMPONENT_VERSIONS;
