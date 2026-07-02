import type {
  AnalyzerResult,
  BusinessType,
  LlmsTxtResult,
  PageSnapshot,
  RobotsResult,
  SubScore,
} from "@/lib/visibility/types";

/**
 * V0.3 — analyzer registry. Mirrors the 5 parallel subagents of the
 * inspiration skill; the audit Workflow `Promise.all`s over this list. All
 * stubs for now — later phases (V2+) replace each with the real scorer while
 * keeping this exact signature (dual-mode contract: the same function must be
 * callable from the Workflow, a Toolbox route, and the agent).
 */

export interface AnalyzerInput {
  homepage: PageSnapshot;
  pages: PageSnapshot[];
  robots: RobotsResult;
  llms: LlmsTxtResult;
  businessType: BusinessType;
}

export type Analyzer = (input: AnalyzerInput) => Promise<AnalyzerResult>;

function stub(key: SubScore["key"]): Analyzer {
  return async () => ({ subScore: { key, score: null }, findings: [] });
}

export const analyzers: Analyzer[] = [
  stub("citability"), // V2.1
  stub("brand"), // V5.1
  stub("eeat"), // V4.x
  stub("technical"), // V2.2
  stub("schema"), // V3.x
  stub("platform"), // V5.2
];
